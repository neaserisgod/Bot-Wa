// Conexión a la MISMA base SQLite que usa el bot.
// better-sqlite3 en modo WAL permite que dos procesos (bot y panel) lean y
// escriban el mismo archivo de forma concurrente sin pisarse.
import path from 'node:path';
import Database from 'better-sqlite3';

// En desarrollo Next recarga los módulos en caliente; guardamos la conexión en
// globalThis para no abrir un descriptor nuevo en cada recarga.
const globalForDb = globalThis;

function resolverRutaDb() {
  const ruta = process.env.PANEL_DB_PATH || '../data/nefertiti.db';
  return path.isAbsolute(ruta) ? ruta : path.resolve(process.cwd(), ruta);
}

function crearConexion() {
  const db = new Database(resolverRutaDb());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  asegurarMigracionesPanel(db);
  return db;
}

// Agrega una columna a una tabla solo si todavía no existe (ALTER seguro e
// idempotente). Las columnas son aditivas y con default, así que el bot sigue
// funcionando sin enterarse.
function agregarColumnaSiFalta(db, tabla, columna, definicion) {
  const cols = db.prepare(`PRAGMA table_info(${tabla})`).all();
  if (!cols.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

// Migraciones propias del panel. No tocan el esquema que usa el bot salvo por
// columnas nuevas con valores por defecto (seguras).
function asegurarMigracionesPanel(db) {
  // Códigos de un solo uso para el login 2FA por WhatsApp.
  db.exec(`
    CREATE TABLE IF NOT EXISTS panel_codigos (
      telefono   TEXT    PRIMARY KEY,
      codigo_hash TEXT   NOT NULL,
      expira_at  INTEGER NOT NULL,
      intentos   INTEGER NOT NULL DEFAULT 0,
      enviado_at INTEGER NOT NULL
    );
  `);

  // Stock por producto y stock mínimo para alertas.
  agregarColumnaSiFalta(db, 'productos', 'stock', 'REAL NOT NULL DEFAULT 0');
  agregarColumnaSiFalta(db, 'productos', 'stock_minimo', 'REAL NOT NULL DEFAULT 0');

  // Código de barras (para escanear en el POS).
  agregarColumnaSiFalta(db, 'productos', 'codigo_barras', 'TEXT');

  // Medio de pago de la venta y bandera para no descontar stock dos veces.
  agregarColumnaSiFalta(db, 'pedidos', 'medio_pago', 'TEXT');
  agregarColumnaSiFalta(db, 'pedidos', 'stock_descontado', 'INTEGER NOT NULL DEFAULT 0');

  // Historial de movimientos de stock (auditoría).
  // tipo: 'venta' | 'ingreso' | 'ajuste'
  db.exec(`
    CREATE TABLE IF NOT EXISTS movimientos_stock (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER REFERENCES productos(id),
      tipo        TEXT    NOT NULL,
      cantidad    REAL    NOT NULL,
      stock_resultante REAL,
      motivo      TEXT,
      pedido_id   INTEGER,
      empleado_id INTEGER,
      created_at  TEXT    DEFAULT (datetime('now','localtime'))
    );
  `);
}

export function getDb() {
  if (!globalForDb.__panelDb) {
    globalForDb.__panelDb = crearConexion();
  }
  return globalForDb.__panelDb;
}
