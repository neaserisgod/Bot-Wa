import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import { resumenVentas, ventasPorDia, topProductos, fechaHoy } from '../../../lib/repo.js';
import { formatearMonto } from '../../../lib/format.js';

export const dynamic = 'force-dynamic';

function restarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export default function VentasPage({ searchParams }) {
  requerirUsuario('ventas');

  const hoy = fechaHoy();
  const hasta = searchParams?.hasta || hoy;
  const desde = searchParams?.desde || restarDias(hasta, 6);

  const resumen = resumenVentas({ desde, hasta });
  const porDia = ventasPorDia({ dias: 30 });
  const top = topProductos({ desde, hasta, limite: 10 });
  const ticket = resumen.cantidad ? resumen.total / resumen.cantidad : 0;

  return (
    <>
      <Topbar titulo="Ventas" />
      <div className="content">
        <form className="card" method="get" style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" name="desde" defaultValue={desde} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" name="hasta" defaultValue={hasta} />
            </div>
            <button className="btn primary">Aplicar</button>
          </div>
        </form>

        <div className="grid cols-3">
          <div className="card stat">
            <span className="label">Total vendido</span>
            <span className="value">{formatearMonto(resumen.total)}</span>
            <span className="muted">{desde} a {hasta}</span>
          </div>
          <div className="card stat">
            <span className="label">Cantidad de ventas</span>
            <span className="value">{resumen.cantidad}</span>
          </div>
          <div className="card stat">
            <span className="label">Ticket promedio</span>
            <span className="value">{formatearMonto(ticket)}</span>
          </div>
        </div>

        <div className="spacer" />

        <div className="grid two">
          <div className="card">
            <h3 className="section-title">Productos más vendidos (rango elegido)</h3>
            <table>
              <thead><tr><th>Producto</th><th className="right">Unid.</th><th className="right">Total</th></tr></thead>
              <tbody>
                {top.map((t, i) => (
                  <tr key={i}>
                    <td>{t.nombre}</td>
                    <td className="right">{t.unidades}</td>
                    <td className="right">{formatearMonto(t.total)}</td>
                  </tr>
                ))}
                {top.length === 0 && <tr><td colSpan={3} className="muted">Sin ventas en el rango.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 className="section-title">Ventas por día (últimos 30)</h3>
            <table>
              <thead><tr><th>Día</th><th className="right">Ventas</th><th className="right">Total</th></tr></thead>
              <tbody>
                {porDia.map((d) => (
                  <tr key={d.dia}>
                    <td>{d.dia}</td>
                    <td className="right">{d.cantidad}</td>
                    <td className="right">{formatearMonto(d.total)}</td>
                  </tr>
                ))}
                {porDia.length === 0 && <tr><td colSpan={3} className="muted">Sin datos.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
