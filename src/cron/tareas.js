// Tareas automáticas programadas (cron): apertura (Fase C), cierre y resumen diario (Fase E).
const cron = require('node-cron');
const { resolverDestino, enviarMensaje } = require('../bot/client');
const empleadosQueries = require('../db/queries/empleados');
const turnosQueries = require('../db/queries/turnos');
const estadosQueries = require('../db/queries/estados');
const mensajesVistosQueries = require('../db/queries/mensajesVistos');
const cajaQueries = require('../db/queries/caja');
const aperturaFlow = require('../flows/caja');
const cierreFlow = require('../flows/cierre');
const resumenFlow = require('../flows/resumen');
const { diaSemanaHoy, sumarMinutosAHora, fechaConOffsetDias, fechaHoy, TIMEZONE } = require('../utils/fechas');
const logger = require('../utils/logger');

const DIAS_SEMANA = [1, 2, 3, 4, 5];
const DIAS_FINDE = [0, 6];

// Mapea el valor 'persona' de la tabla turnos al número real configurado en .env.
function telefonoDePersona(persona) {
  const mapa = {
    admin: process.env.ADMIN_NUMBER,
    empleado_x: process.env.EMPLEADO_X_NUMBER,
    empleado_y: process.env.EMPLEADO_Y_NUMBER,
  };
  return mapa[persona] || null;
}

/**
 * Resuelve quién hace una franja ('apertura' | 'cierre') hoy: turno -> teléfono -> empleado activo.
 * @returns {{telefono: string, empleado: object}|null}
 */
function resolverPersonaDeHoy(franja) {
  const dia = diaSemanaHoy();
  const turno = turnosQueries.buscarTurno(dia, franja);
  if (!turno) {
    logger.error(`No hay turno de ${franja} definido para el día ${dia}`);
    return null;
  }

  const telefono = telefonoDePersona(turno.persona);
  if (!telefono) {
    logger.error(`No hay número configurado para la persona '${turno.persona}'`);
    return null;
  }

  const empleado = empleadosQueries.buscarActivoPorTelefono(telefono);
  if (!empleado) {
    logger.error(
      `La persona '${turno.persona}' (${telefono}) no está registrada/activa en empleados. ` +
        'Revisá los números en .env y volvé a correr el seed.'
    );
    return null;
  }

  return { telefono, empleado };
}

/**
 * Dispara la apertura de caja para quien abre hoy según la tabla turnos.
 * Lo usan tanto el cron de las HORA_APERTURA:00 como el disparador manual de prueba.
 * @returns {Promise<boolean>} true si se inició el flujo
 */
async function dispararApertura(client) {
  const persona = resolverPersonaDeHoy('apertura');
  if (!persona) return false;

  const destino = await resolverDestino(client, persona.telefono);
  return aperturaFlow.iniciarApertura(client, destino, persona.telefono, persona.empleado);
}

/**
 * Dispara el cierre de caja para quien cierra hoy según la tabla turnos.
 * Lo usan tanto el cron de recordatorio como el disparador manual de prueba.
 * @returns {Promise<boolean>} true si se inició el flujo
 */
async function dispararCierre(client) {
  const persona = resolverPersonaDeHoy('cierre');
  if (!persona) return false;

  const destino = await resolverDestino(client, persona.telefono);
  return cierreFlow.iniciarCierre(client, destino, persona.telefono, persona.empleado);
}

// true si la persona que cierra hoy todavía tiene el flujo de cierre en curso (no completó).
function cierreSigueEnCurso(telefono) {
  const estado = estadosQueries.getEstado(telefono);
  return Boolean(estado && estado.flujo === cierreFlow.FLUJO);
}

/**
 * A CIERRE_INSISTIR_MIN minutos del cierre del local: si quien cierra hoy todavía
 * no completó el flujo, se le reenvía un recordatorio.
 */
