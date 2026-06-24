'use client';

import { useState } from 'react';
import { formatearMonto } from '../../../lib/format.js';

const VACIO = { nombre: '', precio: '', palabrasClave: '', activo: true, stock: '', stockMinimo: '', codigoBarras: '' };

export default function ProductosManager({ inicial }) {
  const [productos, setProductos] = useState(inicial);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    const res = await fetch('/api/productos', { cache: 'no-store' });
    const data = await res.json();
    if (data.ok) setProductos(data.productos);
  }

  function editar(p) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre,
      precio: String(p.precio),
      palabrasClave: p.palabras_clave || '',
      activo: Boolean(p.activo),
      stock: String(p.stock ?? 0),
      stockMinimo: String(p.stock_minimo ?? 0),
      codigoBarras: p.codigo_barras || '',
    });
    setMensaje('');
  }

  function cancelar() {
    setEditId(null);
    setForm(VACIO);
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    const payload = {
      nombre: form.nombre,
      precio: Number(form.precio),
      palabrasClave: form.palabrasClave,
      activo: form.activo,
      stock: Number(form.stock) || 0,
      stockMinimo: Number(form.stockMinimo) || 0,
      codigoBarras: form.codigoBarras,
    };
    const url = editId ? `/api/productos/${editId}` : '/api/productos';
    const method = editId ? 'PATCH' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setMensaje(data.error || 'No se pudo guardar.');
      } else {
        cancelar();
        await recargar();
      }
    } finally {
      setGuardando(false);
    }
  }

  async function desactivar(id) {
    await fetch(`/api/productos/${id}`, { method: 'DELETE' });
    await recargar();
  }

  return (
    <div className="grid aside">
      <form className="card" onSubmit={guardar}>
        <h3 className="section-title">{editId ? `Editar #${editId}` : 'Nuevo producto'}</h3>
        <div className="field">
          <label>Nombre</label>
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
        </div>
        <div className="field">
          <label>Precio</label>
          <input type="number" step="0.01" min="0" value={form.precio}
            onChange={(e) => setForm({ ...form, precio: e.target.value })} required />
        </div>
        <div className="field">
          <label>Palabras clave (para que el bot lo reconozca, separadas por coma)</label>
          <input placeholder="coca, cocacola, coca cola" value={form.palabrasClave}
            onChange={(e) => setForm({ ...form, palabrasClave: e.target.value })} />
        </div>
        <div className="field">
          <label>Código de barras (escaneá o escribilo)</label>
          <input placeholder="7791234567890" value={form.codigoBarras}
            onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} />
        </div>
        <div className="row" style={{ gap: 10 }}>
          {!editId && (
            <div className="field" style={{ flex: 1 }}>
              <label>Stock inicial</label>
              <input type="number" step="0.01" min="0" value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
          )}
          <div className="field" style={{ flex: 1 }}>
            <label>Stock mínimo (alerta)</label>
            <input type="number" step="0.01" min="0" value={form.stockMinimo}
              onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })} />
          </div>
        </div>
        {editId && (
          <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
            El stock se modifica desde Inventario (ingresos y ajustes).
          </p>
        )}
        <label className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
          <span>Activo</span>
        </label>
        {mensaje && <p className="error">{mensaje}</p>}
        <div className="row">
          <button className="btn primary" disabled={guardando}>{editId ? 'Guardar' : 'Crear'}</button>
          {editId && <button type="button" className="btn ghost" onClick={cancelar}>Cancelar</button>}
        </div>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr><th>Producto</th><th className="right">Precio</th><th className="right">Stock</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.nombre}
                  {p.palabras_clave ? <div className="muted" style={{ fontSize: 12 }}>{p.palabras_clave}</div> : null}
                </td>
                <td className="right">{formatearMonto(p.precio)}</td>
                <td className="right">{p.stock ?? 0}</td>
                <td>{p.activo ? <span className="badge listo">Activo</span> : <span className="badge cancelado">Inactivo</span>}</td>
                <td className="right">
                  <button className="btn ghost sm" onClick={() => editar(p)}>Editar</button>
                  {p.activo ? <button className="btn ghost sm" onClick={() => desactivar(p.id)}>Desactivar</button> : null}
                </td>
              </tr>
            ))}
            {productos.length === 0 && <tr><td colSpan={5} className="muted">Sin productos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
