// Consultas sobre la tabla turnos (quién abre/cierra cada día).
const db = require('../index');

/**
 * Busca el turno de una franja ('apertura' | 'cierre') para un día de la semana.
 * @param {number} diaSemana 0=domingo ... 6=sábado
 * @param {string} franja
 */
function buscarTurno(diaSemana, franja) {
  return db
    .prepare('SELECT * FROM turnos WHERE dia_semana = ? AND franja = ?')
    .get(diaSemana, franja);
}

function listarTodos() {
  return db.prepare('SELECT * FROM turnos ORDER BY dia_semana, franja').all();
}

function crear({ diaSemana, franja, persona, hora }) {
  const resultado = db
    .prepare(
      'INSERT INTO turnos (dia_semana, franja, persona, hora) VALUES (?, ?, ?, ?)'
    )
    .run(diaSemana, franja, persona, hora);
  return resultado.lastInsertRowid;
}

function existeAlguno() {
  const fila = db.prepare('SELECT COUNT(*) AS total FROM turnos').get();
  return fila.total > 0;
}

module.exports = { buscarTurno, listarTodos, crear, existeAlguno };
