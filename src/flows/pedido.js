// Flujo conversacional de clientes: registro, pedir directo (sin menú
// obligatorio), catálogo, consultar/repetir/cancelar pedido (Parte B de
// COMPORTAMIENTO-CLIENTES-EMPLEADOS.md). El estado vive en SQLite, mismo
// patrón persistido que los demás flujos.
const { enviarMensaje, resolverDestino } = require('../bot/client');
const estados = require('../db/queries/estados');
const clientesQueries = require('../db/queries/clientes');
const productosQueries = require('../db/queries/productos');
const pedidosQueries = require('../db/queries/pedidos');
const { parsearPedido, calcularTotal, formatearResumen, normalizar } = require('../utils/parserPedido');
const { formatearMonto } = require('../utils/validadores');
const empleadoActivo = require('./empleadoActivo');
const cronTareas = require('../cron/tareas');
const logger = require('../utils/logger');

const FLUJO = 'pedido';

function tieneLetras(texto) {
  return /[a-zA-ZÀ-ÿ]/.test(texto || '');
}

// Coincidencia tolerante por inclusión (sin acentos), mismo enfoque que el
// resto del parseo por palabras clave del proyecto.
function contieneAlguna(texto, palabras) {
  const t = normalizar(texto || '');
  return palabras.some((p) => t.includes(p));
}

// Saludos comunes que NO se aceptan como nombre propio (ej. el cliente responde
// "Hola" a "¿Cuál es tu nombre?" sin darse cuenta de que el bot espera un nombre).
const SALUDOS_NO_SON_NOMBRE = [
  'hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'holis',
];

function esSaludoNoNombre(texto) {
  return SALUDOS_NO_SON_NOMBRE.includes((texto || '').trim().toLowerCase());
}

// true si el mensaje no es texto plano (sticker, foto, audio, ubicación, etc.).
// Esos mensajes no son una respuesta válida a "¿cuál es tu nombre?" y no hay que
// insistir por cada uno: solo confunde (ya se preguntó una vez al iniciar el contacto).
function esMensajeNoTextual(msg) {
  return msg.type !== 'chat';
}

// Palabras que justifican mostrarle el menú/ayuda a un cliente ya conocido.
// Sin esto, cualquier comentario casual ("gracias", "jaja") después de un pedido
// hacía que el bot le insistiera con "Respondé 1 o 2", compitiendo con la charla.
const SALUDOS_O_PEDIDO = [
  'hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches',
  'pedido', 'menu', 'menú', 'ayuda',
];

function pareceSaludoOPedido(texto) {
  const t = (texto || '').trim().toLowerCase();
  return SALUDOS_O_PEDIDO.some((palabra) => t.includes(palabra));
}

const PALABRAS_AGRADECIMIENTO = ['gracias', 'thank'];

function pareceAgradecimiento(texto) {
  const t = (texto || '').trim().toLowerCase();
  return PALABRAS_AGRADECIMIENTO.some((palabra) => t.includes(palabra));
}

// Palabras que sacan al cliente de cualquier paso del flujo (menú/pedido/confirmación)
// y lo devuelven al menú principal. Sin esto, un cliente que escribe cosas que no
// matchean ningún producto (o que se arrepiente) quedaba sin ninguna salida posible.
const PALABRAS_CANCELAR = ['cancelar', 'volver', 'menu', 'menú'];

function esCancelar(texto) {
  return PALABRAS_CANCELAR.includes((texto || '').trim().toLowerCase());
}

// Intenciones nuevas del cliente conocido (B.3), por orden de chequeo.
const PALABRAS_CATALOGO = ['precios', 'catalogo', 'lista', 'que tienen'];
const PALABRAS_MI_PEDIDO = ['mi pedido', 'esta listo', 'listo?', 'estado'];
const PALABRAS_REPETIR = ['lo de siempre', 'repetir', 'el de siempre'];

async function mostrarMenu(client, destino, telefono, nombre) {
  estados.setEstado(telefono, FLUJO, 'menu', {});
  await enviarMensaje(
    client,
    destino,
    `¡Hola ${nombre}! ¿En qué te ayudo?\n1) Hacer un pedido\n2) Servicio técnico\n(o escribime tu pedido directo, ej: "2 cocas y un pan")`
  );
}

// Bienvenida de primer contacto (B.2): invita a pedir directo, no es un menú
// con opciones numeradas — esas quedan como ayuda opcional (B.5).
async function enviarBienvenida(client, destino, nombre) {
  await enviarMensaje(
    client,
    destino,
    `¡Hola ${nombre}! 🛒 Escribime tu pedido cuando quieras\n` +
      '(ej: "2 cocas y un pan") y te paso el total.\n' +
      'También podés escribir *precios* para ver el catálogo.'
  );
}

