// Comandos de pedidos para el personal (admin y empleados), Fase 4.
// Devuelve true si el mensaje fue un comando de pedidos y ya se respondió.
const { enviarMensaje, resolverDestino } = require('../bot/client');
const pedidosQueries = require('../db/queries/pedidos');
const clientesQueries = require('../db/queries/clientes');
const { formatearMonto } = require('../utils/validadores');
const logger = require('../utils/logger');

// Ventas de mostrador (creadas desde el panel sin cliente asociado, ver
// panel/lib/repo.js crearVenta) no tienen cliente_nombre ni cliente_telefono.
function nombreVenta(p) {
  return p.cliente_nombre || p.cliente_telefono || 'Venta de mostrador';
}

function listarPedidos() {
  const pedidos = pedidosQueries.listarActivos();
  if (pedidos.length === 0) return 'No hay pedidos activos. 🎉';

  const lineas = pedidos.map(
    (p) => `#${p.id} · ${nombreVenta(p)} · ${formatearMonto(p.total)} · ${p.estado}`
  );
  return `📋 Pedidos activos:\n${lineas.join('\n')}\n\nMarcá uno con: listo <número>  /  retirado <número>`;
}

// "YYYY-MM-DD HH:MM:SS" -> "DD/MM HH:MM", para el historial de ventas.
function formatearFechaCorta(datetimeStr) {
  if (!datetimeStr) return '';
  const [fecha, hora] = datetimeStr.split(' ');
  const [, mes, dia] = fecha.split('-');
  return `${dia}/${mes} ${(hora || '').slice(0, 5)}`;
}

// Historial de ventas recientes (cualquier estado, no solo activas), para el
// atajo "ventas"/"ventas <n>" del admin. Incluye las hechas desde el panel
// (con o sin cliente asociado).
function listarVentas(limite = 5) {
  const pedidos = pedidosQueries.listarRecientes(limite);
  if (pedidos.length === 0) return 'Todavía no hay ventas registradas.';

  const lineas = pedidos.map(
    (p) =>
      `#${p.id} · ${nombreVenta(p)} · ${formatearMonto(p.total)} · ${p.estado} · ${formatearFechaCorta(p.created_at)}`
  );
  return `🧾 Últimas ${pedidos.length} ventas:\n${lineas.join('\n')}`;
}

async function marcarListo(client, msg, pedidoId) {
  const pedido = pedidosQueries.buscarPorId(pedidoId);
  if (!pedido) {
    await enviarMensaje(client, msg.from, `No encontré el pedido #${pedidoId}.`);
    return;
  }

  pedidosQueries.cambiarEstado(pedidoId, 'listo');
  await enviarMensaje(client, msg.from, `✅ Pedido #${pedidoId} marcado como listo. Le aviso al cliente.`);

  const cliente = clientesQueries.buscarPorId(pedido.cliente_id);
  if (cliente) {
    const destinoCliente = await resolverDestino(client, cliente.telefono);
    await enviarMensaje(
      client,
      destinoCliente,
      `🛍️ ¡Tu pedido #${pedidoId} ya está listo para retirar!`
    );
  }
  logger.info(`Pedido #${pedidoId} marcado listo; cliente notificado`);
}

async function marcarRetirado(client, msg, pedidoId) {
  const pedido = pedidosQueries.buscarPorId(pedidoId);
  if (!pedido) {
    await enviarMensaje(client, msg.from, `No encontré el pedido #${pedidoId}.`);
    return;
  }
  pedidosQueries.cambiarEstado(pedidoId, 'retirado');
  await enviarMensaje(client, msg.from, `📦 Pedido #${pedidoId} marcado como retirado.`);
  logger.info(`Pedido #${pedidoId} marcado retirado`);
}

/**
 * Intenta manejar el mensaje como un comando de pedidos.
 * @returns {Promise<boolean>} true si era un comando y ya se respondió.
 */
async function manejarComando(client, msg) {
  const texto = msg.body.trim().toLowerCase();

  if (texto === 'pedidos') {
    await enviarMensaje(client, msg.from, listarPedidos());
    return true;
  }

  const listo = texto.match(/^listo\s+#?(\d+)$/);
  if (listo) {
    await marcarListo(client, msg, Number(listo[1]));
    return true;
  }

  const retirado = texto.match(/^(?:retirado|entregado)\s+#?(\d+)$/);
  if (retirado) {
    await marcarRetirado(client, msg, Number(retirado[1]));
    return true;
  }

  return false;
}

module.exports = { manejarComando, listarPedidos, listarVentas, marcarListo, marcarRetirado };
