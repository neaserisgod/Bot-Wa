// Consultas sobre pedidos y sus items (Fase 4).
const db = require('../index');

// Estados válidos del ciclo de vida de un pedido.
const ESTADOS = ['pendiente', 'confirmado', 'en_preparacion', 'listo', 'retirado', 'cancelado'];

/**
 * Crea un pedido con sus items en una sola transacción.
 * @param {object} p
 * @param {number} p.clienteId
 * @param {number} p.total
 * @param {string} p.estado
 * @param {Array<{productoId:number, nombre:string, cantidad:number, precioUnitario:number, subtotal:number}>} p.items
 * @returns {number} id del pedido creado
 */
function crearConItems({ clienteId, total, estado = 'confirmado', items }) {
  const insertarPedido = db.prepare(
    'INSERT INTO pedidos (cliente_id, estado, total) VALUES (?, ?, ?)'
  );
  const insertarItem = db.prepare(
    `INSERT INTO pedido_items (pedido_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    const pedidoId = insertarPedido.run(clienteId, estado, total).lastInsertRowid;
    for (const item of items) {
      insertarItem.run(
        pedidoId,
        item.productoId,
        item.nombre,
        item.cantidad,
        item.precioUnitario,
        item.subtotal
      );
    }
    return pedidoId;
  });

  return tx();
}

function buscarPorId(id) {
  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
}

function listarItems(pedidoId) {
  return db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedidoId);
}

function cambiarEstado(id, estado) {
  db.prepare(
    "UPDATE pedidos SET estado = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).run(estado, id);
}

// Último pedido (cualquier estado) de un cliente, para B.7/B.8/B.9.
function buscarUltimoPorCliente(clienteId) {
  return db
    .prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY id DESC LIMIT 1')
    .get(clienteId);
}

// Últimos N pedidos (cualquier estado), con el nombre del cliente — para el
// atajo "ventas" del admin (historial reciente, no solo lo activo). LEFT JOIN
// a propósito: el panel de gestión puede crear ventas con cliente_id NULL
// (venta de mostrador, sin cliente asociado — ver panel/lib/repo.js
// crearVenta) y con un INNER JOIN esas ventas quedaban afuera en silencio.
function listarRecientes(limite = 5) {
  return db
    .prepare(
      `SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM pedidos p
       LEFT JOIN clientes c ON c.id = p.cliente_id
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`
    )
    .all(limite);
}

// Pedidos en curso (ni retirados ni cancelados), con el nombre del cliente.
// LEFT JOIN por el mismo motivo que listarRecientes: una venta de mostrador
// del panel (sin cliente, ver panel/lib/repo.js) puede quedar en un estado
// no terminal (ej. "confirmado", para preparar antes de retirar).
function listarActivos() {
  return db
    .prepare(
      `SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM pedidos p
       LEFT JOIN clientes c ON c.id = p.cliente_id
       WHERE p.estado NOT IN ('retirado', 'cancelado')
       ORDER BY p.created_at`
    )
    .all();
}

module.exports = {
  ESTADOS,
  crearConItems,
  buscarPorId,
  listarItems,
  cambiarEstado,
  listarActivos,
  listarRecientes,
  buscarUltimoPorCliente,
};
