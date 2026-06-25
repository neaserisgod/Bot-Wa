// Router principal de mensajes entrantes:
// estado en curso -> admin -> empleado -> ignorar.
const logger = require('../utils/logger');
const { enviarMensaje } = require('../bot/client');
const empleadosQueries = require('../db/queries/empleados');
const estadosQueries = require('../db/queries/estados');
const mensajesVistosQueries = require('../db/queries/mensajesVistos');
const aperturaFlow = require('../flows/caja');
const cierreFlow = require('../flows/cierre');
const pedidoFlow = require('../flows/pedido');
const menuPersonalFlow = require('../flows/menuPersonal');
const empleadoActivoFlow = require('../flows/empleadoActivo');
const adminHandler = require('./adminHandler');
const employeeHandler = require('./employeeHandler');
const clienteHandler = require('./clienteHandler');

// Continúa un flujo conversacional en curso (apertura/cierre de caja, pedido).
// Devuelve true si el mensaje fue consumido por un flujo activo.
async function continuarFlujoActivo(client, msg, telefono) {
  const estado = estadosQueries.getEstado(telefono);
  if (!estado) return false;

  if (estado.flujo === aperturaFlow.FLUJO) {
    await aperturaFlow.continuarApertura(client, msg, telefono, estado);
    return true;
  }

  if (estado.flujo === cierreFlow.FLUJO) {
    await cierreFlow.continuarCierre(client, msg, telefono, estado);
    return true;
  }

  if (estado.flujo === pedidoFlow.FLUJO) {
    await pedidoFlow.continuar(client, msg, telefono, estado);
    return true;
  }

  if (estado.flujo === menuPersonalFlow.FLUJO) {
    await menuPersonalFlow.continuar(client, msg, telefono, estado);
    return true;
  }

  if (estado.flujo === empleadoActivoFlow.FLUJO) {
    await empleadoActivoFlow.continuar(client, msg, telefono, estado);
    return true;
  }

  return false;
}

function esMensajeDeGrupo(msg) {
  return msg.from.endsWith('@g.us') || msg.from === 'status@broadcast';
}

// Endurecimiento: serializa el procesamiento de mensajes por remitente. Sin
// esto, dos mensajes muy seguidos de la misma persona (ej. manda "5000" y
// "3000" casi pegados) podían interleavearse durante los `await` internos
// (la propia espera de 1s entre envíos de `enviarMensaje` agranda esa ventana)
// y pisarse el estado leído/escrito en SQLite. Remitentes distintos siguen
// procesándose en paralelo, sin esperarse entre ellos.
const colasPorRemitente = new Map();

function encolarPorRemitente(clave, tarea) {
  const anterior = colasPorRemitente.get(clave) || Promise.resolve();
  const actual = anterior.then(tarea, tarea);
  colasPorRemitente.set(clave, actual.catch(() => {}));
  return actual;
}

// Diagnóstico para el watchdog (src/bot/watchdog.js): cuándo se procesó el
// último mensaje, para loguear contexto si el watchdog detecta la sesión
// colgada ("hace cuánto que no entra nada").
let ultimaActividad = Date.now();

function haceCuantoSinActividad() {
  return Date.now() - ultimaActividad;
}

async function manejarMensaje(client, msg) {
  return encolarPorRemitente(msg.from, () => procesarMensaje(client, msg));
}

async function procesarMensaje(client, msg) {
  ultimaActividad = Date.now();
  logger.info(`Mensaje recibido de ${msg.from} (author: ${msg.author}): "${msg.body}"`);

  if (esMensajeDeGrupo(msg)) return;

  // Endurecimiento: WhatsApp puede reenviar mensajes recientes al reconectar
  // (visto en producción con backlog de grupos al arrancar el bot). Si ya
  // procesamos este mensaje exacto, no lo repetimos — evita, por ejemplo,
  // registrar dos veces el mismo monto de apertura si la reconexión reenvía
  // un mensaje que ya habíamos contestado.
  const msgId = msg.id && msg.id._serialized;
  if (msgId) {
    if (mensajesVistosQueries.yaVisto(msgId)) {
      logger.warn(`Mensaje duplicado ignorado (ya procesado): ${msgId}`);
      return;
    }
    mensajesVistosQueries.marcarVisto(msgId);
  }

  const numeroAdmin = process.env.ADMIN_NUMBER;
  let telefono = null;

  try {
    // El remitente puede venir como @c.us (número) o @lid (identificador interno
    // que WhatsApp usa para algunas cuentas). contacto.id._serialized trae el
    // JID con el número de teléfono real; contacto.number no es confiable
    // cuando el chat usa @lid (ahí devuelve el propio LID, no el teléfono).
    const contacto = await msg.getContact();
    telefono = contacto.id._serialized.replace(/@c\.us$/, '');

    // Antes de rutear por rol: si hay un flujo de caja en curso para este
    // número, lo continuamos. El estado vive en SQLite, así que esto funciona
    // incluso si el proceso se reinició a mitad del flujo.
    if (await continuarFlujoActivo(client, msg, telefono)) return;

    if (telefono === numeroAdmin) {
      const admin = empleadosQueries.buscarPorTelefono(telefono);
      await adminHandler.manejar(client, msg, admin);
      return;
    }

    const empleado = empleadosQueries.buscarActivoPorTelefono(telefono);
    if (empleado) {
      await employeeHandler.manejar(client, msg, empleado);
      return;
    }

    // Número no registrado: es un cliente (Fase 4).
    await clienteHandler.manejar(client, msg, telefono);
  } catch (error) {
    logger.error(`Error procesando mensaje de ${msg.from}: ${error.stack || error.message}`);

    // Endurecimiento: si reventó a mitad de un flujo persistido, no dejamos
    // a la persona con un estado roto que vuelva a fallar en cada mensaje
    // siguiente (mismo riesgo que el "menú sin salida" ya corregido antes,
    // pero para el caso de una excepción en vez de texto no reconocido).
    if (telefono) {
      try {
        estadosQueries.clearEstado(telefono);
        await enviarMensaje(
          client,
          msg.from,
          '⚠️ Uy, algo salió mal de mi lado. Probá de nuevo, o escribime *menu*.'
        );
      } catch (errorRecuperacion) {
        logger.error(`Error mandando el aviso de recuperación a ${msg.from}: ${errorRecuperacion.message}`);
      }
    }
  }
}

module.exports = { manejarMensaje, haceCuantoSinActividad };
