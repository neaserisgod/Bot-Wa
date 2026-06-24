// Menú navegable del personal (admin y empleado), generalizado a partir del
// menú del admin (ver COMPORTAMIENTO-CLIENTES-EMPLEADOS.md C.1). Persistido en
// estados_conversacion igual que los demás flujos (mismo timeout ESTADO_TIMEOUT_MIN).
// El rol vive en estado.data.rol y decide qué opciones/textos aplican.
const { enviarMensaje } = require('../bot/client');
const estados = require('../db/queries/estados');
const empleadosQueries = require('../db/queries/empleados');
const personalAcciones = require('./personalAcciones');
const parserPersonal = require('../utils/parserPersonal');
const { formatearEstadoDia } = require('./estadoDia');
const pedidoComandos = require('../handlers/pedidoComandos');
const resumenFlow = require('./resumen');
const { backupAhora } = require('../cron/backup');
const { fechaHoy } = require('../utils/fechas');

const FLUJO = 'menu_personal';

const TEXTO_CAJA =
  '🏪 Caja — ¿qué hacés?\n' +
  '1️⃣  Abrir caja ahora\n' +
  '2️⃣  Cerrar caja ahora\n\n' +
  'Respondé el número, o "volver".';

const TEXTO_BACKUP_RESUMEN =
  '🗄️ Backup y resumen:\n' +
  '1️⃣  Resumen de hoy\n' +
  '2️⃣  Resumen de otro día  (escribí "resumen 2026-06-20")\n' +
  '3️⃣  Backup de la base ahora\n\n' +
  'Respondé el número, o "volver".';

function textoPrincipal(rol, telefono) {
  if (rol === 'admin') {
    return (
      '👋 Hola Admin, ¿qué hacemos?\n\n' +
      '1️⃣  Estado del día\n' +
      '2️⃣  Pedidos activos\n' +
      '3️⃣  Caja (abrir / cerrar)\n' +
      '4️⃣  Backup y resumen\n\n' +
      'Respondé con el número, o escribime directo\n' +
      '(ej: "estado", "pedidos", "cerrá caja").'
    );
  }

  const empleado = empleadosQueries.buscarPorTelefono(telefono);
  const nombre = (empleado && empleado.nombre) || '';
  return (
    `👋 Hola ${nombre}, ¿qué hacés?\n\n` +
    '1️⃣  Estado del día\n' +
    '2️⃣  Pedidos activos\n' +
    '3️⃣  Caja (abrir / cerrar)\n\n' +
    'Respondé con el número, o escribime directo\n' +
    '(ej: "estado", "pedidos", "abrí caja").\n\n' +
    '(El relevo es opcional: si quedás vos sin haber abierto, escribí estoy / quedo yo.)'
  );
}

async function mostrarPrincipal(client, destino, telefono, rol) {
  estados.setEstado(telefono, FLUJO, 'principal', { rol });
  await enviarMensaje(client, destino, textoPrincipal(rol, telefono));
}

async function mostrarCaja(client, destino, telefono, rol) {
  estados.setEstado(telefono, FLUJO, 'caja', { rol });
  await enviarMensaje(client, destino, TEXTO_CAJA);
}

async function mostrarBackupResumen(client, destino, telefono, rol) {
  estados.setEstado(telefono, FLUJO, 'backup_resumen', { rol });
  await enviarMensaje(client, destino, TEXTO_BACKUP_RESUMEN);
}

async function procesarPrincipal(client, msg, telefono, rol, texto) {
  if (texto === '1') {
    estados.clearEstado(telefono);
    await enviarMensaje(client, msg.from, formatearEstadoDia());
    return;
  }
  if (texto === '2') {
    estados.clearEstado(telefono);
    await enviarMensaje(client, msg.from, pedidoComandos.listarPedidos());
    return;
  }
  if (texto === '3') {
    await mostrarCaja(client, msg.from, telefono, rol);
    return;
  }
  if (rol === 'admin' && texto === '4') {
    await mostrarBackupResumen(client, msg.from, telefono, rol);
    return;
  }

  // No es un número del menú: puede ser un atajo por palabra clave, siempre
  // disponible (sección 1 de COMPORTAMIENTO-ADMIN.md). Se procesa como un
  // mensaje nuevo a través del motor de acciones.
  estados.clearEstado(telefono);
  const acciones = parserPersonal.parsearAcciones(msg.body.trim(), rol);
  await personalAcciones.ejecutarAcciones(client, msg, telefono, rol, acciones);
}

async function procesarCaja(client, msg, telefono, rol, texto) {
  if (texto === '1') {
    estados.clearEstado(telefono);
    await personalAcciones.ejecutarAcciones(client, msg, telefono, rol, [{ tipo: 'abrir' }]);
    return;
  }
  if (texto === '2') {
    estados.clearEstado(telefono);
    await personalAcciones.ejecutarAcciones(client, msg, telefono, rol, [{ tipo: 'cerrar' }]);
    return;
  }

  await enviarMensaje(client, msg.from, `No entendí. ${TEXTO_CAJA}`);
}

async function procesarBackupResumen(client, msg, telefono, texto) {
  if (texto === '1') {
    estados.clearEstado(telefono);
    await resumenFlow.enviarResumenDiario(client, fechaHoy());
    return;
  }
  if (texto === '2') {
    estados.clearEstado(telefono);
    await enviarMensaje(client, msg.from, 'Escribime: resumen AAAA-MM-DD (ej: resumen 2026-06-20).');
    return;
  }
  if (texto === '3') {
    estados.clearEstado(telefono);
    const destino = backupAhora();
    await enviarMensaje(client, msg.from, `✅ Backup creado: ${destino}`);
    return;
  }

  await enviarMensaje(client, msg.from, `No entendí. ${TEXTO_BACKUP_RESUMEN}`);
}

/**
 * Continúa la navegación del menú según el paso guardado.
 */
async function continuar(client, msg, telefono, estado) {
  const rol = estado.data.rol;
  const texto = msg.body.trim().toLowerCase();

  if (texto === 'cancelar') {
    estados.clearEstado(telefono);
    await enviarMensaje(client, msg.from, 'Listo, cancelado. ✅');
    return;
  }

  if (texto === 'volver') {
    if (estado.paso === 'principal') {
      estados.clearEstado(telefono);
      await enviarMensaje(client, msg.from, 'Listo, cancelado. ✅');
    } else {
      await mostrarPrincipal(client, msg.from, telefono, rol);
    }
    return;
  }

  if (estado.paso === 'caja') {
    await procesarCaja(client, msg, telefono, rol, texto);
    return;
  }
  if (estado.paso === 'backup_resumen' && rol === 'admin') {
    await procesarBackupResumen(client, msg, telefono, texto);
    return;
  }

  await procesarPrincipal(client, msg, telefono, rol, texto);
}

module.exports = { FLUJO, mostrarPrincipal, mostrarCaja, mostrarBackupResumen, continuar };
