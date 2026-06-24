// Logger centralizado con winston. Escribe a consola y a archivos rotados por día.
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

const formatoArchivo = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const formatoConsola = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level}: ${stack || message}`;
  })
);

const transporteRotativo = new winston.transports.DailyRotateFile({
  dirname: LOGS_DIR,
  filename: 'nefertiti-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  format: formatoArchivo,
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({ format: formatoConsola }),
    transporteRotativo,
  ],
});

module.exports = logger;
