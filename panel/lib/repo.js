// Capa de acceso a datos del panel. Lee/escribe la misma SQLite que el bot.
// Reutiliza el mismo modelo de tablas (pedidos, pedido_items, productos,
// clientes, empleados, aperturas_caja, cierres_caja).
import { getDb } from './db.js';

const ESTADOS_PEDIDO = ['pendiente', 'confirmado', 'en_preparacion', 'listo', 'retirado', 'cancelado'];
export { ESTADOS_PEDIDO };

// ===================== PEDIDOS =====================

export function listarPedidos({ estados = null, limite = 200 } = {}) {
  const db = getDb();
  let sql = `
    SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM pedidos p
    LEFT JOIN clientes c ON c.id = p.cliente_id`;
  const params = [];
  if (estados && estados.length) {
    sql += ` WHERE p.estado IN (${estados.map(() => '?').join(',')})`;
    params.push(...estados);
  }
  sql += ` ORDER BY p.created_at DESC LIMIT ?`;
  params.push(limite);
  return db.prepare(sql).all(...params);
}

// Pedidos en curso (los que importan en el tablero operativo).
export function listarPedidosActivos() {
  return listarPedidos({ estados: ['pendiente', 'confirmado', 'en_preparacion', 'listo'] });
}

export function pedidoConItems(id) {
  const db = getDb();
  const pedido = db
    .prepare(
      `SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`
    )
    .get(id);
  if (!pedido) return null;
  pedido.items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(id);
  return pedido;
}

export function cambiarEstadoPedido(id, estado) {
  if (!ESTADOS_PEDIDO.includes(estado)) throw new Error(`Estado inválido: ${estado}`);
  getDb()
    .prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(estado, id);
}

// Crea una venta (pedido + items) desde el panel/POS en una sola transacción.
// Si la venta queda 'retirado' (mostrador), descuenta stock en el acto.
// items: [{ productoId, nombre, cantidad, precioUnitario }]
export function crearVenta({ clienteId = null, estado = 'retirado', medioPago = null, empleadoId = null, items }) {
  const db = getDb();
  if (!items || !items.length) throw new Error('La venta no tiene items.');

  const insertarPedido = db.prepare(
    'INSERT INTO pedidos (cliente_id, estado, total, medio_pago, stock_descontado) VALUES (?, ?, ?, ?, ?)'
  );
  const insertarItem = db.prepare(
    `INSERT INTO pedido_items (pedido_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const descontar = estado === 'retirado';

  const tx = db.transaction(() => {
    let total = 0;
    const normalizados = items.map((it) => {
      const cantidad = Number(it.cantidad) || 0;
      const precio = Number(it.precioUnitario) || 0;
      const subtotal = Math.round(cantidad * precio * 100) / 100;
      total += subtotal;
      return { ...it, cantidad, precio, subtotal };
    });
    const pedidoId = insertarPedido
      .run(clienteId, estado, total, medioPago, descontar ? 1 : 0)
      .lastInsertRowid;
    for (const it of normalizados) {
      insertarItem.run(pedidoId, it.productoId || null, it.nombre, it.cantidad, it.precio, it.subtotal);
      if (descontar && it.productoId) {
        aplicarMovimientoStock(db, {
          productoId: it.productoId,
          tipo: 'venta',
          delta: -it.cantidad,
          motivo: `Venta #${pedidoId}`,
          pedidoId,
          empleadoId,
        });
      }
    }
    return pedidoId;
  });
  return tx();
}

// ===================== STOCK =====================

