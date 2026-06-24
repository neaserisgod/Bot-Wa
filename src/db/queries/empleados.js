// Consultas sobre la tabla empleados.
const db = require('../index');

function buscarPorTelefono(telefono) {
  return db.prepare('SELECT * FROM empleados WHERE telefono = ?').get(telefono);
}

function buscarPorId(id) {
  return db.prepare('SELECT * FROM empleados WHERE id = ?').get(id);
}

function buscarActivoPorTelefono(telefono) {
  return db
    .prepare('SELECT * FROM empleados WHERE telefono = ? AND activo = 1')
    .get(telefono);
}

function buscarPorRol(rol) {
  return db.prepare('SELECT * FROM empleados WHERE rol = ? AND activo = 1').get(rol);
}

function listarTodos() {
  return db.prepare('SELECT * FROM empleados').all();
}

function crear({ nombre, telefono, rol = 'empleado', activo = 1 }) {
  const resultado = db
    .prepare(
      'INSERT INTO empleados (nombre, telefono, rol, activo) VALUES (?, ?, ?, ?)'
    )
    .run(nombre, telefono, rol, activo);
  return resultado.lastInsertRowid;
}

module.exports = {
  buscarPorTelefono,
  buscarPorId,
  buscarActivoPorTelefono,
  buscarPorRol,
  listarTodos,
  crear,
};
