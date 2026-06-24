// Resumen diario al admin (Fase E): apertura/cierre/diferencia por caja + MP,
// con las fotos del día adjuntas. No es un flujo conversacional (no hay máquina
// de estados): es un reporte de una sola pasada sobre una fecha ya cerrada.
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { enviarMensaje, resolverDestino } = require('../bot/client');
const cajaQueries = require('../db/queries/caja');
const { formatearMonto } = require('../utils/validadores');
const logger = require('../utils/logger');

function rutaAbsoluta(rutaRelativa) {
  return path.join(__dirname, '..', '..', rutaRelativa);
}

function lineaCaja(caja, apertura, cierre) {
  const montoApertura = apertura ? formatearMonto(apertura.monto) : 'sin registrar';
  const montoCierre = cierre ? formatearMonto(cierre.total_contado) : 'sin registrar';
  const diferencia = apertura && cierre ? formatearMonto(cierre.total_contado - apertura.monto) : '—';
  return `Caja ${caja}: apertura ${montoApertura} — cierre ${montoCierre} — diferencia ${diferencia}`;
}

/**
 * Manda al admin el resumen del día `fecha` (YYYY-MM-DD): apertura/cierre/diferencia
 * por caja, estado de la foto de MP, y todas las fotos del día adjuntas.
 */
async function enviarResumenDiario(client, fecha) {
  const aperturas = cajaQueries.listarAperturasDelDia(fecha);
  const cierres = cajaQueries.listarCierresDelDia(fecha);
  const cierreMp = cajaQueries.buscarCierreMpDelDia(fecha);

  const destinoAdmin = await resolverDestino(client, process.env.ADMIN_NUMBER);

  if (aperturas.length === 0 && cierres.length === 0 && !cierreMp) {
    await enviarMensaje(client, destinoAdmin, `📊 Resumen del día ${fecha}: no hay registros de apertura ni cierre.`);
    return;
  }

  const totalCajas = Number(process.env.CANTIDAD_CAJAS) || 2;
  const lineas = [`📊 Resumen del día ${fecha}:`, ''];

  for (let caja = 1; caja <= totalCajas; caja += 1) {
    const apertura = aperturas.find((a) => a.caja === caja) || null;
    const cierre = cierres.find((c) => c.caja === caja) || null;
    lineas.push(lineaCaja(caja, apertura, cierre));
  }
  lineas.push(`Mercado Pago: ${cierreMp ? 'foto recibida' : 'sin registrar'}`);

  await enviarMensaje(client, destinoAdmin, lineas.join('\n'));

  const fotos = [];
  if (cierreMp) fotos.push({ ruta: cierreMp.foto_mp, caption: 'Foto MP' });
  for (const cierre of cierres) {
    if (cierre.foto_billetes) {
      fotos.push({ ruta: cierre.foto_billetes, caption: `Foto billetes Caja ${cierre.caja}` });
    }
  }

  for (const foto of fotos) {
    try {
      const media = MessageMedia.fromFilePath(rutaAbsoluta(foto.ruta));
      await enviarMensaje(client, destinoAdmin, media, { caption: foto.caption });
    } catch (error) {
      logger.error(`No se pudo reenviar la foto ${foto.ruta} en el resumen: ${error.message}`);
    }
  }

  logger.info(`Resumen diario del ${fecha} enviado al admin`);
}

module.exports = { enviarResumenDiario };
