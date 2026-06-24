// Creación idempotente de tablas. Se puede ejecutar en cada arranque sin riesgo.
const logger = require('../utils/logger');

function ejecutarMigraciones(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS empleados (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre     TEXT    NOT NULL,
      telefono   TEXT    NOT NULL UNIQUE,
      rol        TEXT    DEFAULT 'empleado',
      activo     INTEGER DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      dia_semana  INTEGER NOT NULL,
      franja      TEXT    NOT NULL,
      persona     TEXT    NOT NULL,
      hora        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS aperturas_caja (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha        TEXT    NOT NULL,
      caja         INTEGER NOT NULL,
      empleado_id  INTEGER REFERENCES empleados(id),
      monto        REAL    NOT NULL,
      created_at   TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS cierres_caja (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha         TEXT    NOT NULL,
      caja          INTEGER NOT NULL,
      empleado_id   INTEGER REFERENCES empleados(id),
      total_contado REAL    NOT NULL,
      foto_billetes TEXT,
      created_at    TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS cierres_mp (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha        TEXT    NOT NULL,
      empleado_id  INTEGER REFERENCES empleados(id),
      foto_mp      TEXT    NOT NULL,
      monto        REAL,
      created_at   TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS estados_conversacion (
      telefono     TEXT    PRIMARY KEY,
      flujo        TEXT    NOT NULL,
      paso         TEXT    NOT NULL,
      data         TEXT    NOT NULL DEFAULT '{}',
      updated_at   TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    -- ===== Fase 4: clientes y pedidos =====

    CREATE TABLE IF NOT EXISTS clientes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono   TEXT    NOT NULL UNIQUE,
      nombre     TEXT,
      created_at TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    -- Catálogo de productos. palabras_clave es una lista separada por comas que
    -- usa el parser para reconocer el producto en el texto libre del cliente
    -- (ej. "coca,cocacola,coca cola"). Si está vacío, se usa el nombre.
    CREATE TABLE IF NOT EXISTS productos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre         TEXT    NOT NULL,
      precio         REAL    NOT NULL,
      palabras_clave TEXT,
      activo         INTEGER DEFAULT 1,
      created_at     TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER REFERENCES clientes(id),
      estado     TEXT    NOT NULL DEFAULT 'pendiente',
      total      REAL    NOT NULL DEFAULT 0,
      created_at TEXT    DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    -- nombre y precio_unitario se guardan como "foto" del momento del pedido,
    -- para que el historial no cambie si después se edita el catálogo.
    CREATE TABLE IF NOT EXISTS pedido_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id       INTEGER REFERENCES pedidos(id),
      producto_id     INTEGER REFERENCES productos(id),
      nombre          TEXT    NOT NULL,
      cantidad        REAL    NOT NULL,
      precio_unitario REAL    NOT NULL,
      subtotal        REAL    NOT NULL
    );

    -- Empleado activo del día (COMPORTAMIENTO-CLIENTES-EMPLEADOS.md A.1.b/A.1.c).
    -- Se inserta una fila nueva cada vez que alguien queda a cargo (abrir caja o
    -- "estoy"/relevo) o termina su turno ("ya no estoy", activo=0);
    -- getActivoDeHoy() siempre toma la última fila de la fecha de hoy, así que
    -- el "reset diario" es automático por fecha (la limpieza periódica de filas
    -- viejas es solo higiene de la tabla, no afecta la lógica).
    CREATE TABLE IF NOT EXISTS turno_activo (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha         TEXT    NOT NULL,
      empleado_id   INTEGER REFERENCES empleados(id),
      activo_desde  TEXT    DEFAULT (datetime('now', 'localtime')),
      activo_hasta  TEXT,
      activo        INTEGER DEFAULT 1
    );

    -- Endurecimiento: WhatsApp reenvía mensajes recientes al reconectar
    -- (confirmado en producción con backlog de grupos al arrancar el bot).
    -- Guardamos el id de cada mensaje ya procesado para no reprocesarlo si
    -- llega de nuevo (ver messageHandler.js). Se limpia solo (mensajesVistos.limpiarAntiguos).
    CREATE TABLE IF NOT EXISTS mensajes_vistos (
      msg_id      TEXT PRIMARY KEY,
      recibido_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // CREATE TABLE IF NOT EXISTS no agrega columnas nuevas a una tabla que ya
  // existía de una migración anterior (caso real: la DB en producción ya
  // tenía turno_activo sin la columna "activo"). SQLite no soporta
  // "ADD COLUMN IF NOT EXISTS", así que se intenta y se ignora el error de
  // "ya existe" — es la forma idempotente de agregar una columna a mano.
  try {
    db.exec('ALTER TABLE turno_activo ADD COLUMN activo INTEGER DEFAULT 1');
  } catch (error) {
    if (!/duplicate column/i.test(error.message)) throw error;
  }

  logger.info('Migraciones ejecutadas correctamente');
}

module.exports = { ejecutarMigraciones };
