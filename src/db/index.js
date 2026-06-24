// Conexión única a la base de datos SQLite (better-sqlite3, síncrono).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const logger = require('../utils/logger');

const dbPath = process.env.DB_PATH || './data/nefertiti.db';
const dbDir = path.dirname(path.resolve(dbPath));

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

logger.info(`Base de datos conectada en ${dbPath}`);

module.exports = db;
