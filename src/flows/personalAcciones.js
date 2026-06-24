// Ejecuta la cadena de acciones detectadas por utils/parserPersonal.js, para
// admin o empleado. Generaliza lo que antes era privado de adminHandler.js
// (ver COMPORTAMIENTO-CLIENTES-EMPLEADOS.md C.1). Las acciones de solo lectura
// (estado, pedidos, marcar, backup, resumen) encadenan libre; la primera
// interactiva (abrir, cerrar, estoy, asignarActivo con submenú, menu) ejecuta
// y corta la cadena (mismo criterio que el admin, sección 3.1 del spec).
const { enviarMensaje } = require('../bot/client');
const aperturaFlow = require('./caja');
const cierreFlow = require('./cierre');
const empleadoActivo = require('./empleadoActivo');
const empleadosQueries = require('../db/queries/empleados');
const turnoActivoQueries = require('../db/queries/turnoActivo');
const resumenFlow = require('./resumen');
const { backupAhora } = require('../cron/backup');
const pedidoComandos = require('../handlers/pedidoComandos');
const { formatearEstadoDia } = require('./estadoDia');
const { normalizar } = require('../utils/parserPedido');
const { fechaHoy } = require('../utils/fechas');
const logger = require('../utils/logger');

// Busca un empleado (no admin) por coincidencia parcial de nombre, para el
// atajo del admin "queda <nombre>" (C.6).
function buscarEmpleadoPorNombre(nombreBuscado) {
  const buscado = normalizar(nombreBuscado);
  return empleadosQueries
    .listarTodos()
    .find((e) => e.rol === 'empleado' && normalizar(e.nombre).includes(buscado));
}

// El atajo "abrir"/"cerrar" SIEMPRE opera con la identidad de quien lo
// escribe (admin o empleado, sin distinción) — el admin es un superset del
// empleado, así que tiene que poder abrir/cerrar él mismo sin depender de la
// planilla de turnos ni del número de otra persona (eso era justo lo que
// fallaba: si hoy le toca cerrar a un empleado cuyo número todavía es un
// placeholder en .env, el admin se quedaba sin ninguna devolución).
// El mecanismo viejo de "forzar la apertura/cierre de quien le toca según
// turnos" sigue intacto y disponible como antes vía los alias `test apertura`
// / `test cierre` (adminHandler.js) — no se perdió, solo dejó de ser lo que
// dispara el atajo natural "abrir caja"/"cerrar caja".
async function abrirCaja(client, msg, telefono) {
  const empleado = empleadosQueries.buscarPorTelefono(telefono);
  if (!empleado) {
    logger.error(`abrirCaja: no encontré a nadie con teléfono ${telefono}`);
    await enviarMensaje(client, msg.from, '❌ No te encuentro registrado. Avisale al admin.');
    return;
  }
  const iniciado = await aperturaFlow.iniciarApertura(client, msg.from, telefono, empleado);
  if (!iniciado) {
    await enviarMensaje(client, msg.from, 'ℹ️ La caja ya está abierta hoy.');
  }
}

async function cerrarCaja(client, msg, telefono) {
  const empleado = empleadosQueries.buscarPorTelefono(telefono);
  if (!empleado) {
    logger.error(`cerrarCaja: no encontré a nadie con teléfono ${telefono}`);
    await enviarMensaje(client, msg.from, '❌ No te encuentro registrado. Avisale al admin.');
    return;
  }
  const iniciado = await cierreFlow.iniciarCierre(client, msg.from, telefono, empleado);
  if (!iniciado) {
    await enviarMensaje(client, msg.from, 'ℹ️ La caja ya está cerrada hoy.');
  }
}

async function ejecutarAcciones(client, msg, telefono, rol, acciones) {
  // Lazy: menuPersonal requiere este módulo para el fallback de atajos dentro
  // del menú, así que se evita el ciclo pidiéndolo recién al ejecutar.
  const menuPersonal = require('./menuPersonal');

  for (const accion of acciones) {
    switch (accion.tipo) {
      case 'estado':
        await enviarMensaje(client, msg.from, formatearEstadoDia());
        break;

      case 'pedidos':
        await enviarMensaje(client, msg.from, pedidoComandos.listarPedidos());
        break;

      case 'ventas':
        await enviarMensaje(client, msg.from, pedidoComandos.listarVentas(accion.cantidad));
        break;

      case 'marcar':
        if (accion.accion === 'listo') {
          await pedidoComandos.marcarListo(client, msg, accion.id);
        } else {
          await pedidoComandos.marcarRetirado(client, msg, accion.id);
        }
        break;

      case 'backup': {
        const destino = backupAhora();
        await enviarMensaje(client, msg.from, `✅ Backup creado: ${destino}`);
        break;
      }

      case 'resumen':
        await resumenFlow.enviarResumenDiario(client, accion.fecha || fechaHoy());
        break;

      case 'asignarActivo': {
        const empleado = buscarEmpleadoPorNombre(accion.nombre);
        if (!empleado) {
          await enviarMensaje(client, msg.from, `No encontré ningún empleado que coincida con "${accion.nombre}".`);
          break;
        }
        turnoActivoQueries.setActivo(empleado.id, null);
        await enviarMensaje(client, msg.from, `Listo, queda ${empleado.nombre} a cargo. 👍`);
        logger.info(`Admin reasignó el empleado activo a ${empleado.nombre}`);
        break;
      }

      case 'estoy': {
        const empleado = empleadosQueries.buscarPorTelefono(telefono);
        if (!empleado) {
          logger.error(`Acción "estoy": no encontré empleado con teléfono ${telefono}`);
          await enviarMensaje(client, msg.from, '❌ No te encuentro registrado como empleado. Avisale al admin.');
          return;
        }
        await empleadoActivo.tomarTurnoYPreguntarHora(client, msg.from, telefono, empleado);
        return; // interactiva: corta la cadena
      }

      case 'finTurno': {
        const empleado = empleadosQueries.buscarPorTelefono(telefono);
        if (!empleado) {
          logger.error(`Acción "finTurno": no encontré empleado con teléfono ${telefono}`);
          await enviarMensaje(client, msg.from, '❌ No te encuentro registrado como empleado. Avisale al admin.');
          break;
        }
        await empleadoActivo.terminarTurno(client, msg, telefono, empleado);
        break; // de solo lectura/instantánea: no abre ningún flujo, encadena libre
      }

      case 'abrir':
        await abrirCaja(client, msg, telefono);
        return; // interactiva: corta la cadena

      case 'cerrar':
        await cerrarCaja(client, msg, telefono);
        return; // interactiva: corta la cadena

      case 'menu':
        await menuPersonal.mostrarPrincipal(client, msg.from, telefono, rol);
        return; // interactiva: corta la cadena

      default:
        break;
    }
  }
}

module.exports = { ejecutarAcciones };
