// Consultas sobre la tabla clientes (Fase 4).
const db = require('../index');

function buscarPorTelefono(telefono) {
  return db.prepare('SELECT * FROM clientes WHERE telefono = ?').get(telefono);
}

function buscarPorId(id) {
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
}

function crear({ telefono, nombre = null }) {
  const resultado = db
    .prepare('INSERT INTO clientes (telefono, nombre) VALUES (?, ?)')
    .run(telefono, nombre);
  return resultado.lastInsertRowid;
}

function actualizarNombre(telefono, nombre) {
  db.prepare('UPDATE clientes SET nombre = ? WHERE telefono = ?').run(nombre, telefono);
}

module.exports = { buscarPorTelefono, buscarPorId, crear, actualizarNombre };
