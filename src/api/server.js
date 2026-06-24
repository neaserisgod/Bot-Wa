// Puente HTTP interno entre el panel (Next.js) y el bot de WhatsApp.
//
// El panel comparte la misma base SQLite que el bot, así que para LEER datos
// (pedidos, productos, ventas) no necesita pasar por acá: lee la DB directo.
// Pero ENVIAR un WhatsApp solo lo puede hacer este proceso, que es el único
// con la sesión de WhatsApp abierta. Por eso el panel, cuando marca un pedido
// como "listo", le pega a este servidor para que el bot avise al cliente.
//
// Seguridad: se usa un token compartido (PANEL_BRIDGE_TOKEN) en el header
// x-panel-token. Por defecto el servidor escucha solo en 127.0.0.1, de modo
// que en el VPS no queda expuesto a internet (panel y bot conviven en la misma
// máquina). Si algún día se separan, cambiar PANEL_BRIDGE_HOST y abrir el puerto.
const http = require('http');
const { enviarMensaje, resolverDestino } = require('../bot/client');
const pedidosQueries = require('../db/queries/pedidos');
const clientesQueries = require('../db/queries/clientes');
const logger = require('../utils/logger');

const PUERTO = Number(process.env.PANEL_BRIDGE_PORT) || 3100;
const HOST = process.env.PANEL_BRIDGE_HOST || '127.0.0.1';
const TOKEN = process.env.PANEL_BRIDGE_TOKEN || '';

function leerCuerpoJson(req) {
  return new Promise((resolve) => {
    let datos = '';
    req.on('data', (chunk) => {
      datos += chunk;
      if (datos.length > 1e6) req.destroy(); // corte defensivo a ~1MB
    });
    req.on('end', () => {
      if (!datos) return resolve({});
      try {
        resolve(JSON.parse(datos));
      } catch {
        resolve(null); // JSON inválido
      }
    });
  });
}

function responder(res, codigo, objeto) {
  const cuerpo = JSON.stringify(objeto);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

/**
 * Marca un pedido como listo y le avisa al cliente por WhatsApp.
 * Reutiliza la misma lógica que el comando "listo <n>" del bot.
 */
async function avisarPedidoListo(client, pedidoId) {
  const pedido = pedidosQueries.buscarPorId(pedidoId);
  if (!pedido) return { ok: false, codigo: 404, error: `Pedido #${pedidoId} no existe` };

  pedidosQueries.cambiarEstado(pedidoId, 'listo');

  const cliente = clientesQueries.buscarPorId(pedido.cliente_id);
  if (!cliente || !cliente.telefono) {
    // El pedido pasa a listo igual, pero no hay a quién avisar (ej. venta de mostrador).
    return { ok: true, avisado: false, motivo: 'pedido sin cliente con teléfono' };
  }

  const destino = await resolverDestino(client, cliente.telefono);
  const enviado = await enviarMensaje(
    client,
    destino,
    `🛍️ ¡Tu pedido #${pedidoId} ya está listo para retirar!`
  );

  logger.info(`[panel] Pedido #${pedidoId} marcado listo; cliente ${enviado ? 'notificado' : 'NO notificado'}`);
  return { ok: true, avisado: Boolean(enviado) };
}

/**
 * Envío genérico de un mensaje de WhatsApp a un teléfono.
 */
async function notificar(client, telefono, mensaje) {
  if (!telefono || !mensaje) {
    return { ok: false, codigo: 400, error: 'telefono y mensaje son obligatorios' };
  }
  const destino = await resolverDestino(client, String(telefono));
  const enviado = await enviarMensaje(client, destino, String(mensaje));
  return { ok: Boolean(enviado), enviado: Boolean(enviado) };
}

/**
 * Arranca el servidor del puente. Debe llamarse cuando el cliente de WhatsApp
 * ya está listo (evento 'ready'), para no intentar enviar sin sesión.
 * @param {import('whatsapp-web.js').Client} client
 */
function iniciarServidorPanel(client) {
  if (!TOKEN) {
    logger.warn(
      '[panel] PANEL_BRIDGE_TOKEN no está seteado: el puente del panel NO se inicia. ' +
        'Definí PANEL_BRIDGE_TOKEN en .env para habilitarlo.'
    );
    return null;
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      // Salud: no requiere token, sirve para que el panel sepa si el bot está vivo.
      if (req.method === 'GET' && req.url === '/health') {
        return responder(res, 200, { ok: true, servicio: 'bot-nefertiti-bridge' });
      }

      // A partir de acá, todo requiere token válido.
      if (req.headers['x-panel-token'] !== TOKEN) {
        return responder(res, 401, { ok: false, error: 'token inválido' });
      }

      const cuerpo = await leerCuerpoJson(req);
      if (cuerpo === null) {
        return responder(res, 400, { ok: false, error: 'JSON inválido' });
      }

      // POST /pedidos/:id/avisar-listo
      const matchListo = req.url.match(/^\/pedidos\/(\d+)\/avisar-listo$/);
      if (req.method === 'POST' && matchListo) {
        const resultado = await avisarPedidoListo(client, Number(matchListo[1]));
        return responder(res, resultado.codigo || 200, resultado);
      }

      // POST /notificar  { telefono, mensaje }
      if (req.method === 'POST' && req.url === '/notificar') {
        const resultado = await notificar(client, cuerpo.telefono, cuerpo.mensaje);
        return responder(res, resultado.codigo || 200, resultado);
      }

      return responder(res, 404, { ok: false, error: 'ruta no encontrada' });
    } catch (error) {
      logger.error(`[panel] Error en el puente HTTP: ${error.message}`);
      return responder(res, 500, { ok: false, error: 'error interno' });
    }
  });

  servidor.listen(PUERTO, HOST, () => {
    logger.info(`[panel] Puente HTTP escuchando en http://${HOST}:${PUERTO}`);
  });

  servidor.on('error', (error) => {
    logger.error(`[panel] No se pudo iniciar el puente HTTP: ${error.message}`);
  });

  return servidor;
}

module.exports = { iniciarServidorPanel };
