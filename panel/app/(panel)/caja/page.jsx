import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import { resumenCajaHoy } from '../../../lib/repo.js';
import { formatearMonto, formatearFecha } from '../../../lib/format.js';

export const dynamic = 'force-dynamic';

export default function CajaPage() {
  requerirUsuario('caja');
  const { aperturas, cierres, ventasHoy } = resumenCajaHoy();

  return (
    <>
      <Topbar titulo="Caja (hoy)" />
      <div className="content">
        <div className="grid cols-3">
          <div className="card stat">
            <span className="label">Ventas del panel hoy</span>
            <span className="value">{formatearMonto(ventasHoy.total)}</span>
            <span className="muted">{ventasHoy.cantidad} ventas registradas</span>
          </div>
          <div className="card stat">
            <span className="label">Aperturas de caja</span>
            <span className="value">{aperturas.length}</span>
          </div>
          <div className="card stat">
            <span className="label">Cierres de caja</span>
            <span className="value">{cierres.length}</span>
          </div>
        </div>

        <div className="spacer" />

        <div className="grid two">
          <div className="card">
            <h3 className="section-title">Aperturas</h3>
            <table>
              <thead><tr><th>Caja</th><th>Empleado</th><th className="right">Monto</th><th>Hora</th></tr></thead>
              <tbody>
                {aperturas.map((a) => (
                  <tr key={a.id}>
                    <td>#{a.caja}</td>
                    <td>{a.empleado_nombre || '—'}</td>
                    <td className="right">{formatearMonto(a.monto)}</td>
                    <td className="muted">{formatearFecha(a.created_at)}</td>
                  </tr>
                ))}
                {aperturas.length === 0 && <tr><td colSpan={4} className="muted">Sin aperturas hoy.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 className="section-title">Cierres</h3>
            <table>
              <thead><tr><th>Caja</th><th>Empleado</th><th className="right">Contado</th><th>Hora</th></tr></thead>
              <tbody>
                {cierres.map((c) => (
                  <tr key={c.id}>
                    <td>#{c.caja}</td>
                    <td>{c.empleado_nombre || '—'}</td>
                    <td className="right">{formatearMonto(c.total_contado)}</td>
                    <td className="muted">{formatearFecha(c.created_at)}</td>
                  </tr>
                ))}
                {cierres.length === 0 && <tr><td colSpan={4} className="muted">Sin cierres hoy.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          La apertura y el cierre de caja se siguen operando desde el bot de WhatsApp.
          Acá los ves en modo lectura.
        </p>
      </div>
    </>
  );
}
