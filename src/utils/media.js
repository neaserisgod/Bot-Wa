// Guardado de fotos recibidas por WhatsApp (comprobante de MP, billetes contados).
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'data', 'media');

const EXTENSION_POR_MIMETYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Si el mensaje trae una imagen adjunta, la descarga y la guarda en data/media/.
 * @param {object} msg     mensaje de whatsapp-web.js
 * @param {string} prefijo identifica el tipo de foto en el nombre de archivo (ej. 'mp', 'billetes')
 * @returns {Promise<string|null>} ruta relativa guardada, o null si el mensaje no trae una imagen
 */
async function guardarFotoMensaje(msg, prefijo) {
  if (!msg.hasMedia || msg.type !== 'image') return null;

  let media;
  try {
    media = await msg.downloadMedia();
  } catch (error) {
    logger.error(`No se pudo descargar la imagen adjunta: ${error.message}`);
    return null;
  }

  if (!media || !media.mimetype || !media.mimetype.startsWith('image/')) return null;

  const extension = EXTENSION_POR_MIMETYPE[media.mimetype] || 'jpg';
  const nombreArchivo = `${Date.now()}_${prefijo}.${extension}`;
  const rutaCompleta = path.join(MEDIA_DIR, nombreArchivo);
  const rutaRelativa = path.join('data', 'media', nombreArchivo);

  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }
    fs.writeFileSync(rutaCompleta, Buffer.from(media.data, 'base64'));
  } catch (error) {
    logger.error(`No se pudo guardar la imagen en ${rutaCompleta}: ${error.message}`);
    return null;
  }

  logger.info(`Foto guardada: ${rutaRelativa}`);
  return rutaRelativa;
}

module.exports = { guardarFotoMensaje };
