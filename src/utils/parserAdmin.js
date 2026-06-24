// Wrapper fino sobre el motor generalizado de intenciones del personal
// (ver utils/parserPersonal.js, COMPORTAMIENTO-CLIENTES-EMPLEADOS.md C.1).
// Se mantiene este archivo para no tocar el punto de entrada de adminHandler.js.
const parserPersonal = require('./parserPersonal');

function parsearAcciones(texto) {
  return parserPersonal.parsearAcciones(texto, 'admin');
}

module.exports = { parsearAcciones };