// Aplica un delta de stock a un producto y registra el movimiento. Pensada para
// usarse DENTRO de una transacción (recibe la conexión db). delta puede ser
// negativo (venta) o positivo (ingreso). tipo: 'venta'|'ingreso'|'ajuste'.
function aplicarMovimientoStock(db, { productoId, tipo, delta, motivo = null, pedidoId = null, empleadoId = null }) {
  db.prepare('UPDATE productos SET stock = stock + ? WHERE id = ?').run(delta, productoId);
  const resultante = db.prepare('SELECT stock FROM productos WHERE id = ?').get(productoId)?.stock ?? null;
  db.prepare(
    `INSERT INTO movimientos_stock (producto_id, tipo, cantidad, stock_resultante, motivo, pedido_id, empleado_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(productoId, tipo, delta, resultante, motivo, pedidoId, empleadoId);
  return resultante;
}

// Ingreso de stock (compra/reposición): suma unidades.
export function ingresarStock({ productoId, cantidad, motivo = 'Ingreso', empleadoId = null }) {
  const db = getDb();
  const c = Math.abs(Number(cantidad) || 0);
  if (!c) throw new Error('La cantidad debe ser mayor a cero.');
  return db.transaction(() =>
    aplicarMovimientoStock(db, { productoId, tipo: 'ingreso', delta: c, motivo, empleadoId })
  )();
}

// Ajuste de stock: fija el stock a un valor exacto (conteo/inventario).
export function ajustarStock({ productoId, nuevoValor, motivo = 'Ajuste', empleadoId = null }) {
  const db = getDb();
  const objetivo = Number(nuevoValor) || 0;
  return db.transaction(() => {
    const actual = db.prepare('SELECT stock FROM productos WHERE id = ?').get(productoId)?.stock ?? 0;
    const delta = objetivo - actual;
    return aplicarMovimientoStock(db, { productoId, tipo: 'ajuste', delta, motivo, empleadoId });
  })();
}

// Descuenta el stock de un pedido (sus items) una sola vez. Idempotente: si el
// pedido ya tenía stock_descontado=1, no hace nada. Se usa al marcar 'retirado'.
export function descontarStockDePedido(pedidoId, empleadoId = null) {
  const db = getDb();
  return db.transaction(() => {
    const pedido = db.prepare('SELECT stock_descontado FROM pedidos WHERE id = ?').get(pedidoId);
    if (!pedido || pedido.stock_descontado) return false;
    const items = db.prepare('SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?').all(pedidoId);
    for (const it of items) {
      if (it.producto_id) {
        aplicarMovimientoStock(db, {
          productoId: it.producto_id,
          tipo: 'venta',
          delta: -it.cantidad,
          motivo: `Pedido #${pedidoId} retirado`,
          pedidoId,
          empleadoId,
        });
      }
    }
    db.prepare('UPDATE pedidos SET stock_descontado = 1 WHERE id = ?').run(pedidoId);
    return true;
  })();
}

export function listarBajoStock() {
  return getDb()
    .prepare('SELECT * FROM productos WHERE activo = 1 AND stock <= stock_minimo ORDER BY stock, nombre')
    .all();
}

export function listarMovimientos({ productoId = null, limite = 100 } = {}) {
  const db = getDb();
  if (productoId) {
    return db
      .prepare(
        `SELECT m.*, p.nombre AS producto_nombre, e.nombre AS empleado_nombre
         FROM movimientos_stock m
         LEFT JOIN productos p ON p.id = m.producto_id
         LEFT JOIN empleados e ON e.id = m.empleado_id
         WHERE m.producto_id = ? ORDER BY m.id DESC LIMIT ?`
      )
      .all(productoId, limite);
  }
  return db
    .prepare(
      `SELECT m.*, p.nombre AS producto_nombre, e.nombre AS empleado_nombre
       FROM movimientos_stock m
       LEFT JOIN productos p ON p.id = m.producto_id
       LEFT JOIN empleados e ON e.id = m.empleado_id
       ORDER BY m.id DESC LIMIT ?`
    )
    .all(limite);
}

// ===================== PRODUCTOS =====================

export function listarProductos({ soloActivos = false } = {}) {
  const db = getDb();
  const sql = soloActivos
    ? 'SELECT * FROM productos WHERE activo = 1 ORDER BY nombre'
    : 'SELECT * FROM productos ORDER BY activo DESC, nombre';
  return db.prepare(sql).all();
}

export function crearProducto({ nombre, precio, palabrasClave = '', activo = 1, stock = 0, stockMinimo = 0, codigoBarras = null }) {
  return getDb()
    .prepare(
      `INSERT INTO productos (nombre, precio, palabras_clave, activo, stock, stock_minimo, codigo_barras)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(nombre, precio, palabrasClave, activo ? 1 : 0, stock, stockMinimo, codigoBarras || null).lastInsertRowid;
}

export function actualizarProducto(id, { nombre, precio, palabrasClave, activo, stockMinimo, codigoBarras }) {
  // El stock no se edita acá (se mueve con ingresos/ajustes), salvo el mínimo.
  getDb()
    .prepare(
      `UPDATE productos SET nombre = ?, precio = ?, palabras_clave = ?, activo = ?, stock_minimo = ?, codigo_barras = ?
       WHERE id = ?`
    )
    .run(nombre, precio, palabrasClave, activo ? 1 : 0, stockMinimo ?? 0, codigoBarras || null, id);
}

export function eliminarProducto(id) {
  // Borrado lógico: nunca borramos físico para no romper el historial de items.
  getDb().prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(id);
}

// ===================== CLIENTES =====================

export function listarClientes() {
  return getDb()
    .prepare(
      `SELECT c.*,
              COUNT(p.id) AS cantidad_pedidos,
              COALESCE(SUM(CASE WHEN p.estado = 'retirado' THEN p.total ELSE 0 END), 0) AS total_gastado
       FROM clientes c
       LEFT JOIN pedidos p ON p.cliente_id = c.id
       GROUP BY c.id
       ORDER BY total_gastado DESC, c.nombre`
    )
    .all();
}

// Búsqueda rápida de clientes para asociar a una venta en el POS.
export function buscarClientesPOS(q, limite = 8) {
  const term = `%${String(q || '').trim()}%`;
  return getDb()
    .prepare(
      `SELECT id, nombre, telefono FROM clientes
       WHERE nombre LIKE ? OR telefono LIKE ?
       ORDER BY nombre LIMIT ?`
    )
    .all(term, term, limite);
}

export function clienteConHistorial(id) {
  const db = getDb();
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  if (!cliente) return null;
  cliente.pedidos = db
    .prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY created_at DESC')
    .all(id);
  return cliente;
}

// ===================== VENTAS / REPORTES =====================

// Una venta cuenta para el reporte cuando el pedido está retirado (entregado).
const COND_VENTA = "estado = 'retirado'";

// Fecha de hoy según la hora local de la máquina (igual criterio que el bot).
export function fechaHoy() {
  return getDb().prepare("SELECT date('now','localtime') AS d").get().d;
}

export function resumenVentas({ desde, hasta }) {
  const db = getDb();
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM pedidos
       WHERE ${COND_VENTA} AND date(created_at) BETWEEN ? AND ?`
    )
    .get(desde, hasta);
  return fila;
}

