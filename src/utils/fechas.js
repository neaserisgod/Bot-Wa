// Utilidades de fecha. Todo el bot opera en la zona horaria de Argentina,
// independientemente de la zona del servidor donde corra.
const TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Devuelve la fecha de hoy (o de hoy +/- offsetDias) en formato YYYY-MM-DD
 * según la hora de Argentina. Se usa como clave de día para aperturas y
 * cierres de caja, y para el resumen diario cuando el cron que lo dispara
 * cruza la medianoche (ahí hay que resumir el día anterior, no "hoy").
 * @param {number} offsetDias
 * @returns {string}
 */
function fechaConOffsetDias(offsetDias = 0) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + offsetDias);
  // 'en-CA' produce el formato ISO YYYY-MM-DD.
  return fecha.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function fechaHoy() {
  return fechaConOffsetDias(0);
}

/**
 * Día de la semana según la hora de Argentina (0=domingo ... 6=sábado),
 * consistente con la columna dia_semana de la tabla turnos.
 * @returns {number}
 */
function diaSemanaHoy() {
  const nombre = new Date().toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  });
  const mapa = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return mapa[nombre];
}

/**
 * Suma (o resta) minutos a una hora en punto y normaliza el resultado a 24hs.
 * Se usa para calcular horarios de recordatorio/insistencia/resumen a partir
 * de HORA_CIERRE_* + un offset en minutos, sin hardcodear el resultado.
 * Devuelve también diasOffset (cuántos días para adelante/atrás cruza el
 * cálculo, puede ser negativo) porque algunos offsets grandes (ej. el resumen
 * diario, ~90 min después del cierre del finde) cruzan la medianoche.
 * @param {number} horaBase  0-23
 * @param {number} minutosOffset puede ser negativo (ej. recordatorio antes del cierre)
 * @returns {{hora:number, minuto:number, diasOffset:number}}
 */
function sumarMinutosAHora(horaBase, minutosOffset) {
  const total = horaBase * 60 + minutosOffset;
  const diasOffset = Math.floor(total / 1440);
  const totalMinutos = ((total % 1440) + 1440) % 1440;
  return { hora: Math.floor(totalMinutos / 60), minuto: totalMinutos % 60, diasOffset };
}

/**
 * Hora actual en Argentina, formato "HH:MM" (24hs, con cero a la izquierda).
 * Se usa para decidir si el "empleado activo" ya expiró (comparación de
 * strings funciona porque ambos lados están normalizados a 2 dígitos).
 * @returns {string}
 */
function horaActualHHMM() {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Parser propio (sin IA) de una hora del día escrita en texto libre: "18:00",
 * "18", "18.30", "18hs", "9 hs". Devuelve "HH:MM" normalizado o null si no se
 * pudo interpretar. Se usa para "¿hasta qué hora te quedás?" (A.1.c).
 * @param {string} texto
 * @returns {string|null}
 */
function parsearHora(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.trim().toLowerCase().replace(/\s*(hs|hrs|h)\.?$/, '');
  const m = limpio.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return null;

  const hora = Number(m[1]);
  const minuto = m[2] ? Number(m[2]) : 0;
  if (hora > 23 || minuto > 59) return null;

  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

module.exports = {
  fechaHoy,
  fechaConOffsetDias,
  diaSemanaHoy,
  sumarMinutosAHora,
  horaActualHHMM,
  parsearHora,
  TIMEZONE,
};
