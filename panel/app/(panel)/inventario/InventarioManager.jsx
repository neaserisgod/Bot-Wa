'use client';

import { useState } from 'react';
import { formatearMonto, formatearFecha } from '../../../lib/format.js';

const ETIQUETA_TIPO = { venta: 'Venta', ingreso: 'Ingreso', ajuste: 'Ajuste' };

export default function InventarioManager({ inicial, movimientosIniciales }) {
  const [productos, setProductos] = useState(inicial);
  const [movimientos, setMovimientos] = useState(movimientosIniciales);
  const [accion, setAccion] = useState(null); // { tipo:'ingreso'|'ajuste', producto }
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const bajoStock = productos.filter((p) => (p.stock ?? 0) <= (p.stock_minimo ?? 0));

  async function recargar() {
    const [rp, rm] = await Promise.all([
      fetch('/api/productos', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/inventario', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);
    if (rp?.ok) setProductos(rp.productos.filter((p) => p.activo));
    if (rm?.ok) setMovimientos(rm.movimientos);
  }

  function abrir(tipo, producto) {
    setAccion({ tipo, producto });
    setValor(tipo === 'ajuste' ? String(producto.stock ?? 0) : '');
    setMotivo('');
    setMensaje('');
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    const payload =
      accion.tipo === 'ingreso'
        ? { productoId: accion.producto.id, accion: 'ingreso', cantidad: Number(valor), motivo }
        : { productoId: accion.producto.id, accion: 'ajuste', nuevoValor: Number(valor), motivo };
    try {
      const res = await fetch('/api/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setMensaje(data.error || 'No se pudo registrar el movimiento.');
      } else {
        setAccion(null);
        await recargar();
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      {bajoStock.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--yellow)' }}>
          <strong>⚠️ {bajoStock.length} producto(s) en bajo stock:</strong>{' '}
          <span className="muted">{bajoStock.map((p) => p.nombre).join(', ')}</span>
        </div>
      )}

      <div className="grid aside-wide">
        <div className="card">
          <h3 className="section-title">Existencias</h3>
          <table>
            <thead>
              <tr><th>Producto</th><th className="right">Stock</th><th className="right">Mínimo</th><th></th></tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const bajo = (p.stock ?? 0) <= (p.stock_minimo ?? 0);
                return (
                  <tr key={p.id}>
                    <td>{p.nombre}<div className="muted" style={{ fontSize: 12 }}>{formatearMonto(p.precio)}</div></td>
                    <td className="right">
                      <span className={bajo ? 'badge cancelado' : 'badge listo'}>{p.stock ?? 0}</span>
                    </td>
                    <td className="right muted">{p.stock_minimo ?? 0}</td>
                    <td className="right">
                      <button className="btn ghost sm" onClick={() => abrir('ingreso', p)}>+ Ingresar</button>
                      <button className="btn ghost sm" onClick={() => abrir('ajuste', p)}>Ajustar</button>
                    </td>
                  </tr>
                );
              })}
              {productos.length === 0 && <tr><td colSpan={4} className="muted">Sin productos activos.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 className="section-title">Movimientos recientes</h3>
          <table>
            <thead><tr><th>Producto</th><th>Tipo</th><th className="right">Cant.</th><th>Fecha</th></tr></thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{m.producto_nombre || '—'}</td>
                  <td>{ETIQUETA_TIPO[m.tipo] || m.tipo}</td>
                  <td className="right" style={{ color: m.cantidad < 0 ? 'var(--red)' : 'var(--green)' }}>
                    {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                  </td>
                  <td className="muted">{formatearFecha(m.created_at)}</td>
                </tr>
              ))}
              {movimientos.length === 0 && <tr><td colSpan={4} className="muted">Sin movimientos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {accion && (
        <div className="login-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50 }}>
          <form className="card login-card" onSubmit={guardar}>
            <h3 className="section-title">
              {accion.tipo === 'ingreso' ? 'Ingresar stock' : 'Ajustar stock'} · {accion.producto.nombre}
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>Stock actual: {accion.producto.stock ?? 0}</p>
            <div className="field">
              <label>{accion.tipo === 'ingreso' ? 'Cantidad a sumar' : 'Stock real (nuevo valor)'}</label>
              <input type="number" step="0.01" min="0" value={valor}
                onChange={(e) => setValor(e.target.value)} autoFocus required />
            </div>
            <div className="field">
              <label>Motivo (opcional)</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder={accion.tipo === 'ingreso' ? 'Compra a proveedor' : 'Conteo físico'} />
            </div>
            {mensaje && <p className="error">{mensaje}</p>}
            <div className="row">
              <button className="btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Confirmar'}</button>
              <button type="button" className="btn ghost" onClick={() => setAccion(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
