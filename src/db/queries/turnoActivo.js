// Consultas sobre el empleado activo del día (COMPORTAMIENTO-CLIENTES-EMPLEADOS.md
// A.1.b/A.1.c). Una fila nueva por cada vez que alguien queda a cargo; la última
// fila de la fecha de hoy es la vigente.
const db = require('../index');
const { fechaHoy } = require('../../utils/fechas');

function setActivo(empleadoId, activoHasta = null) {
  const resultado = db
    .prepare('INSERT INTO turno_activo (fecha, empleado_id, activo_hasta) VALUES (?, ?, ?)')
    .run(fechaHoy(), empleadoId, activoHasta);
  return resultado.lastInsertRowid;
}

function getActivoDeHoy() {
  return db
    .prepare(
      `SELECT ta.*, e.nombre AS empleado_nombre, e.telefono AS empleado_telefono
       FROM turno_activo ta
       JOIN empleados e ON e.id = ta.empleado_id
       WHERE ta.fecha = ?
       ORDER BY ta.id DESC LIMIT 1`
    )
    .get(fechaHoy());
}

function setActivoHasta(id, activoHasta) {
  db.prepare('UPDATE turno_activo SET activo_hasta = ? WHERE id = ?').run(activoHasta, id);
}

// Termina el turno de `empleadoId`: nueva fila marcada activo=0, que pasa a
// ser la última del día — getActivoDeHoy() la devuelve y getActivoVigente()
// la interpreta como "nadie activo" hasta que alguien tome el turno de nuevo.
function marcarInactivo(empleadoId) {
  const resultado = db
    .prepare('INSERT INTO turno_activo (fecha, empleado_id, activo) VALUES (?, ?, 0)')
    .run(fechaHoy(), empleadoId);
  return resultado.lastInsertRowid;
}

// Higiene de la tabla: borra filas de días anteriores (la lógica de getActivoDeHoy
// ya las ignora por fecha, así que esto no afecta el comportamiento, solo evita
// que la tabla crezca sin límite).
function limpiarAnteriores() {
  db.prepare('DELETE FROM turno_activo WHERE fecha <> ?').run(fechaHoy());
}

module.exports = { setActivo, getActivoDeHoy, setActivoHasta, marcarInactivo, limpiarAnteriores };
