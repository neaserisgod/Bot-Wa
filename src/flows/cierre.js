// Máquina de estados del flujo de CIERRE de caja (Fase D).
// Mismo patrón que flows/caja.js: el progreso se persiste en estados_conversacion,
// así que si el proceso se reinicia a mitad del cierre, el flujo se reanuda solo.
const { enviarMensaje, resolverDestino } = require('../bot/client');
const estados = require('../db/queries/estados');
const cajaQueries = require('../db/queries/caja');
const empleadosQueries = require('../db/queries/empleados');
const { parsearMonto, formatearMonto } = require('../utils/validadores');
const { guardarFotoMensaje } = require('../utils/media');
const { fechaHoy } = require('../utils/fechas');
const logger = require('../utils/logger');

const FLUJO = 'cierre_caja';

/**
 * Arranca el flujo de cierre para la persona que cierra hoy.
 * Lo llama el cron (recordatorio) o el disparador manual de prueba.
 *
 * @param {Client} client
 * @param {string} destino   JID ya resuelto al que escribirle
 * @param {string} telefono  número del empleado (clave del estado)
 * @param {object} empleado  registro de la tabla empleados
 * @returns {Promise<boolean>} false si ya se cerró hoy (no hace nada)
 */
async function iniciarCierre(client, destino, telefono, empleado) {
  const fecha = fechaHoy();

  if (cajaQueries.buscarCierreMpDelDia(fecha)) {
    logger.info(`Cierre de hoy ya registrado, no se vuelve a cerrar (${empleado.nombre})`);
    return false;
  }

  estados.setEstado(telefono, FLUJO, 'esperando_foto_mp', {
    empleadoId: empleado.id,
  });

  const minutosAviso = process.env.MINUTOS_AVISO_CIERRE || '5';
  await enviarMensaje(
    client,
    destino,
    `⏰ Cerramos en ${minutosAviso} minutos. Mandá la foto del cierre de Mercado Pago para arrancar.`
  );
  logger.info(`Cierre iniciado para ${empleado.nombre}`);
  return true;
}

async function procesarFotoMp(client, msg, telefono, data) {
  const fecha = fechaHoy();
  const rutaFoto = await guardarFotoMensaje(msg, 'mp');

  if (!rutaFoto) {
    await enviarMensaje(
      client,
      msg.from,
      '❌ Mandame la foto del comprobante de cierre de Mercado Pago para poder seguir.'
    );
    return;
  }

  if (!cajaQueries.buscarCierreMpDelDia(fecha)) {
    cajaQueries.registrarCierreMp({ fecha, empleadoId: data.empleadoId, fotoMp: rutaFoto });
  }

  const totalCajas = Number(process.env.CANTIDAD_CAJAS) || 2;
  const nuevaData = { ...data, totalCajas, cajaActual: 1, montos: {}, fotoPendiente: null };
  estados.setEstado(telefono, FLUJO, 'esperando_monto', nuevaData);

  await enviarMensaje(client, msg.from, '¿Cuánto contaste en la Caja 1?');
}

async function procesarMonto(client, msg, telefono, data) {
  const caja = data.cajaActual;

  if (msg.hasMedia) {
    const rutaFoto = await guardarFotoMensaje(msg, 'billetes');
    if (rutaFoto) {
      data.fotoPendiente = rutaFoto;
      estados.setEstado(telefono, FLUJO, 'esperando_monto', data);
      await enviarMensaje(
        client,
        msg.from,
        `📷 Foto recibida. Ahora decime cuánto contaste en la Caja ${caja}.`
      );
      return;
    }
  }

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

  if (!cajaQueries.listarCierresDelDia(fecha).some((c) => c.caja === caja)) {
    cajaQueries.registrarCierre({
      fecha,
      caja,
      empleadoId: data.empleadoId,
      totalContado: monto,
      fotoBilletes: data.fotoPendiente || null,
    });
  }
  data.montos[caja] = monto;
  data.fotoPendiente = null;

  if (caja < data.totalCajas) {
    data.cajaActual = caja + 1;
    estados.setEstado(telefono, FLUJO, 'esperando_monto', data);
    await enviarMensaje(client, msg.from, `¿Cuánto contaste en la Caja ${caja + 1}?`);
    return;
  }

  estados.clearEstado(telefono);

  const lineas = ['  MP: foto recibida'];
  for (let c = 1; c <= data.totalCajas; c += 1) {
    lineas.push(`  Caja ${c}: ${formatearMonto(data.montos[c])}`);
  }
  await enviarMensaje(client, msg.from, `✅ Cierre registrado:\n${lineas.join('\n')}\n¡Buen descanso!`);
  logger.info(`Cierre completado por empleado_id=${data.empleadoId}`);

  // Aviso en vivo al admin (sección 5 del spec), salvo que quien cerró sea el admin.
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
      `🔴 Caja cerrada por ${empleado ? empleado.nombre : telefono} — ${detalle.join(' · ')}`
    );
  }
}

/**
 * Procesa un mensaje entrante de quien tiene un flujo de cierre en curso.
 */
async function continuarCierre(client, msg, telefono, estado) {
  const data = estado.data;

  if (estado.paso === 'esperando_foto_mp') {
    await procesarFotoMp(client, msg, telefono, data);
    return;
  }

  await procesarMonto(client, msg, telefono, data);
}

module.exports = { FLUJO, iniciarCierre, continuarCierre };
