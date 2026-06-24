// Parser propio de intenciones del personal (admin y empleado), sin IA.
// Generaliza lo que antes era parserAdmin.js (ver COMPORTAMIENTO-CLIENTES-EMPLEADOS.md
// C.1): mismo motor de detección por palabra clave, parametrizado por rol. El
// admin es un superset del empleado: tiene todo lo del empleado (incluido
// "estoy"/"quedo yo") más sus propios extras (backup/resumen/ventas/reasignar
// activo) que el empleado no tiene (A.7).
//
// El diccionario de variantes (PALABRAS_POR_ACCION) está separado a propósito
// de la función de detección: para agregar una forma nueva de decir lo mismo
// ("dale que abro" → abrir) alcanza con sumar una palabra a la lista, sin
// tocar el resto del parser. Así el bot "escucha siempre" sin que el personal
// tenga que aprenderse un comando exacto ni pasar por el menú.
const { normalizar } = require('./parserPedido');

// Cada entrada es una lista de frases/palabras (ya normalizadas: minúsculas,
// sin acentos) que, si aparecen como substring del fragmento, disparan esa
// acción. Tolerante por inclusión, igual criterio que el resto del proyecto.
const PALABRAS_POR_ACCION = {
  estado: [
    'estado', 'como va', 'como vamos', 'como anda', 'como esta', 'que onda',
    'novedades', 'resumen del dia', 'situacion',
  ],
  pedidos: [
    'pedidos', 'pedido', 'pendientes', 'ordenes', 'que hay pendiente',
    'que falta', 'que hay para entregar',
  ],
  abrir: [
    'abrir', 'abri', 'apertura', 'abrime', 'abro',
  ],
  cerrar: [
    'cerrar', 'cerra', 'cierre', 'cierra', 'cerrame', 'cierro',
  ],
  estoy: [
    'estoy', 'quedo yo', 'yo quedo', 'me quedo', 'tomo el turno', 'asumo',
    'quedo a cargo',
  ],
  // Lo inverso de "estoy": terminar el turno propio (antes no existía
  // ninguna forma de hacer esto — si nadie tomaba el relevo, quedaba activo
  // para siempre). Ninguna de estas frases pisa las de "cerrar" (cierre de
  // caja), son cosas distintas: terminar el turno no es cerrar la caja.
  finTurno: [
    'ya no estoy', 'no estoy mas', 'termine mi turno', 'termino mi turno',
    'dejo el turno', 'deje el turno', 'me voy', 'salgo',
  ],
  menu: [
    'menu', 'ayuda', 'opciones', 'comandos', 'que puedo hacer', '?',
  ],
  // Solo admin (gateado en detectarAccionEnFragmento, no acá):
  backup: ['backup', 'respaldo', 'copia de seguridad'],
  ventas: ['venta', 'vendido', 'facturado', 'vendimos'],
};

function coincideAlguna(frag, lista) {
  return lista.some((p) => frag.includes(p));
}

// Separa el texto en fragmentos por coma, salto de línea, o la palabra "y"
// suelta (con espacios alrededor, para no romper "hoy"/"voy"/etc).
function dividirFragmentos(texto) {
  return normalizar(texto)
    .split(/[,\n]+|\s+y\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

// Detecta como mucho una acción por fragmento, según las acciones habilitadas
// para el rol. Si no matchea ninguna (incluye cortesía sola: "hola", "gracias",
// etc.), devuelve null — el fragmento no aporta ninguna acción a la cadena.
function detectarAccionEnFragmento(frag, rol) {
  const marcar = frag.match(/(?:^|\s)(listo|retirado|entregado)\s+#?(\d+)\b/);
  if (marcar) {
    const accion = marcar[1] === 'entregado' ? 'retirado' : marcar[1];
    return { tipo: 'marcar', accion, id: Number(marcar[2]) };
  }

  if (rol === 'admin') {
    const queda = frag.match(/\bqueda\s+([a-z]+)/);
    if (queda) return { tipo: 'asignarActivo', nombre: queda[1] };

    if (frag.includes('resumen')) {
      const fecha = frag.match(/\d{4}-\d{2}-\d{2}/);
      return { tipo: 'resumen', fecha: fecha ? fecha[0] : null };
    }

    if (coincideAlguna(frag, PALABRAS_POR_ACCION.backup)) return { tipo: 'backup' };

    if (coincideAlguna(frag, PALABRAS_POR_ACCION.ventas)) {
      const cantidad = frag.match(/\d+/);
      return { tipo: 'ventas', cantidad: cantidad ? Number(cantidad[0]) : 5 };
    }
  }

  // "estoy"/"quedo yo" (relevo) es del empleado (A.3), pero el admin tiene
  // todos los comandos del empleado además de los propios — también puede
  // tomar el turno y aparecer como activo del día.
  // finTurno antes que estoy: "ya no estoy"/"no estoy mas" contienen la
  // palabra "estoy" como substring, así que si se chequeara "estoy" primero
  // le ganaría por error (terminar el turno se leería como tomarlo).
  if (coincideAlguna(frag, PALABRAS_POR_ACCION.finTurno)) {
    return { tipo: 'finTurno' };
  }

  if (coincideAlguna(frag, PALABRAS_POR_ACCION.estoy)) {
    return { tipo: 'estoy' };
  }

  if (coincideAlguna(frag, PALABRAS_POR_ACCION.abrir)) {
    return { tipo: 'abrir' };
  }

  if (coincideAlguna(frag, PALABRAS_POR_ACCION.cerrar)) {
    return { tipo: 'cerrar' };
  }

  if (coincideAlguna(frag, PALABRAS_POR_ACCION.pedidos) || /\bped\b/.test(frag)) {
    return { tipo: 'pedidos' };
  }

  if (coincideAlguna(frag, PALABRAS_POR_ACCION.estado) || /\bdia\b/.test(frag)) {
    return { tipo: 'estado' };
  }

  if (coincideAlguna(frag, PALABRAS_POR_ACCION.menu)) {
    return { tipo: 'menu' };
  }

  return null;
}

/**
 * Analiza el texto del personal y devuelve la lista ordenada de acciones
 * detectadas (en el orden en que aparecen). Si no se detecta ninguna acción
 * (cortesía sola, saludo, o texto no reconocido), devuelve [{tipo:'menu'}].
 * @param {string} texto
 * @param {'admin'|'empleado'} rol
 * @returns {Array<object>}
 */
function parsearAcciones(texto, rol) {
  const fragmentos = dividirFragmentos(texto);
  const acciones = [];

  for (const frag of fragmentos) {
    const accion = detectarAccionEnFragmento(frag, rol);
    if (accion) acciones.push(accion);
  }

  if (acciones.length === 0) return [{ tipo: 'menu' }];
  return acciones;
}

module.exports = { parsearAcciones, PALABRAS_POR_ACCION };