async function insistirCierre(client) {
  const persona = resolverPersonaDeHoy('cierre');
  if (!persona) return;
  if (!cierreSigueEnCurso(persona.telefono)) return;

  const destino = await resolverDestino(client, persona.telefono);
  await enviarMensaje(
    client,
    destino,
    '⏰ Todavía no completaste el cierre de caja. Por favor mandá lo que falta (foto de MP y/o montos contados).'
  );
  logger.info(`Insistencia de cierre enviada a ${persona.empleado.nombre}`);
}

/**
 * A CIERRE_AVISAR_ADMIN_MIN minutos del cierre del local: si quien cierra hoy
 * todavía no completó el flujo, se avisa al admin (excepto si quien cierra ES el admin).
 */
async function avisarAdminCierre(client) {
  const persona = resolverPersonaDeHoy('cierre');
  if (!persona) return;
  if (!cierreSigueEnCurso(persona.telefono)) return;
  if (persona.telefono === process.env.ADMIN_NUMBER) return;

  const destinoAdmin = await resolverDestino(client, process.env.ADMIN_NUMBER);
  await enviarMensaje(client, destinoAdmin, `⚠️ ${persona.empleado.nombre} todavía no cerró la caja.`);
  logger.info(`Aviso de cierre pendiente enviado al admin (responsable: ${persona.empleado.nombre})`);
}

/**
 * A HORA_APERTURA + APERTURA_AVISAR_ADMIN_MIN: si todavía no se registró la
 * apertura de la Caja 1 hoy, avisa al admin. Espejo de avisarAdminCierre, que
 * hoy no existe para la apertura. No se avisa a sí mismo si el admin es quien
 * abre hoy según el turno.
 */
async function avisarAdminApertura(client) {
  if (cajaQueries.buscarApertura(fechaHoy(), 1)) return;

  const persona = resolverPersonaDeHoy('apertura');
  if (persona && persona.telefono === process.env.ADMIN_NUMBER) return;

  const destinoAdmin = await resolverDestino(client, process.env.ADMIN_NUMBER);
  await enviarMensaje(client, destinoAdmin, '⚠️ Todavía no se registró la apertura de la caja hoy.');
  logger.info('Aviso de apertura pendiente enviado al admin');
}

// Limpia estados de conversación abandonados hace más de ESTADO_TIMEOUT_MIN
// minutos, y de paso los registros viejos de mensajes_vistos (deduplicación,
// ver messageHandler.js) para que esa tabla no crezca para siempre.
function limpiarEstadosVencidos() {
  const vencidos = estadosQueries.listarEstadosVencidos(Number(process.env.ESTADO_TIMEOUT_MIN));
  for (const estado of vencidos) {
    estadosQueries.clearEstado(estado.telefono);
    logger.warn(
      `Estado de conversación vencido y limpiado: ${estado.telefono} (flujo=${estado.flujo}, paso=${estado.paso})`
    );
  }
  mensajesVistosQueries.limpiarAntiguos();
}

// Resume el día anterior al de hoy (en la zona de Argentina) usando fechaConOffsetDias.
// Se usa para el resumen diario: si el cron que lo dispara cruzó la medianoche
// (ej. el cierre del finde + 90 min cae al día siguiente), hay que reportar
// sobre el día que efectivamente cerró, no sobre "hoy".
async function enviarResumenDiario(client, diasOffset = 0) {
  const fecha = fechaConOffsetDias(-diasOffset);
  await resumenFlow.enviarResumenDiario(client, fecha);
}

function ejecutarYLoguearError(fn, client, descripcion, ...extraArgs) {
  return () => {
    fn(client, ...extraArgs).catch((e) => logger.error(`Error en cron de ${descripcion}: ${e.message}`));
  };
}

