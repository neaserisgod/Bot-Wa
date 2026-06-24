// Consultas sobre el catálogo de productos (Fase 4).
const db = require('../index');

function listarActivos() {
  return db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre').all();
}

function listarTodos() {
  return db.prepare('SELECT * FROM productos ORDER BY nombre').all();
}

function buscarPorId(id) {
  return db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
}

function crear({ nombre, precio, palabrasClave = null, activo = 1 }) {
  const resultado = db
    .prepare(
      'INSERT INTO productos (nombre, precio, palabras_clave, activo) VALUES (?, ?, ?, ?)'
    )
    .run(nombre, precio, palabrasClave, activo);
  return resultado.lastInsertRowid;
}

function contar() {
  return db.prepare('SELECT COUNT(*) AS total FROM productos WHERE activo = 1').get().total;
}

module.exports = { listarActivos, listarTodos, buscarPorId, crear, contar };
