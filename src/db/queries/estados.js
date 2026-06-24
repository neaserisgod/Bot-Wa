// Persistencia de la máquina de estados de conversación.
// Esto permite que el bot reanude un flujo (ej. cierre de caja) si el proceso
// se reinicia a mitad de camino, ya que el estado vive en SQLite y no en memoria.
const db = require('../index');

function getEstado(telefono) {
  const fila = db
    .prepare('SELECT * FROM estados_conversacion WHERE telefono = ?')
    .get(telefono);
  if (!fila) return null;
  return { ...fila, data: JSON.parse(fila.data) };
}

function setEstado(telefono, flujo, paso, data = {}) {
  db.prepare(
    `INSERT INTO estados_conversacion (telefono, flujo, paso, data, updated_at)
     VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(telefono) DO UPDATE SET
       flujo = excluded.flujo,
       paso = excluded.paso,
       data = excluded.data,
       updated_at = excluded.updated_at`
  ).run(telefono, flujo, paso, JSON.stringify(data));
}

function clearEstado(telefono) {
  db.prepare('DELETE FROM estados_conversacion WHERE telefono = ?').run(telefono);
}

function listarEstadosVencidos(minutosTimeout) {
  return db
    .prepare(
      `SELECT * FROM estados_conversacion
       WHERE updated_at < datetime('now', 'localtime', '-' || ? || ' minutes')`
    )
    .all(minutosTimeout);
}

module.exports = { getEstado, setEstado, clearEstado, listarEstadosVencidos };
