'use client';

import { useState } from 'react';

export default function EmpleadosManager({ inicial, miId }) {
  const [empleados, setEmpleados] = useState(inicial);
  const [form, setForm] = useState({ nombre: '', telefono: '', rol: 'empleado' });
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    const res = await fetch('/api/empleados', { cache: 'no-store' });
    const data = await res.json();
    if (data.ok) setEmpleados(data.empleados);
  }

  async function crear(e) {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) {
        setMensaje(data.error || 'No se pudo crear.');
      } else {
        setForm({ nombre: '', telefono: '', rol: 'empleado' });
        await recargar();
      }
    } finally {
      setGuardando(false);
    }
  }

  async function actualizar(id, cambios) {
    setMensaje('');
    const res = await fetch(`/api/empleados/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    const data = await res.json();
    if (!data.ok) setMensaje(data.error || 'No se pudo actualizar.');
    await recargar();
  }

  return (
    <div className="grid aside">
      <form className="card" onSubmit={crear}>
        <h3 className="section-title">Nuevo usuario</h3>
        <div className="field">
          <label>Nombre</label>
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
        </div>
        <div className="field">
          <label>Celular (con código de país, sin +)</label>
          <input inputMode="numeric" placeholder="549XXXXXXXXXX" value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })} required />
        </div>
        <div className="field">
          <label>Rol</label>
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
            <option value="empleado">Empleado</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        {mensaje && <p className="error">{mensaje}</p>}
        <button className="btn primary" disabled={guardando}>{guardando ? 'Creando…' : 'Crear usuario'}</button>
        <p className="muted" style={{ fontSize: 12 }}>
          El usuario entra al panel con su celular y el código que le llega por WhatsApp.
        </p>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Celular</th><th>Rol</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {empleados.map((e) => (
              <tr key={e.id}>
                <td>{e.nombre}{e.id === miId ? <span className="muted"> (vos)</span> : null}</td>
                <td>{e.telefono}</td>
                <td>
                  <select value={e.rol} disabled={e.id === miId}
                    onChange={(ev) => actualizar(e.id, { rol: ev.target.value })}>
                    <option value="empleado">Empleado</option>
                    <option value="admin">Administrador</option>
                  </select>
                </td>
                <td>{e.activo ? <span className="badge listo">Activo</span> : <span className="badge cancelado">Inactivo</span>}</td>
                <td className="right">
                  {e.id !== miId && (
                    <button className="btn ghost sm" onClick={() => actualizar(e.id, { activo: e.activo ? false : true })}>
                      {e.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
