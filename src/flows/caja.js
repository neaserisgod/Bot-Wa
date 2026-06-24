// Máquina de estados del flujo de APERTURA de caja (Fase C).
// El progreso se persiste en estados_conversacion (vía queries/estados), así que
// si el proceso se reinicia a mitad de la apertura, el flujo se reanuda solo.
const { enviarMensaje, resolverDestino } = require('../bot/client');
const estados = require('../db/queries/estados');
const cajaQueries = require('../db/queries/caja');
const empleadosQueries = require('../db/queries/empleados');
const empleadoActivo = require('./empleadoActivo');
const { parsearMonto, formatearMonto } = require('../utils/validadores');
const { fechaHoy } = require('../utils/fechas');
const logger = require('../utils/logger');

const FLUJO = 'apertura_caja';

/**
 * Arranca el flujo de apertura para la persona que abre hoy.
 * Lo llama el cron (o el disparador manual de prueba).
 *
 * @param {Client} client  cliente de whatsapp-web.js
 * @param {string} destino JID ya resuelto al que escribirle (ej. 549...@c.us)
 * @param {string} telefono número del empleado (clave del estado)
 * @param {object} empleado registro de la tabla empleados (id, nombre, ...)
 * @returns {Promise<boolean>} false si la caja ya estaba abierta hoy (no hace nada)
 */
async function iniciarApertura(client, destino, telefono, empleado) {
  const fecha = fechaHoy();

  // Si la Caja 1 ya tiene apertura registrada hoy, no volvemos a preguntar.
  if (cajaQueries.buscarApertura(fecha, 1)) {
    logger.info(`Apertura de hoy ya registrada, no se reabre (${empleado.nombre})`);
    return false;
  }

  const totalCajas = Number(process.env.CANTIDAD_CAJAS) || 2;

  estados.setEstado(telefono, FLUJO, 'esperando_monto', {
    totalCajas,
    cajaActual: 1,
    montos: {},
    empleadoId: empleado.id,
  });

  await enviarMensaje(
    client,
    destino,
    `🏪 ¡Buenos días ${empleado.nombre}!\n¿Con cuánto efectivo abre la Caja 1?`
  );
  logger.info(`Apertura iniciada para ${empleado.nombre} (${totalCajas} cajas)`);
  return true;
}

/**
 * Procesa un mensaje entrante de quien tiene un flujo de apertura en curso.
 * @param {Client} client
 * @param {object} msg     mensaje de whatsapp-web.js
 * @param {string} telefono número del remitente (clave del estado)
 * @param {object} estado  estado actual (ya parseado, con .data)
 */
async function continuarApertura(client, msg, telefono, estado) {
  const data = estado.data;
  const caja = data.cajaActual;
  const monto = parsearMonto(msg.body);

  if (monto === null) {
    await enviarMensaje(
      client,
      msg.from,
      `❌ No entendí el monto de la Caja ${caja}.\nMandá solo el número, por ejemplo: 5000`
    );
    return;
  }

  const fecha = fechaHoy();

  // Guarda idempotente: si por un reinicio esta caja ya quedó registrada, no
  // duplicamos el INSERT; solo avanzamos.
  if (!cajaQueries.buscarApertura(fecha, caja)) {
    cajaQueries.registrarApertura({
      fecha,
      caja,
      empleadoId: data.empleadoId,
      monto,
    });
  }
  data.montos[caja] = monto;

  if (caja < data.totalCajas) {
    data.cajaActual = caja + 1;
    estados.setEstado(telefono, FLUJO, 'esperando_monto', data);
    await enviarMensaje(
      client,
      msg.from,
      `¿Con cuánto efectivo abre la Caja ${caja + 1}?`
    );
    return;
  }

  // Última caja: cerramos el flujo y confirmamos con el detalle de todas.
  estados.clearEstado(telefono);

  const lineas = [];
  for (let c = 1; c <= data.totalCajas; c += 1) {
    lineas.push(`  Caja ${c}: ${formatearMonto(data.montos[c])}`);
  }
  await enviarMensaje(
    client,
    msg.from,
    `✅ Apertura registrada:\n${lineas.join('\n')}\n¡Buen día de trabajo!`
  );
  logger.info(`Apertura completada por empleado_id=${data.empleadoId}`);

  // Aviso en vivo al admin (sección 5 de COMPORTAMIENTO-ADMIN.md), salvo que
  // quien abrió sea el admin (no tiene sentido autoavisarse).
  if (telefono !== process.env.ADMIN_NUMBER) {
    const empleado = empleadosQueries.buscarPorTelefono(telefono);
    const detalle = [];
    for (let c = 1; c <= data.totalCajas; c += 1) {
      detalle.push(`Caja ${c} ${formatearMonto(data.montos[c])}`);
    }
    const destinoAdmin = await resolverDestino(client, process.env.ADMIN_NUMBER);
    await enviarMensaje(
      client,
      destinoAdmin,
      `🟢 Caja abierta por ${empleado ? empleado.nombre : telefono} — ${detalle.join(' · ')}`
    );
  }

  // Quien abre la caja queda como empleado activo del día
  // (COMPORTAMIENTO-CLIENTES-EMPLEADOS.md A.1.b) — incluye al admin: tiene
  // todos los comandos del empleado además de los propios, así que abrir
  // también lo deja activo (y le pregunta hasta qué hora se queda) igual
  // que a cualquier empleado.
  const quienAbrio = empleadosQueries.buscarPorTelefono(telefono);
  if (quienAbrio) {
    await empleadoActivo.tomarTurnoYPreguntarHora(client, msg.from, telefono, quienAbrio);
  }
}

module.exports = { FLUJO, iniciarApertura, continuarApertura };
