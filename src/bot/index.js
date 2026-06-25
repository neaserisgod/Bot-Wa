// Punto de entrada principal: valida configuración, arranca DB y migraciones.
// El cliente de WhatsApp y los cron jobs se conectan en fases posteriores.
require('dotenv').config();

const logger = require('../utils/logger');

const VARIABLES_OBLIGATORIAS = [
  'DB_PATH',
  'HORA_APERTURA',
  'HORA_CIERRE_SEMANA',
  'HORA_CIERRE_FINDE',
  'MINUTOS_AVISO_CIERRE',
  'APERTURA_AVISAR_ADMIN_MIN',
  'CIERRE_INSISTIR_MIN',
  'CIERRE_AVISAR_ADMIN_MIN',
  'RESUMEN_OFFSET_MIN',
  'ESTADO_TIMEOUT_MIN',
  'ADMIN_NUMBER',
  'EMPLEADO_X_NUMBER',
  'EMPLEADO_Y_NUMBER',
  'ADMIN_NOMBRE',
  'EMPLEADO_X_NOMBRE',
  'EMPLEADO_Y_NOMBRE',
  'CANTIDAD_CAJAS',
  'SESSION_PATH',
];

function validarConfiguracion() {
  const faltantes = VARIABLES_OBLIGATORIAS.filter((variable) => !process.env[variable]);

  if (faltantes.length > 0) {
    logger.error(
      `Faltan variables de entorno obligatorias en .env: ${faltantes.join(', ')}`
    );
    process.exit(1);
  }
}

// Endurecimiento: red de seguridad a nivel de proceso. messageHandler.js ya
// atrapa los errores de cada mensaje individualmente, así que esto solo debería
// dispararse ante un bug no anticipado. Ante una excepción síncrona que se
// escapó de todo try/catch, se loguea y se sale: en producción PM2 reinicia
// el proceso limpio (ver ecosystem.config.js, restart_delay) en vez de dejarlo
// corriendo en un estado posiblemente inconsistente.
process.on('unhandledRejection', (razon) => {
  logger.error(`Promise rechazada sin manejar: ${razon && razon.stack ? razon.stack : razon}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Excepción no capturada: ${error.stack || error.message}`);
  process.exit(1);
});

function main() {
  validarConfiguracion();
  logger.info('Configuración validada correctamente');

  const db = require('../db');
  const { ejecutarMigraciones } = require('../db/migrations');
  const { sembrarDatosIniciales } = require('../db/seed');

  ejecutarMigraciones(db);
  sembrarDatosIniciales();

  logger.info('Base de datos lista, migraciones y seed ejecutados');

  const { crearClienteWhatsApp } = require('./client');
  const { registrarEventosSesion } = require('./qr');
  const { manejarMensaje } = require('../handlers/messageHandler');

  const client = crearClienteWhatsApp();
  registrarEventosSesion(client);
  client.on('message', (msg) => manejarMensaje(client, msg));

  // Los cron jobs se arrancan recién cuando el cliente está listo (vinculado),
  // para no intentar enviar mensajes antes de tener sesión.
  const { iniciarCronJobs } = require('../cron/tareas');
  const { iniciarBackupCron } = require('../cron/backup');
  const { iniciarServidorPanel } = require('../api/server');
  const { iniciarWatchdog } = require('./watchdog');
  client.on('ready', () => {
    iniciarCronJobs(client);
    iniciarBackupCron();
    // Puente HTTP para que el panel de gestión pueda pedir avisos al cliente.
    iniciarServidorPanel(client);
    // Detecta si la sesión queda "zombie" (sin recibir nada, sin avisar) y
    // reinicia el proceso — ver src/bot/watchdog.js.
    iniciarWatchdog(client);
  });

  client.initialize();
}

main();
