// Flujo de mensajes del admin. Menú navegable + atajos por palabras clave +
// mensajes compuestos (COMPORTAMIENTO-ADMIN.md), sobre el motor generalizado
// de personalAcciones.js/menuPersonal.js (COMPORTAMIENTO-CLIENTES-EMPLEADOS.md
// C.1). Los comandos viejos (ping, test apertura, etc.) quedan como alias
// ocultos con prioridad máxima.
const { enviarMensaje } = require('../bot/client');
const { dispararApertura, dispararCierre, insistirCierre, avisarAdminCierre, avisarAdminApertura } = require('../cron/tareas');
const resumenFlow = require('../flows/resumen');
const personalAcciones = require('../flows/personalAcciones');
const parserPersonal = require('../utils/parserPersonal');
const { backupAhora } = require('../cron/backup');
const { fechaHoy } = require('../utils/fechas');
const logger = require('../utils/logger');

/**
 * Parsea el texto libre del admin (uno o varios atajos) y ejecuta la cadena
 * resultante. Lo usan tanto la entrada normal (manejar) como el fallback del
 * menú navegable cuando el admin escribe un atajo en vez de un número.
 */
async function procesarTexto(client, msg, admin) {
  const acciones = parserPersonal.parsearAcciones(msg.body.trim(), 'admin');
  await personalAcciones.ejecutarAcciones(client, msg, admin.telefono, 'admin', acciones);
}

async function manejar(client, msg, admin) {
  const texto = msg.body.trim().toLowerCase();

  if (texto === 'ping') {
    await enviarMensaje(client, msg.from, 'pong 🏓');
    logger.info(`Ping/pong respondido al admin (${admin?.nombre || msg.from})`);
    return;
  }

  // Modo de prueba: dispara el flujo de apertura de hoy de inmediato.
  if (texto === 'test apertura') {
    logger.info('Comando de prueba: disparando apertura manualmente');
    const iniciado = await dispararApertura(client);
    if (!iniciado) {
      await enviarMensaje(
        client,
        msg.from,
        'ℹ️ No se inició la apertura (ya estaba abierta hoy o falta configurar el empleado de turno). Revisá los logs.'
      );
    }
    return;
  }

  // Modo de prueba: dispara el flujo de cierre de hoy de inmediato.
  if (texto === 'test cierre') {
    logger.info('Comando de prueba: disparando cierre manualmente');
    const iniciado = await dispararCierre(client);
    if (!iniciado) {
      await enviarMensaje(
        client,
        msg.from,
        'ℹ️ No se inició el cierre (ya estaba cerrado hoy o falta configurar el empleado de turno). Revisá los logs.'
      );
    }
    return;
  }

  // Modo de prueba: ejecuta ahora mismo la lógica de insistencia de cierre.
  if (texto === 'test cierre insistir') {
    logger.info('Comando de prueba: ejecutando insistencia de cierre manualmente');
    await insistirCierre(client);
    return;
  }

  // Modo de prueba: ejecuta ahora mismo la lógica de aviso al admin por cierre pendiente.
  if (texto === 'test cierre avisar') {
    logger.info('Comando de prueba: ejecutando aviso de cierre pendiente manualmente');
    await avisarAdminCierre(client);
    return;
  }

  // Modo de prueba: ejecuta ahora mismo la lógica de aviso al admin por apertura pendiente.
  if (texto === 'test apertura avisar') {
    logger.info('Comando de prueba: ejecutando aviso de apertura pendiente manualmente');
    await avisarAdminApertura(client);
    return;
  }

  // Modo de prueba: manda el resumen de hoy ahora mismo, sin esperar la hora real.
  if (texto === 'test resumen') {
    logger.info('Comando de prueba: enviando resumen diario manualmente');
    await resumenFlow.enviarResumenDiario(client, fechaHoy());
    return;
  }

  // Modo de prueba: corre el backup de la DB ahora mismo.
  if (texto === 'test backup') {
    logger.info('Comando de prueba: ejecutando backup manualmente');
    const destino = backupAhora();
    await enviarMensaje(client, msg.from, `✅ Backup creado: ${destino}`);
    return;
  }

  await procesarTexto(client, msg, admin);
}

module.exports = { manejar, procesarTexto };
