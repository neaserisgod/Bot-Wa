// Configuración del cliente de whatsapp-web.js y envío de mensajes con rate limit.
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../utils/logger');

const INTERVALO_MIN_MS = 1000; // mínimo 1 segundo entre mensajes salientes
let ultimoEnvio = 0;

// whatsapp-web.js trae por defecto un User-Agent fijo y desactualizado
// (Chrome/101 de 2022) que comparten todos los bots que no lo cambian,
// lo cual lo hace fácil de detectar y bloquear como tráfico automatizado.
// Acá lo pisamos por uno de Chrome actual en Windows.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Crea el cliente de WhatsApp con la sesión persistida en SESSION_PATH.
 * Si CHROMIUM_PATH está seteado (caso VPS), usa ese binario de Chromium.
 */
function crearClienteWhatsApp() {
  const opcionesPuppeteer = {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };

  if (process.env.CHROMIUM_PATH) {
    opcionesPuppeteer.executablePath = process.env.CHROMIUM_PATH;
  }

  return new Client({
    authStrategy: new LocalAuth({ dataPath: process.env.SESSION_PATH || './session' }),
    puppeteer: opcionesPuppeteer,
    userAgent: USER_AGENT,
  });
}

/**
 * Envía un mensaje respetando un mínimo de 1 segundo entre envíos salientes
 * (evita disparar el límite anti-spam de WhatsApp) y sin tumbar el proceso
 * si el envío falla.
 */
async function enviarMensaje(client, destino, contenido, opciones = {}) {
  const ahora = Date.now();
  const espera = Math.max(0, ultimoEnvio + INTERVALO_MIN_MS - ahora);
  if (espera > 0) {
    await new Promise((resolve) => setTimeout(resolve, espera));
  }
  ultimoEnvio = Date.now();

  try {
    return await client.sendMessage(destino, contenido, opciones);
  } catch (error) {
    logger.error(`Error al enviar mensaje a ${destino}: ${error.message}`);
    return null;
  }
}

/**
 * Resuelve el JID al que se le puede enviar un mensaje a partir de un número.
 * Necesario porque WhatsApp usa cada vez más el esquema LID y armar el JID
 * a mano (`numero@c.us`) no siempre entrega. getNumberId pregunta a WhatsApp
 * el identificador real registrado para ese número.
 * @returns {Promise<string|null>} JID serializado, o null si el número no existe en WhatsApp
 */
async function resolverDestino(client, telefono) {
  try {
    const numberId = await client.getNumberId(telefono);
    if (numberId) return numberId._serialized;
  } catch (error) {
    logger.error(`No se pudo resolver el destino de ${telefono}: ${error.message}`);
  }
  // Fallback al formato clásico; puede no entregar en cuentas LID.
  return `${telefono}@c.us`;
}

module.exports = { crearClienteWhatsApp, enviarMensaje, resolverDestino };
