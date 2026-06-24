// Backup diario de la base de datos (Fase E).
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../db');
const turnoActivoQueries = require('../db/queries/turnoActivo');
const { fechaHoy, TIMEZONE } = require('../utils/fechas');
const logger = require('../utils/logger');

const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');

/**
 * Copia la base de datos a backups/nefertiti_YYYYMMDD.db. Antes de copiar fuerza
 * un checkpoint del WAL (la DB corre en modo WAL, ver src/db/index.js) para que
 * el archivo copiado tenga todas las escrituras recientes, no solo lo que ya
 * estaba volcado al .db principal.
 */
function backupAhora() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  db.pragma('wal_checkpoint(TRUNCATE)');

  const dbPath = path.resolve(process.env.DB_PATH || './data/nefertiti.db');
  const nombreBackup = `nefertiti_${fechaHoy().replace(/-/g, '')}.db`;
  const destino = path.join(BACKUPS_DIR, nombreBackup);

  fs.copyFileSync(dbPath, destino);
  logger.info(`Backup de la base de datos creado: ${destino}`);
  return destino;
}

// Reset diario del empleado activo (COMPORTAMIENTO-CLIENTES-EMPLEADOS.md
// A.1.b): higiene de la tabla turno_activo. La lógica de getActivoDeHoy() ya
// ignora filas de días anteriores, así que esto no cambia el comportamiento,
// solo evita que la tabla crezca para siempre.
function tareasDeMadrugada() {
  backupAhora();
  turnoActivoQueries.limpiarAnteriores();
}

function iniciarBackupCron() {
  cron.schedule('0 3 * * *', tareasDeMadrugada, { timezone: TIMEZONE });
  logger.info(`Cron de backup diario programado a las 3:00 (${TIMEZONE})`);
}

module.exports = { iniciarBackupCron, backupAhora };
