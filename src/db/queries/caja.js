// Consultas sobre apertura y cierre de caja (efectivo y Mercado Pago).
const db = require('../index');

function registrarApertura({ fecha, caja, empleadoId, monto }) {
  const resultado = db
    .prepare(
      'INSERT INTO aperturas_caja (fecha, caja, empleado_id, monto) VALUES (?, ?, ?, ?)'
    )
    .run(fecha, caja, empleadoId, monto);
  return resultado.lastInsertRowid;
}

function buscarApertura(fecha, caja) {
  return db
    .prepare('SELECT * FROM aperturas_caja WHERE fecha = ? AND caja = ?')
    .get(fecha, caja);
}

function listarAperturasDelDia(fecha) {
  return db
    .prepare('SELECT * FROM aperturas_caja WHERE fecha = ? ORDER BY caja')
    .all(fecha);
}

function registrarCierre({ fecha, caja, empleadoId, totalContado, fotoBilletes = null }) {
  const resultado = db
    .prepare(
      `INSERT INTO cierres_caja (fecha, caja, empleado_id, total_contado, foto_billetes)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(fecha, caja, empleadoId, totalContado, fotoBilletes);
  return resultado.lastInsertRowid;
}

function listarCierresDelDia(fecha) {
  return db
    .prepare('SELECT * FROM cierres_caja WHERE fecha = ? ORDER BY caja')
    .all(fecha);
}

function registrarCierreMp({ fecha, empleadoId, fotoMp, monto = null }) {
  const resultado = db
    .prepare(
      'INSERT INTO cierres_mp (fecha, empleado_id, foto_mp, monto) VALUES (?, ?, ?, ?)'
    )
    .run(fecha, empleadoId, fotoMp, monto);
  return resultado.lastInsertRowid;
}

function buscarCierreMpDelDia(fecha) {
  return db.prepare('SELECT * FROM cierres_mp WHERE fecha = ?').get(fecha);
}

module.exports = {
  registrarApertura,
  buscarApertura,
  listarAperturasDelDia,
  registrarCierre,
  listarCierresDelDia,
  registrarCierreMp,
  buscarCierreMpDelDia,
};
