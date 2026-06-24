import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import { listarClientes } from '../../../lib/repo.js';
import { formatearMonto, formatearFecha } from '../../../lib/format.js';

export const dynamic = 'force-dynamic';

export default function ClientesPage() {
  requerirUsuario('clientes');
  const clientes = listarClientes();
  return (
    <>
      <Topbar titulo="Clientes" />
      <div className="content">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Cliente</th><th>Teléfono</th>
                <th className="right">Pedidos</th>
                <th className="right">Total gastado</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre || <span className="muted">Sin nombre</span>}</td>
                  <td>{c.telefono}</td>
                  <td className="right">{c.cantidad_pedidos}</td>
                  <td className="right">{formatearMonto(c.total_gastado)}</td>
                  <td className="muted">{formatearFecha(c.created_at)}</td>
                </tr>
              ))}
              {clientes.length === 0 && <tr><td colSpan={5} className="muted">Todavía no hay clientes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
