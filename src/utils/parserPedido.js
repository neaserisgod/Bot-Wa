// Parser propio de pedidos en texto libre (Fase 4). Sin NLP ni IA.
// Reconoce productos del catálogo por sus palabras clave y detecta la cantidad
// pedida. Es deliberadamente simple: prioriza no inventar pedidos por sobre
// entender todo. Lo que no reconoce, no lo agrega.
const { formatearMonto } = require('./validadores');

// Palabras de cantidad escritas en letras (es-AR), incluyendo medios.
const NUMEROS_PALABRA = {
  un: 1, una: 1, uno: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  medio: 0.5, media: 0.5,
};

// Palabras de relleno/unidad que se saltan al buscar la cantidad hacia atrás
// (ej. en "1,5 kg de jamón", entre el número y el producto hay "kg" y "de").
const TOKENS_SALTABLES = new Set([
  'de', 'del', 'la', 'el', 'los', 'las',
  'kg', 'k', 'kilo', 'kilos', 'g', 'gr', 'grs', 'gramo', 'gramos',
  'lt', 'l', 'litro', 'litros', 'u', 'unid', 'unidad', 'unidades',
]);

// Quita acentos y pasa a minúsculas para comparar de forma robusta.
function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Tokeniza conservando números (con coma/punto decimal) y palabras.
function tokenizar(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9.,]+/)
    .filter(Boolean);
}

// Intenta leer una cantidad de un token: "2", "1,5", "2kg", "medio", "un".
// Devuelve el número o null si el token no representa una cantidad.
function leerCantidadDeToken(token) {
  if (token in NUMEROS_PALABRA) return NUMEROS_PALABRA[token];
  // número opcionalmente pegado a una unidad (2kg, 1.5lt, 3u)
  const m = token.match(/^(\d+(?:[.,]\d+)?)(kg|k|kilo|kilos|g|gr|grs|lt|l|litro|litros|u|un|unid)?$/);
  if (m) {
    const n = Number(m[1].replace(',', '.'));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

// Camina hacia atrás desde la clave saltando palabras de relleno/unidad hasta
// encontrar una cantidad. Si un token no saltable no es número, corta. Default 1.
function detectarCantidad(tokens, idx) {
  let i = idx - 1;
  let pasos = 0;
  while (i >= 0 && pasos < 3) {
    const n = leerCantidadDeToken(tokens[i]);
    if (n !== null) return n;
    if (!TOKENS_SALTABLES.has(tokens[i])) break;
    i -= 1;
    pasos += 1;
  }
  return 1;
}

// Compara un token del texto con un token de la clave, tolerando plurales
// simples del español (coca→cocas, pan→panes, jamon→jamones).
function tokenCoincide(token, clave) {
  return token === clave || token === `${clave}s` || token === `${clave}es`;
}

// Busca la secuencia de tokens `claveTokens` dentro de `tokens`.
// Devuelve el índice donde empieza, o -1.
function indiceDeClave(tokens, claveTokens) {
  for (let i = 0; i <= tokens.length - claveTokens.length; i += 1) {
    let coincide = true;
    for (let j = 0; j < claveTokens.length; j += 1) {
      if (!tokenCoincide(tokens[i + j], claveTokens[j])) {
        coincide = false;
        break;
      }
    }
    if (coincide) return i;
  }
  return -1;
}

/**
 * Analiza el texto del cliente contra el catálogo.
 * @param {string} texto
 * @param {Array<{id:number, nombre:string, precio:number, palabras_clave:string}>} productos
 * @returns {Array<{productoId:number, nombre:string, precioUnitario:number, cantidad:number, subtotal:number}>}
 */
function parsearPedido(texto, productos) {
  const tokens = tokenizar(texto);
  const items = [];
  const yaAgregados = new Set();

  for (const producto of productos) {
    if (yaAgregados.has(producto.id)) continue;

    // Claves a probar: las palabras_clave (csv) y, como respaldo, el nombre.
    const fuentes = (producto.palabras_clave || producto.nombre)
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    for (const fuente of fuentes) {
      const claveTokens = tokenizar(fuente);
      if (claveTokens.length === 0) continue;

      const idx = indiceDeClave(tokens, claveTokens);
      if (idx === -1) continue;

      const cantidad = detectarCantidad(tokens, idx);
      const subtotal = Math.round(cantidad * producto.precio * 100) / 100;
      items.push({
        productoId: producto.id,
        nombre: producto.nombre,
        precioUnitario: producto.precio,
        cantidad,
        subtotal,
      });
      yaAgregados.add(producto.id);
      break;
    }
  }

  return items;
}

// Calcula el total de una lista de items.
function calcularTotal(items) {
  return Math.round(items.reduce((acc, it) => acc + it.subtotal, 0) * 100) / 100;
}

// Arma el texto del resumen del pedido para confirmar con el cliente.
function formatearResumen(items) {
  const lineas = items.map(
    (it) => `  ${it.cantidad}x ${it.nombre} — ${formatearMonto(it.subtotal)}`
  );
  return `${lineas.join('\n')}\nTotal: ${formatearMonto(calcularTotal(items))}`;
}

module.exports = { parsearPedido, calcularTotal, formatearResumen, normalizar };