// Deja el pedido armado esperando confirmación (B.4). Lo usan tanto "escribime
// tu pedido" (paso esperando_items) como el pedido directo sin pasar por el
// menú, y el re-precio de "repetir" cuando no hubo cambios de precio.
async function irAConfirmacion(client, msg, telefono, items) {
  estados.setEstado(telefono, FLUJO, 'esperando_confirmacion', { items });
  await enviarMensaje(
    client,
    msg.from,
    `Esto entendí:\n${formatearResumen(items)}\n\n¿Confirmás? Respondé *Sí* o *No*.`
  );
}

// B.6: catálogo con precios.
async function verCatalogo(client, msg) {
  const productos = productosQueries.listarActivos();
  if (productos.length === 0) {
    await enviarMensaje(client, msg.from, 'Todavía no cargué el catálogo, probá más tarde.');
    return;
  }
  const lineas = productos.map((p) => `• ${p.nombre} — ${formatearMonto(p.precio)}`);
  await enviarMensaje(
    client,
    msg.from,
    `🛒 Esto tenemos hoy:\n${lineas.join('\n')}\n\nEscribime tu pedido, ej: "2 cocas y medio kilo de jamón".`
  );
}

// B.7: estado del último pedido.
const ETIQUETAS_ESTADO_PEDIDO = {
  pendiente: 'pendiente',
  confirmado: 'confirmado',
  en_preparacion: 'en preparación',
  listo: 'listo para retirar',
  retirado: 'retirado',
  cancelado: 'cancelado',
};

async function consultarUltimoPedido(client, msg, cliente) {
  const ultimo = pedidosQueries.buscarUltimoPorCliente(cliente.id);
  if (!ultimo) {
    await enviarMensaje(client, msg.from, 'No te encuentro pedidos activos. ¿Querés hacer uno?');
    return;
  }
  const etiqueta = ETIQUETAS_ESTADO_PEDIDO[ultimo.estado] || ultimo.estado;
  await enviarMensaje(client, msg.from, `Tu pedido #${ultimo.id} está *${etiqueta}*. Te aviso cuando esté listo. 🛍️`);
}

// B.8: re-precia los ítems de un pedido viejo contra el catálogo actual.
// Devuelve los ítems nuevos (con precio/subtotal de hoy), qué cambió de
// precio, y qué productos ya no existen en el catálogo (se sacan del pedido).
function reprecisarItems(itemsViejos, productosActuales) {
  const itemsNuevos = [];
  const cambios = [];
  const eliminados = [];

  for (const item of itemsViejos) {
    const producto = productosActuales.find((p) => p.id === item.producto_id);
    if (!producto) {
      eliminados.push(item.nombre);
      continue;
    }

    const subtotal = Math.round(item.cantidad * producto.precio * 100) / 100;
    itemsNuevos.push({
      productoId: producto.id,
      nombre: producto.nombre,
      precioUnitario: producto.precio,
      cantidad: item.cantidad,
      subtotal,
    });

    if (producto.precio !== item.precio_unitario) {
      cambios.push({ nombre: producto.nombre, antesUnitario: item.precio_unitario });
    }
  }

  return { itemsNuevos, cambios, eliminados };
}

async function repetirPedido(client, msg, telefono, cliente) {
  const ultimo = pedidosQueries.buscarUltimoPorCliente(cliente.id);
  if (!ultimo) {
    await enviarMensaje(client, msg.from, 'No tengo un pedido anterior tuyo todavía.');
    return;
  }

  const itemsViejos = pedidosQueries.listarItems(ultimo.id);
  const productosActuales = productosQueries.listarActivos();
  const { itemsNuevos, cambios, eliminados } = reprecisarItems(itemsViejos, productosActuales);

  if (itemsNuevos.length === 0) {
    await enviarMensaje(
      client,
      msg.from,
      'Los productos de tu último pedido ya no están disponibles. Decime qué más querés pedir.'
    );
    return;
  }

  if (cambios.length === 0 && eliminados.length === 0) {
    await irAConfirmacion(client, msg, telefono, itemsNuevos);
    return;
  }

  const lineas = itemsNuevos.map((it) => {
    const cambio = cambios.find((c) => c.nombre === it.nombre);
    const detalle = cambio
      ? `${formatearMonto(it.subtotal)} (antes ${formatearMonto(cambio.antesUnitario * it.cantidad)})`
      : `${formatearMonto(it.subtotal)} (igual)`;
    return `  ${it.cantidad}x ${it.nombre} — ${detalle}`;
  });
  const notaEliminados = eliminados.length > 0 ? `\n(Ya no tenemos: ${eliminados.join(', ')}.)` : '';

  estados.setEstado(telefono, FLUJO, 'esperando_confirmacion', { items: itemsNuevos });
  await enviarMensaje(
    client,
    msg.from,
    `⚠️ Ojo, cambiaron algunos precios desde tu último pedido:\n${lineas.join('\n')}\n` +
      `Total ahora: ${formatearMonto(calcularTotal(itemsNuevos))}${notaEliminados}\n\n` +
      '¿Confirmás así? Respondé *Sí*, o escribime un pedido distinto.'
  );
}

