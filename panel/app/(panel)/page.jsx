import { requerirUsuario } from '../../lib/guard.js';
import Topbar from '../../components/Topbar.jsx';
import { listarPedidosActivos, listarProductos, listarClientes, resumenCajaHoy, listarBajoStock } from '../../lib/repo.js';
import { estadoBot } from '../../lib/bot.js';
import { formatearMonto } from '../../lib/format.js';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const usuario = requerirUsuario('dashboard');
  const activos = listarPedidosActivos();
  const productos = listarProductos({ soloActivos: true });
  const clientes = listarClientes();
  const { ventasHoy } = resumenCajaHoy();
  const botOnline = await estadoBot();
  const bajoStock = listarBajoStock();

  const listos = activos.filter((p) => p.estado === 'listo').length;

  return (
    <>
      <Topbar titulo={`Hola, ${usuario.nombre.split(' ')[0]}`}>
        <span className={botOnline ? 'ok' : 'error'}>
          {botOnline ? '● Bot conectado' : '● Bot desconectado'}
        </span>
      </Topbar>

      <div className="content">
        <div className="grid cols-4">
          <div className="card stat">
            <span className="label">Ventas de hoy</span>
            <span className="value">{formatearMonto(ventasHoy.total)}</span>
            <span className="muted">{ventasHoy.cantidad} ventas</span>
          </div>
          <div className="card stat">
            <span className="label">Pedidos activos</span>
            <span className="value">{activos.length}</span>
            <span className="muted">{listos} listos para retirar</span>
          </div>
          <div className="card stat">
            <span className="label">Productos activos</span>
            <span className="value">{productos.length}</span>
          </div>
          <div className="card stat">
            <span className="label">Clientes</span>
            <span className="value">{clientes.length}</span>
          </div>
        </div>

        {bajoStock.length > 0 && (
          <>
            <div className="spacer" />
            <Link href="/inventario" className="card" style={{ display: 'block', borderColor: 'var(--yellow)' }}>
              <strong>⚠️ {bajoStock.length} producto(s) en bajo stock</strong>{' '}
              <span className="muted">— {bajoStock.slice(0, 6).map((p) => p.nombre).join(', ')}{bajoStock.length > 6 ? '…' : ''}</span>
            </Link>
          </>
        )}

        <div className="spacer" />

        <div className="card">
          <h2 className="section-title">Accesos rápidos</h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <Link href="/pos" className="btn primary">🧾 Nueva venta</Link>
            <Link href="/pedidos" className="btn">📋 Ver pedidos</Link>
            {usuario.rol === 'admin' && (
              <Link href="/ventas" className="btn">📈 Reporte de ventas</Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
