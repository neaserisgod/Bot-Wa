// Watchdog de salud de la sesión de WhatsApp.
//
// Problema real confirmado en producción: el proceso quedó "zombie" durante
// 9 horas — vivo, sin ningún error en los logs, pero sin recibir ni un solo
// mensaje. whatsapp-web.js no detectó la caída (no disparó 'disconnected'),
// así que el bot nunca se enteró. Es un problema conocido de la librería: el
// WebSocket interno de WhatsApp Web puede morir en silencio en sesiones
// largas.
//
// En vez de tratar de reparar la conexión en caliente (arriesgado: si
// Puppeteer está colgado, un client.destroy()/initialize() también puede
// quedarse esperando para siempre), el watchdog hace un chequeo activo
// periódico y, si falla varias veces seguidas, sale del proceso — en
// producción PM2 lo reinicia solo y limpio (ver ecosystem.config.js,
// restart_delay). Es el patrón estándar de Node: "dejalo morir, que el
// supervisor lo reinicie", en vez de intentar autocurarse en un estado
// posiblemente corrupto.
const { WAState } = require('whatsapp-web.js');
const { haceCuantoSinActividad } = require('../handlers/messageHandler');
const logger = require('../utils/logger');

const INTERVALO_CHEQUEO_MS = 5 * 60 * 1000; // cada 5 minutos
const TIMEOUT_CHEQUEO_MS = 30 * 1000; // si no contesta en 30s, se considera colgado
const FALLOS_PARA_REINICIAR = 2; // tolera 1 fallo transitorio antes de salir

function conTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Arranca el chequeo periódico. Llamar una vez con el cliente ya conectado
 * (evento 'ready'), igual que los cron jobs.
 * @param {import('whatsapp-web.js').Client} client
 */
function iniciarWatchdog(client) {
  let fallosConsecutivos = 0;

  setInterval(async () => {
    try {
      const estado = await conTimeout(client.getState(), TIMEOUT_CHEQUEO_MS);
      if (estado !== WAState.CONNECTED) {
        throw new Error(`estado de WhatsApp no conectado: ${estado}`);
      }
      fallosConsecutivos = 0;
    } catch (error) {
      fallosConsecutivos += 1;
      const minutosSinActividad = Math.round(haceCuantoSinActividad() / 60000);
      logger.error(
        `Watchdog: chequeo de salud falló (${fallosConsecutivos}/${FALLOS_PARA_REINICIAR}) — ${error.message}. ` +
          `Hace ${minutosSinActividad} min que no se procesa ningún mensaje.`
      );

      if (fallosConsecutivos >= FALLOS_PARA_REINICIAR) {
        logger.error(
          'Watchdog: la sesión de WhatsApp parece colgada (varios chequeos seguidos sin respuesta). Reiniciando el proceso.'
        );
        process.exit(1);
      }
    }
  }, INTERVALO_CHEQUEO_MS);

  logger.info(
    `Watchdog de salud de WhatsApp iniciado (chequeo cada ${INTERVALO_CHEQUEO_MS / 60000} min, timeout ${TIMEOUT_CHEQUEO_MS / 1000}s)`
  );
}

module.exports = { iniciarWatchdog };