// B.9: cancelar el último pedido no retirado/cancelado.
async function iniciarCancelacion(client, msg, telefono, cliente) {
  const ultimo = pedidosQueries.buscarUltimoPorCliente(cliente.id);
  if (!ultimo || ultimo.estado === 'retirado' || ultimo.estado === 'cancelado') {
    await enviarMensaje(client, msg.from, 'No tenés ningún pedido pendiente para cancelar.');
    return;
  }

  const items = pedidosQueries.listarItems(ultimo.id);
  const detalleItems = items.map((it) => `${it.cantidad}x ${it.nombre}`).join(', ');
  estados.setEstado(telefono, FLUJO, 'esperando_confirmacion_cancelar', { pedidoId: ultimo.id });
  await enviarMensaje(client, msg.from, `¿Cancelo tu pedido #${ultimo.id} (${detalleItems})? Respondé *Sí* o *No*.`);
}

// Destinatarios del aviso de pedido nuevo/cancelado (A.6): el empleado activo
// vigente, o si no hay (o ya expiró), los de turno hoy (apertura y cierre)
// según `turnos`; el admin siempre, sin duplicar si coincide.
async function destinatariosPersonal() {
  const destinos = new Set();

  const activo = empleadoActivo.getActivoVigente();
  if (activo) {
    destinos.add(activo.empleado_telefono);
  } else {
    for (const franja of ['apertura', 'cierre']) {
      const persona = cronTareas.resolverPersonaDeHoy(franja);
      if (persona) destinos.add(persona.telefono);
    }
  }

  destinos.add(process.env.ADMIN_NUMBER);
  return [...destinos];
}

async function avisarPersonal(client, mensaje) {
  const destinos = await destinatariosPersonal();
  for (const telefono of destinos) {
    const destino = await resolverDestino(client, telefono);
    await enviarMensaje(client, destino, mensaje);
  }
}

async function notificarPedidoNuevo(client, pedidoId, cliente, items, total) {
  const detalleItems = items.map((it) => `${it.cantidad}x ${it.nombre}`).join(', ');
  await avisarPersonal(
    client,
    `🛒 Pedido nuevo #${pedidoId} — ${cliente.nombre || cliente.telefono}: ${detalleItems} · Total ${formatearMonto(total)}`
  );
}

/**
 * Orden de chequeo de intenciones para un cliente conocido sin flujo activo
 * (B.3): catálogo → mi pedido → repetir → cancelar → técnico → gracias →
 * saludo/menú → pedido directo (parsea) → silencio.
 */
async function procesarClienteConocido(client, msg, telefono, cliente) {
  const texto = msg.body || '';

  if (contieneAlguna(texto, PALABRAS_CATALOGO)) {
    await verCatalogo(client, msg);
    return;
  }

  if (contieneAlguna(texto, PALABRAS_MI_PEDIDO)) {
    await consultarUltimoPedido(client, msg, cliente);
    return;
  }

  if (contieneAlguna(texto, PALABRAS_REPETIR)) {
    await repetirPedido(client, msg, telefono, cliente);
    return;
  }

  if (contieneAlguna(texto, ['cancelar'])) {
    await iniciarCancelacion(client, msg, telefono, cliente);
    return;
  }

  if (contieneAlguna(texto, ['tecnico'])) {
    await enviarMensaje(client, msg.from, 'El servicio técnico todavía no está disponible por acá.');
    return;
  }

  if (pareceAgradecimiento(texto)) {
    await enviarMensaje(client, msg.from, '¡De nada! 🙂');
    return;
  }

  if (pareceSaludoOPedido(texto)) {
    await mostrarMenu(client, msg.from, telefono, cliente.nombre || 'che');
    return;
  }

  // B.4: si el texto parsea como pedido, va directo a confirmación sin pasar
  // por el menú.
  const productos = productosQueries.listarActivos();
  const items = parsearPedido(texto, productos);
  if (items.length > 0) {
    await irAConfirmacion(client, msg, telefono, items);
    return;
  }

  // Charla casual sin ninguna intención reconocida: no respondemos (igual que hoy).
}

