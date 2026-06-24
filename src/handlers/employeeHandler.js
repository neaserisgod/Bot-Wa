// Flujo de mensajes de empleados: menú navegable + atajos + mensajes
// compuestos, mismo motor que el admin pero con el subconjunto de acciones de
// COMPORTAMIENTO-CLIENTES-EMPLEADOS.md (Parte A). Backup, resumen completo y
// los alias `test *` quedan solo para el admin (A.7) — un empleado que los
// escribe simplemente no matchea ninguna acción y cae en el menú.
const { enviarMensaje } = require('../bot/client');
const personalAcciones = require('../flows/personalAcciones');
const parserPersonal = require('../utils/parserPersonal');
const logger = require('../utils/logger');

/**
 * Parsea el texto libre del empleado (uno o varios atajos) y ejecuta la
 * cadena resultante. Lo usa tanto la entrada normal (manejar) como el
 * fallback del menú navegable y el de "esperando_hora_salida".
 */
async function procesarTexto(client, msg, empleado) {
  const acciones = parserPersonal.parsearAcciones(msg.body.trim(), 'empleado');
  await personalAcciones.ejecutarAcciones(client, msg, empleado.telefono, 'empleado', acciones);
}

async function manejar(client, msg, empleado) {
  const texto = msg.body.trim().toLowerCase();

  if (texto === 'ping') {
    await enviarMensaje(client, msg.from, 'pong 🏓');
    logger.info(`Ping/pong respondido a ${empleado.nombre}`);
    return;
  }

  await procesarTexto(client, msg, empleado);
}

module.exports = { manejar, procesarTexto };
