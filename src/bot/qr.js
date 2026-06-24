// Manejo del QR y eventos de sesión de whatsapp-web.js.
const qrcodeTerminal = require('qrcode-terminal');
const logger = require('../utils/logger');

function registrarEventosSesion(client) {
  client.on('qr', (qr) => {
    logger.info('Escaneá este código QR desde WhatsApp > Dispositivos vinculados:');
    qrcodeTerminal.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    logger.info('Sesión de WhatsApp autenticada correctamente');
  });

  client.on('auth_failure', (mensaje) => {
    logger.error(
      `Fallo de autenticación de WhatsApp: ${mensaje}. Borrá la carpeta de sesión (SESSION_PATH) y reescaneá el QR.`
    );
  });

  client.on('disconnected', (razon) => {
    logger.warn(
      `Cliente de WhatsApp desconectado (${razon}). Si al reiniciar no reconecta sola, borrá SESSION_PATH y reescaneá el QR.`
    );
  });

  client.on('ready', () => {
    logger.info('Bot Nefertiti conectado y listo para recibir mensajes');
  });
}

module.exports = { registrarEventosSesion };
