// Acción "Estado del día" (COMPORTAMIENTO-ADMIN.md sección 4.1): snapshot liviano
// de hoy a demanda, SIN reenviar fotos. Distinta del resumen completo de
// flows/resumen.js (ese sí reenvía fotos y se manda a una hora fija).
const cajaQueries = require('../db/queries/caja');
const pedidosQueries = require('../db/queries/pedidos');
const empleadosQueries = require('../db/queries/empleados');
const empleadoActivo = require('./empleadoActivo');
const { formatearMonto } = require('../utils/validadores');
const { fechaHoy, diaSemanaHoy } = require('../utils/fechas');

const NOMBRES_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Línea "Activo: <nombre>, hasta <hora>" (COMPORTAMIENTO-CLIENTES-EMPLEADOS.md
// C.6). Si nadie quedó activo (o ya expiró su hora), lo dice.
function lineaActivo() {
  const activo = empleadoActivo.getActivoVigente();
  if (!activo) return 'Activo: nadie';
  const hasta = activo.activo_hasta ? `, hasta ${activo.activo_hasta}` : '';
  return `Activo: ${activo.empleado_nombre}${hasta}`;
}

/**
 * Arma el texto del snapshot de hoy: apertura/cierre/diferencia por caja,
 * foto de MP sí/no, y cantidad de pedidos activos.
 * @returns {string}
 */
function formatearEstadoDia() {
  const fecha = fechaHoy();
  const [, mes, dia] = fecha.split('-');
  const encabezado = `📊 Estado de hoy (${NOMBRES_DIA[diaSemanaHoy()]} ${dia}/${mes}):`;

  const totalCajas = Number(process.env.CANTIDAD_CAJAS) || 2;
  const aperturas = cajaQueries.listarAperturasDelDia(fecha);
  const cierres = cajaQueries.listarCierresDelDia(fecha);
  const cierreMp = cajaQueries.buscarCierreMpDelDia(fecha);
  const pedidosActivos = pedidosQueries.listarActivos().length;

  const lineas = [encabezado, lineaActivo()];

  if (aperturas.length === 0) {
    lineas.push('Hoy todavía no se registró apertura.');
    lineas.push(`Pedidos activos: ${pedidosActivos}`);
    return lineas.join('\n');
  }

  const empleadoApertura = empleadosQueries.buscarPorId(aperturas[0].empleado_id);
  const horaApertura = (aperturas[0].created_at || '').slice(11, 16);
  lineas.push(`Apertura: ✅ ${empleadoApertura ? empleadoApertura.nombre : '—'} · ${horaApertura}`);
  for (let c = 1; c <= totalCajas; c += 1) {
    const apertura = aperturas.find((a) => a.caja === c);
    lineas.push(`  Caja ${c}: ${apertura ? formatearMonto(apertura.monto) : 'sin registrar'}`);
  }

  if (cierres.length === 0) {
    lineas.push('Cierre:   ⏳ pendiente');
  } else {
    const horaCierre = (cierres[0].created_at || '').slice(11, 16);
    lineas.push(`Cierre:   ✅ ${horaCierre}`);
    for (let c = 1; c <= totalCajas; c += 1) {
      const apertura = aperturas.find((a) => a.caja === c);
      const cierre = cierres.find((cc) => cc.caja === c);
      if (apertura && cierre) {
        lineas.push(`  Caja ${c}: diferencia ${formatearMonto(cierre.total_contado - apertura.monto)}`);
      }
    }
  }

  lineas.push(`Foto MP:  ${cierreMp ? '✅ recibida' : '⏳ pendiente'}`);
  lineas.push(`Pedidos activos: ${pedidosActivos}`);

  return lineas.join('\n');
}

module.exports = { formatearEstadoDia };
