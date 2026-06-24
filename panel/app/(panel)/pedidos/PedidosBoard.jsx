'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { formatearMonto, formatearFecha, ETIQUETA_ESTADO } from '../../../lib/format.js';

// Beep corto con Web Audio (sin archivos). Suena al entrar un pedido nuevo.
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start();
    o.stop(ctx.currentTime + 0.45);
    setTimeout(() => ctx.close(), 700);
  } catch {
    /* el navegador puede bloquear audio sin interacción; no pasa nada */
  }
}

const COLUMNAS = [
  { estado: 'pendiente', titulo: 'Pendientes' },
  { estado: 'confirmado', titulo: 'Confirmados' },
  { estado: 'en_preparacion', titulo: 'En preparación' },
  { estado: 'listo', titulo: 'Listos' },
];

export default function PedidosBoard({ inicial }) {
  const [pedidos, setPedidos] = useState(inicial);
  const [trabajando, setTrabajando] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [aviso, setAviso] = useState('');
  const vistos = useRef(new Set(inicial.map((p) => p.id)));

  const recargar = useCallback(async () => {
    try {
      const res = await fetch('/api/pedidos?activos=1', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) return;
      // Detectar pedidos nuevos (ids que no habíamos visto) para avisar.
      const nuevos = data.pedidos.filter((p) => !vistos.current.has(p.id));
      data.pedidos.forEach((p) => vistos.current.add(p.id));
      if (nuevos.length) {
        beep();
        setAviso(`🔔 ${nuevos.length} pedido(s) nuevo(s): ${nuevos.map((p) => '#' + p.id).join(', ')}`);
      }
      setPedidos(data.pedidos);
    } catch {
      /* silencioso: reintenta en el próximo tick */
    }
  }, []);

  // Refresco automático cada 10s para ver pedidos nuevos del bot.
  useEffect(() => {
    const t = setInterval(recargar, 10000);
    return () => clearInterval(t);
  }, [recargar]);

  async function cambiarEstado(id, estado) {
    setTrabajando(id);
    setMensaje('');
    try {
      const res = await fetch(`/api/pedidos/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      const data = await res.json();
      if (!data.ok) setMensaje(data.error || 'No se pudo actualizar.');
      await recargar();
    } finally {
      setTrabajando(null);
    }
  }

  async function avisarListo(id) {
    setTrabajando(id);
    setMensaje('');
    try {
      const res = await fetch(`/api/pedidos/${id}/avisar-listo`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        setMensaje(data.error || 'No se pudo avisar al cliente.');
      } else if (data.avisado === false) {
        setMensaje(`Pedido #${id} marcado listo, pero ${data.motivo || 'no había a quién avisar'}.`);
      } else {
        setMensaje(`✅ Pedido #${id}: cliente avisado por WhatsApp.`);
      }
      await recargar();
    } finally {
      setTrabajando(null);
    }
  }

  const porEstado = (estado) => pedidos.filter((p) => p.estado === estado);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="muted">{pedidos.length} pedidos activos · se actualiza solo</span>
        <button className="btn sm" onClick={recargar}>↻ Actualizar</button>
      </div>

      {aviso && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong style={{ color: 'var(--primary-2)' }}>{aviso}</strong>
            <button className="btn ghost sm" onClick={() => setAviso('')}>Entendido</button>
          </div>
        </div>
      )}
      {mensaje && <p className="ok" style={{ marginTop: 0 }}>{mensaje}</p>}

      <div className="grid cols-4">
        {COLUMNAS.map((col) => (
          <div key={col.estado}>
            <h3 className="section-title">
              {col.titulo} <span className="muted">({porEstado(col.estado).length})</span>
            </h3>
            <div className="grid" style={{ gap: 10 }}>
              {porEstado(col.estado).map((p) => (
                <div key={p.id} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>#{p.id}</strong>
                    <span className={`badge ${p.estado}`}>{ETIQUETA_ESTADO[p.estado]}</span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {p.cliente_nombre || p.cliente_telefono || 'Mostrador'}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {formatearMonto(p.total)} · {formatearFecha(p.created_at)}
                  </div>

                  <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {p.estado === 'pendiente' && (
                      <button className="btn sm" disabled={trabajando === p.id}
                        onClick={() => cambiarEstado(p.id, 'confirmado')}>Confirmar</button>
                    )}
                    {(p.estado === 'confirmado' || p.estado === 'pendiente') && (
                      <button className="btn sm" disabled={trabajando === p.id}
                        onClick={() => cambiarEstado(p.id, 'en_preparacion')}>Preparar</button>
                    )}
                    {p.estado !== 'listo' && (
                      <button className="btn sm green" disabled={trabajando === p.id}
                        onClick={() => avisarListo(p.id)}>✓ Listo + avisar</button>
                    )}
                    {p.estado === 'listo' && (
                      <button className="btn sm primary" disabled={trabajando === p.id}
                        onClick={() => cambiarEstado(p.id, 'retirado')}>📦 Retirado</button>
                    )}
                  </div>
                </div>
              ))}
              {porEstado(col.estado).length === 0 && (
                <p className="muted" style={{ fontSize: 13 }}>—</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