// Desplaza cada día de la semana de `dias` por `diasOffset` (mod 7) y los junta
// en la sintaxis de lista de cron (ej. "0,1"). diasOffset 0 deja los días sin cambios.
function diasConOffset(dias, diasOffset) {
  return dias
    .map((d) => (((d + diasOffset) % 7) + 7) % 7)
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Registra dos cron jobs para una tarea relacionada al cierre: uno para los días
 * de semana (con HORA_CIERRE_SEMANA) y otro para el fin de semana (con HORA_CIERRE_FINDE),
 * ambos desplazados por offsetMinutos (puede ser negativo, ej. el recordatorio previo,
 * o cruzar la medianoche, ej. el resumen diario). El callback recibe el diasOffset
 * resultante como argumento extra, por si necesita saber sobre qué día reportar.
 */
function programarTareaDeCierre(offsetMinutos, fn, client, descripcion) {
  const horaSemana = Number(process.env.HORA_CIERRE_SEMANA);
  const horaFinde = Number(process.env.HORA_CIERRE_FINDE);

  const semana = sumarMinutosAHora(horaSemana, offsetMinutos);
  cron.schedule(
    `${semana.minuto} ${semana.hora} * * ${diasConOffset(DIAS_SEMANA, semana.diasOffset)}`,
    ejecutarYLoguearError(fn, client, descripcion, semana.diasOffset),
    { timezone: TIMEZONE }
  );

  const finde = sumarMinutosAHora(horaFinde, offsetMinutos);
  cron.schedule(
    `${finde.minuto} ${finde.hora} * * ${diasConOffset(DIAS_FINDE, finde.diasOffset)}`,
    ejecutarYLoguearError(fn, client, descripcion, finde.diasOffset),
    { timezone: TIMEZONE }
  );

  logger.info(
    `Cron de ${descripcion} programado: lun-vie ${semana.hora}:${String(semana.minuto).padStart(2, '0')}, ` +
      `sáb-dom ${finde.hora}:${String(finde.minuto).padStart(2, '0')} (${TIMEZONE})`
  );
}

/**
 * Programa todos los cron jobs. Se llama una vez desde index.js con el cliente ya creado.
 */
function iniciarCronJobs(client) {
  const horaApertura = Number(process.env.HORA_APERTURA);
  cron.schedule(`0 ${horaApertura} * * *`, ejecutarYLoguearError(dispararApertura, client, 'apertura'), {
    timezone: TIMEZONE,
  });
  logger.info(`Cron de apertura programado a las ${horaApertura}:00 (${TIMEZONE})`);

  const aperturaAvisarMin = Number(process.env.APERTURA_AVISAR_ADMIN_MIN);
  const avisoApertura = sumarMinutosAHora(horaApertura, aperturaAvisarMin);
  cron.schedule(
    `${avisoApertura.minuto} ${avisoApertura.hora} * * *`,
    ejecutarYLoguearError(avisarAdminApertura, client, 'aviso de apertura pendiente al admin'),
    { timezone: TIMEZONE }
  );
  logger.info(
    `Cron de aviso de apertura pendiente programado a las ${avisoApertura.hora}:${String(avisoApertura.minuto).padStart(2, '0')} (${TIMEZONE})`
  );

  const minutosAviso = Number(process.env.MINUTOS_AVISO_CIERRE);
  const insistirMin = Number(process.env.CIERRE_INSISTIR_MIN);
  const avisarMin = Number(process.env.CIERRE_AVISAR_ADMIN_MIN);

  programarTareaDeCierre(-minutosAviso, dispararCierre, client, 'recordatorio/arranque de cierre');
  programarTareaDeCierre(insistirMin, insistirCierre, client, 'insistencia de cierre');
  programarTareaDeCierre(avisarMin, avisarAdminCierre, client, 'aviso de cierre pendiente al admin');

  const resumenOffsetMin = Number(process.env.RESUMEN_OFFSET_MIN);
  programarTareaDeCierre(resumenOffsetMin, enviarResumenDiario, client, 'resumen diario al admin');

  cron.schedule('*/10 * * * *', limpiarEstadosVencidos, { timezone: TIMEZONE });
  logger.info('Cron de limpieza de estados vencidos programado cada 10 minutos');
}

module.exports = {
  iniciarCronJobs,
  dispararApertura,
  dispararCierre,
  insistirCierre,
  avisarAdminCierre,
  avisarAdminApertura,
  telefonoDePersona,
  resolverPersonaDeHoy,
};
