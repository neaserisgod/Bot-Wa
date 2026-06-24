// Maneja mensajes de números que no son admin ni empleado: los clientes (Fase 4).
// La continuación de un flujo de pedido ya en curso la resuelve messageHandler
// vía estados_conversacion; acá entran los primeros contactos (sin estado).
const pedidoFlow = require('../flows/pedido');

async function manejar(client, msg, telefono) {
  await pedidoFlow.iniciarConversacion(client, msg, telefono);
}

module.exports = { manejar };
