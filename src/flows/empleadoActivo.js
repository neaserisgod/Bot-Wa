// Empleado activo del día (COMPORTAMIENTO-CLIENTES-EMPLEADOS.md A.1.b/A.1.c):
// sin ritual de check-in — el que abre la caja, o quien manda "estoy"/"quedo yo",
// queda a cargo. El bot le pregunta hasta qué hora se queda; si no contesta,
// sigue activo sin vencimiento (hasta el reset diario o el próximo relevo).
const { enviarMensaje } = require('../bot/client');
const estados = require('../db/queries/estados');
const turnoActivoQueries = require('../db/queries/turnoActivo');
const { parsearHora, horaActualHHMM } = require('../utils/fechas');
const logger = require('../utils/logger');

const FLUJO = 'turno_activo';

/**
 * Empleado vigente ahora mismo (activo y, si tiene activo_hasta, todavía no
 * pasó esa hora). Devuelve null si nadie quedó activo hoy, ya expiró, o el
 * último movimiento fue alguien terminando su turno (activo=0, ver
 * terminarTurno).
 */
function getActivoVigente() {
  const fila = turnoActivoQueries.getActivoDeHoy();
  if (!fila || !fila.activo) return null;
  if (fila.activo_hasta && horaActualHHMM() > fila.activo_hasta) return null;
  return fila;
}

/**
 * Marca a `empleado` como activo y le pregunta hasta qué hora se queda.
 * Lo dispara tanto completar una apertura de caja como el atajo "estoy".
 */
async function tomarTurnoYPreguntarHora(client, destino, telefono, empleado) {
  turnoActivoQueries.setActivo(empleado.id, null);
  estados.setEstado(telefono, FLUJO, 'esperando_hora_salida', {});
  await enviarMensaje(
    client,
    destino,
    `👋 Hola ${empleado.nombre}, ¿hasta qué hora te quedás?\n(respondé una hora, ej: 18:00)`
  );
  logger.info(`${empleado.nombre} quedó como empleado activo del día`);
}

/**
 * Continúa el paso "esperando_hora_salida". Si la respuesta no se puede
 * interpretar como una hora, no insiste (evita el mismo problema que ya
 * tuvimos con el registro de nombre del cliente): queda activo sin
 * vencimiento y el mensaje se reprocesa como una acción normal, por si el
 * empleado ya estaba escribiendo otra cosa (ej. "menu").
 */
async function continuar(client, msg, telefono, estado) {
  const hora = parsearHora(msg.body);
  estados.clearEstado(telefono);

  if (hora) {
    const activo = turnoActivoQueries.getActivoDeHoy();
    if (activo) turnoActivoQueries.setActivoHasta(activo.id, hora);
    await enviarMensaje(client, msg.from, `Listo, te tengo hasta las ${hora}. 👍`);
    return;
  }

  await enviarMensaje(client, msg.from, 'Bueno, quedás activo sin hora límite. Cualquier cosa, escribime *menu*.');
  const empleadosQueries = require('../db/queries/empleados');
  const empleado = empleadosQueries.buscarPorTelefono(telefono);
  if (!empleado) {
    logger.error(`continuar(turno_activo): no encontré empleado con teléfono ${telefono}`);
    return;
  }
  const employeeHandler = require('../handlers/employeeHandler');
  await employeeHandler.procesarTexto(client, msg, empleado);
}

/**
 * Termina el turno de quien lo escribe ("ya no estoy"/"me voy"/"salgo"/
 * "termino mi turno"). Antes no había ninguna forma de dejar de estar activo
 * sin que otro tomara el relevo o pasara la hora límite — si nadie más decía
 * "estoy", quedaba activo para siempre. Solo afecta algo si quien lo escribe
 * ES el activo vigente ahora mismo: si no lo es, no hay nada que cerrar (evita
 * que alguien borre por error el turno de otra persona que sí está a cargo).
 */
async function terminarTurno(client, msg, telefono, empleado) {
  const activo = getActivoVigente();
  if (!activo || activo.empleado_id !== empleado.id) {
    await enviarMensaje(client, msg.from, 'No estás como activo ahora, no hay ningún turno tuyo para terminar.');
    return;
  }

  turnoActivoQueries.marcarInactivo(empleado.id);
  await enviarMensaje(
    client,
    msg.from,
    '👋 Listo, terminaste tu turno. Si alguien más queda a cargo, que escriba *estoy*.'
  );
  logger.info(`${empleado.nombre} terminó su turno (ya no es el empleado activo)`);
}

module.exports = { FLUJO, getActivoVigente, tomarTurnoYPreguntarHora, terminarTurno, continuar };
