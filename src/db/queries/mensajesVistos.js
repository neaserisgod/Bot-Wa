// Deduplicación de mensajes (endurecimiento): WhatsApp puede reenviar mensajes
// recientes al reconectar (confirmado en producción con backlog de grupos al
// arrancar el bot). Si el mismo msg_id ya se procesó, no hay que repetir la
// acción (evita, por ejemplo, registrar dos veces el mismo monto de apertura).
const db = require('../index');

function yaVisto(msgId) {
  return Boolean(db.prepare('SELECT 1 FROM mensajes_vistos WHERE msg_id = ?').get(msgId));
}

function marcarVisto(msgId) {
  db.prepare('INSERT OR IGNORE INTO mensajes_vistos (msg_id) VALUES (?)').run(msgId);
}

// Borra registros viejos para que la tabla no crezca para siempre. El
// reenvío de WhatsApp ocurre, si pasa, muy cerca del momento original — una
// hora de margen es de sobra.
function limpiarAntiguos() {
  db.prepare("DELETE FROM mensajes_vistos WHERE recibido_at < datetime('now', 'localtime', '-1 hours')").run();
}

module.exports = { yaVisto, marcarVisto, limpiarAntiguos };