/**
 * Primer contacto de un número que no es admin ni empleado. Registra al cliente
 * (tomando el nombre del perfil de WhatsApp si tiene letras, o preguntándolo).
 * Si el primer mensaje ya es un pedido reconocible, va directo a confirmación
 * (B.2); si no, manda la bienvenida que invita a pedir directo.
 */
async function iniciarConversacion(client, msg, telefono) {
  const cliente = clientesQueries.buscarPorTelefono(telefono);

  if (!cliente) {
    const contacto = await msg.getContact();
    const nombrePerfil = contacto.pushname || contacto.name || '';

    if (tieneLetras(nombrePerfil)) {
      clientesQueries.crear({ telefono, nombre: nombrePerfil });
      logger.info(`Cliente nuevo registrado: ${nombrePerfil} (${telefono})`);

      const productos = productosQueries.listarActivos();
      const items = parsearPedido(msg.body, productos);
      if (items.length > 0) {
        await irAConfirmacion(client, msg, telefono, items);
      } else {
        await enviarBienvenida(client, msg.from, nombrePerfil);
      }
    } else {
      clientesQueries.crear({ telefono, nombre: null });
      estados.setEstado(telefono, FLUJO, 'esperando_nombre', {});
      await enviarMensaje(client, msg.from, '¡Hola! ¿Cuál es tu nombre?');
    }
    return;
  }

  await procesarClienteConocido(client, msg, telefono, cliente);
}

async function procesarNombre(client, msg, telefono) {
  // Sticker/foto/audio sin texto: no es una respuesta, no insistimos por cada uno.
  if (esMensajeNoTextual(msg)) return;

  const nombre = msg.body.trim();
  if (!tieneLetras(nombre) || esSaludoNoNombre(nombre)) {
    await enviarMensaje(client, msg.from, 'Ese no parece tu nombre 🙂 ¿Cómo te llamás?');
    return;
  }
  clientesQueries.actualizarNombre(telefono, nombre);
  logger.info(`Cliente ${telefono} se registró como "${nombre}"`);
  estados.clearEstado(telefono);
  await enviarBienvenida(client, msg.from, nombre);
}

async function procesarMenu(client, msg, telefono) {
  const texto = msg.body.trim().toLowerCase();

  if (texto === '1') {
    estados.setEstado(telefono, FLUJO, 'esperando_items', {});
    await enviarMensaje(
      client,
      msg.from,
      'Escribime tu pedido y te paso el total.\nPor ejemplo: 2 cocas y un pan.'
    );
    return;
  }

  if (texto === '2') {
    await enviarMensaje(
      client,
      msg.from,
      'El servicio técnico todavía no está disponible por acá. Escribí *1* para hacer un pedido.'
    );
    return;
  }

  // No es "1"/"2": el menú es ayuda opcional (B.5), así que cualquier otra
  // intención (catálogo, pedido directo, etc.) se procesa igual.
  estados.clearEstado(telefono);
  const cliente = clientesQueries.buscarPorTelefono(telefono);
  if (!cliente) {
    logger.error(`procesarMenu: no encontré cliente con teléfono ${telefono}`);
    return;
  }
  await procesarClienteConocido(client, msg, telefono, cliente);
}

async function procesarItems(client, msg, telefono) {
  const productos = productosQueries.listarActivos();
  const items = parsearPedido(msg.body, productos);

  if (items.length === 0) {
    const detalle =
      productos.length === 0
        ? 'Todavía no tengo el catálogo cargado, probá más tarde. Escribí *menu* para volver.'
        : 'No reconocí ningún producto. Escribilo simple, por ejemplo: 2 cocas y un pan.\nEscribí *menu* para volver.';
    await enviarMensaje(client, msg.from, detalle);
    return;
  }

  await irAConfirmacion(client, msg, telefono, items);
}