export function ventasPorDia({ dias = 14 } = {}) {
  return getDb()
    .prepare(
      `SELECT date(created_at) AS dia, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
       FROM pedidos
       WHERE ${COND_VENTA} AND date(created_at) >= date('now','localtime', ?)
       GROUP BY dia ORDER BY dia DESC`
    )
    .all(`-${dias} days`);
}

export function topProductos({ desde, hasta, limite = 10 }) {
  return getDb()
    .prepare(
      `SELECT i.nombre,
              SUM(i.cantidad) AS unidades,
              SUM(i.subtotal) AS total
       FROM pedido_items i
       JOIN pedidos p ON p.id = i.pedido_id
       WHERE p.${COND_VENTA} AND date(p.created_at) BETWEEN ? AND ?
       GROUP BY i.nombre
       ORDER BY total DESC
       LIMIT ?`
    )
    .all(desde, hasta, limite);
}

// ===================== CAJA (resumen de hoy) =====================

export function resumenCajaHoy() {
  const db = getDb();
  const aperturas = db
    .prepare(
      `SELECT a.*, e.nombre AS empleado_nombre
       FROM aperturas_caja a LEFT JOIN empleados e ON e.id = a.empleado_id
       WHERE a.fecha = date('now','localtime') ORDER BY a.caja`
    )
    .all();
  const cierres = db
    .prepare(
      `SELECT cc.*, e.nombre AS empleado_nombre
       FROM cierres_caja cc LEFT JOIN empleados e ON e.id = cc.empleado_id
       WHERE cc.fecha = date('now','localtime') ORDER BY cc.caja`
    )
    .all();
  const ventasHoy = db
    .prepare(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
       FROM pedidos WHERE ${COND_VENTA} AND date(created_at) = date('now','localtime')`
    )
    .get();
  return { aperturas, cierres, ventasHoy };
}

// ===================== EMPLEADOS =====================

export function listarEmpleados() {
  return getDb()
    .prepare('SELECT id, nombre, telefono, rol, activo FROM empleados ORDER BY rol, nombre')
    .all();
}

export function empleadoPorTelefono(telefono) {
  return getDb().prepare('SELECT * FROM empleados WHERE telefono = ?').get(telefono);
}

export function empleadoPorId(id) {
  return getDb().prepare('SELECT * FROM empleados WHERE id = ?').get(id);
}

export function crearEmpleado({ nombre, telefono, rol = 'empleado' }) {
  return getDb()
    .prepare('INSERT INTO empleados (nombre, telefono, rol, activo) VALUES (?, ?, ?, 1)')
    .run(nombre, telefono, rol).lastInsertRowid;
}

export function actualizarEmpleado(id, { nombre, rol, activo }) {
  getDb()
    .prepare('UPDATE empleados SET nombre = ?, rol = ?, activo = ? WHERE id = ?')
    .run(nombre, rol, activo ? 1 : 0, id);
}

// ===================== CÓDIGOS 2FA (login por WhatsApp) =====================

export function guardarCodigo(telefono, codigoHash, expiraAt) {
  getDb()
    .prepare(
      `INSERT INTO panel_codigos (telefono, codigo_hash, expira_at, intentos, enviado_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(telefono) DO UPDATE SET
         codigo_hash = excluded.codigo_hash,
         expira_at   = excluded.expira_at,
         intentos    = 0,
         enviado_at  = excluded.enviado_at`
    )
    .run(telefono, codigoHash, expiraAt, Date.now());
}

export function getCodigo(telefono) {
  return getDb().prepare('SELECT * FROM panel_codigos WHERE telefono = ?').get(telefono);
}

export function sumarIntentoCodigo(telefono) {
  getDb().prepare('UPDATE panel_codigos SET intentos = intentos + 1 WHERE telefono = ?').run(telefono);
}

export function borrarCodigo(telefono) {
  getDb().prepare('DELETE FROM panel_codigos WHERE telefono = ?').run(telefono);
}
