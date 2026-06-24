// Parser y validadores propios de montos. Sin librerías de NLP/IA.

/**
 * Convierte un texto en un monto numérico válido o null si no se pudo interpretar.
 * Acepta formatos como: "5000", "5.000", "5,000", "5000.50", "5.000,50", "$5000".
 * @param {string} texto
 * @returns {number|null}
 */
function parsearMonto(texto) {
  if (typeof texto !== 'string') return null;

  let limpio = texto.trim().replace(/\$/g, '').replace(/\s/g, '');
  if (limpio === '') return null;

  // Solo deben quedar dígitos, puntos y comas
  if (!/^[0-9.,]+$/.test(limpio)) return null;

  const tienePunto = limpio.includes('.');
  const tieneComa = limpio.includes(',');

  if (tienePunto && tieneComa) {
    // El último separador es el decimal; el otro es de miles y se descarta
    const ultimoPunto = limpio.lastIndexOf('.');
    const ultimaComa = limpio.lastIndexOf(',');
    if (ultimaComa > ultimoPunto) {
      limpio = limpio.replace(/\./g, '').replace(',', '.');
    } else {
      limpio = limpio.replace(/,/g, '');
    }
  } else if (tieneComa) {
    // Coma como separador decimal (estilo argentino) si quedan 1-2 dígitos luego
    const partes = limpio.split(',');
    if (partes.length === 2 && partes[1].length <= 2) {
      limpio = limpio.replace(',', '.');
    } else {
      limpio = limpio.replace(/,/g, '');
    }
  } else if (tienePunto) {
    // Punto como separador de miles si quedan exactamente 3 dígitos después
    const partes = limpio.split('.');
    const ultimaParte = partes[partes.length - 1];
    if (partes.length > 1 && ultimaParte.length === 3) {
      limpio = limpio.replace(/\./g, '');
    }
    // si no, se asume separador decimal y se deja como está
  }

  const numero = Number(limpio);
  if (Number.isNaN(numero) || numero < 0) return null;

  return Math.round(numero * 100) / 100;
}

/**
 * Formatea un número como moneda argentina, ej: 5000 -> "$5.000".
 * @param {number} monto
 * @returns {string}
 */
function formatearMonto(monto) {
  const numero = Number(monto) || 0;
  return `$${numero.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

module.exports = { parsearMonto, formatearMonto };