async function procesarConfirmacion(client, msg, telefono, estado) {
  const texto = msg.body.trim().toLowerCase();
  const afirmativo = ['si', 'sí', 's', 'dale', 'ok', 'confirmo', 'listo'];
  const negativo = ['no', 'n', 'cambiar', 'cancelar'];

  if (afirmativo.includes(texto)) {
    const cliente = clientesQueries.buscarPorTelefono(telefono);
    if (!cliente) {
      logger.error(`procesarConfirmacion: no encontré cliente con teléfono ${telefono}`);
      estados.clearEstado(telefono);
      await enviarMensaje(client, msg.from, '⚠️ Uy, no te encuentro registrado. Escribime de nuevo tu pedido.');
      return;
    }
    const items = estado.data.items;
    const total = calcularTotal(items);

    const pedidoId = pedidosQueries.crearConItems({
      clienteId: cliente.id,
      total,
      estado: 'confirmado',
      items,
    });

    estados.clearEstado(telefono);
    await enviarMensaje(
      client,
      msg.from,
      `✅ ¡Pedido confirmado! (#${pedidoId})\nTe avisamos cuando esté listo para retirar.`
    );
    await notificarPedidoNuevo(client, pedidoId, cliente, items, total);
    logger.info(`Pedido #${pedidoId} confirmado por cliente ${telefono}`);
    return;
  }

  if (negativo.includes(texto)) {
    estados.setEstado(telefono, FLUJO, 'esperando_items', {});
    await enviarMensaje(client, msg.from, 'Dale, escribime de nuevo tu pedido.');
    return;
  }

  await enviarMensaje(client, msg.from, 'Respondé *Sí* para confirmar o *No* para cambiarlo.');
}

async function procesarConfirmacionCancelar(client, msg, telefono, estado) {
  const texto = msg.body.trim().toLowerCase();
  const afirmativo = ['si', 'sí', 's', 'dale', 'ok', 'confirmo'];
  const negativo = ['no', 'n'];

  if (afirmativo.includes(texto)) {
    const { pedidoId } = estado.data;
    estados.clearEstado(telefono);

    // Re-chequeamos el estado actual del pedido (no solo el que tenía cuando
    // se inició la cancelación): puede haber pasado un rato hasta el "Sí", y
    // mientras tanto un empleado pudo marcarlo "listo"/"retirado". No hay que
    // pisar eso con "cancelado".
    const pedidoActual = pedidosQueries.buscarPorId(pedidoId);
    if (!pedidoActual || pedidoActual.estado === 'retirado' || pedidoActual.estado === 'cancelado') {
      await enviarMensaje(
        client,
        msg.from,
        `Tu pedido #${pedidoId} ya no se puede cancelar (quedó "${pedidoActual ? pedidoActual.estado : 'eliminado'}" mientras tanto).`
      );
      return;
    }

    pedidosQueries.cambiarEstado(pedidoId, 'cancelado');
    await enviarMensaje(client, msg.from, `❌ Pedido #${pedidoId} cancelado.`);
    await avisarPersonal(client, `❌ Pedido #${pedidoId} cancelado por el cliente.`);
    logger.info(`Pedido #${pedidoId} cancelado por cliente ${telefono}`);
    return;
  }

  if (negativo.includes(texto)) {
    estados.clearEstado(telefono);
    await enviarMensaje(client, msg.from, 'Dale, no cancelo nada.');
    return;
  }

  await enviarMensaje(client, msg.from, 'Respondé *Sí* para cancelar o *No* para dejarlo como está.');
}

/**
 * Continúa un flujo de pedido en curso según el paso guardado.
 */
async function continuar(client, msg, telefono, estado) {
  // Salida universal: en cualquier paso (salvo el registro inicial del nombre)
  // el cliente puede escribir "menu"/"volver"/"cancelar" para abandonar lo que
  // estaba haciendo y ver las opciones de nuevo, en vez de quedar sin salida.
  if (estado.paso !== 'esperando_nombre' && estado.paso !== 'esperando_confirmacion_cancelar' && esCancelar(msg.body)) {
    const cliente = clientesQueries.buscarPorTelefono(telefono);
    await mostrarMenu(client, msg.from, telefono, (cliente && cliente.nombre) || 'che');
    return;
  }

  switch (estado.paso) {
    case 'esperando_nombre':
      return procesarNombre(client, msg, telefono);
    case 'menu':
      return procesarMenu(client, msg, telefono);
    case 'esperando_items':
      return procesarItems(client, msg, telefono);
    case 'esperando_confirmacion':
      return procesarConfirmacion(client, msg, telefono, estado);
    case 'esperando_confirmacion_cancelar':
      return procesarConfirmacionCancelar(client, msg, telefono, estado);
    default:
      estados.clearEstado(telefono);
      return undefined;
  }
}

module.exports = { FLUJO, iniciarConversacion, continuar };
