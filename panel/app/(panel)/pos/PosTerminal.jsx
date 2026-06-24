'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatearMonto, ETIQUETA_MEDIO_PAGO } from '../../../lib/format.js';

const MEDIOS = ['efectivo', 'mercadopago', 'tarjeta', 'otro'];
const MONTOS_RAPIDOS = [500, 1000, 2000, 5000, 10000];

export default function PosTerminal({ productos: productosIniciales }) {
  const [productos, setProductos] = useState(productosIniciales);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [cliente, setCliente] = useState(null); // { id, nombre, telefono }
  const [busqCliente, setBusqCliente] = useState('');
  const [resCliente, setResCliente] = useState([]);
  const [medioPago, setMedioPago] = useState('efectivo');
  const [pagaCon, setPagaCon] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [ultima, setUltima] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cartOpen, setCartOpen] = useState(false); // hoja inferior del carrito (celular)
  const timerCliente = useRef(null);
  const searchRef = useRef(null);

  // Recordar el último medio de pago usado.
  useEffect(() => {
    const guardado = typeof window !== 'undefined' && window.localStorage.getItem('pos_medio_pago');
    if (guardado && MEDIOS.includes(guardado)) setMedioPago(guardado);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('pos_medio_pago', medioPago);
  }, [medioPago]);

  function enfocarBusqueda() {
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.palabras_clave || '').toLowerCase().includes(q) ||
        (p.codigo_barras || '').toLowerCase().includes(q)
    );
  }, [busqueda, productos]);

  // Enter en la búsqueda: si hay un match exacto de código de barras (lector),
  // agrega ese; si no, agrega el primer resultado. Luego limpia y reenfoca.
  function onBuscarKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = busqueda.trim();
    if (!q) return;
    const porCodigo = productos.find((p) => (p.codigo_barras || '') === q);
    const elegido = porCodigo || filtrados[0];
    if (elegido) {
      agregar(elegido);
      setBusqueda('');
      enfocarBusqueda();
    }
  }

  const total = carrito.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
  const vuelto = medioPago === 'efectivo' && pagaCon !== '' ? Number(pagaCon) - total : null;

  function agregar(p) {
    setMensaje('');
    setUltima(null);
    setCarrito((prev) => {
      const i = prev.findIndex((x) => x.productoId === p.id);
      if (i >= 0) {
        const copia = [...prev];
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
        return copia;
      }
      return [...prev, { productoId: p.id, nombre: p.nombre, precioUnitario: p.precio, cantidad: 1 }];
    });
  }

  function cambiarCantidad(productoId, delta) {
    setCarrito((prev) =>
      prev
        .map((i) => (i.productoId === productoId ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0)
    );
  }

  function quitar(productoId) {
    setCarrito((prev) => prev.filter((i) => i.productoId !== productoId));
  }

  function buscarCliente(v) {
    setBusqCliente(v);
    clearTimeout(timerCliente.current);
    if (v.trim().length < 2) {
      setResCliente([]);
      return;
    }
    timerCliente.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(v)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.ok) setResCliente(data.clientes);
      } catch {
        /* ignorar */
      }
    }, 250);
  }

  function elegirCliente(c) {
    setCliente(c);
    setBusqCliente('');
    setResCliente([]);
  }

  async function cobrar() {
    if (!carrito.length) return;
    setCobrando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: carrito, medioPago, clienteId: cliente?.id || null }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMensaje(data.error || 'No se pudo registrar la venta.');
      } else {
        // Guardamos la venta para el ticket y descontamos stock localmente.
        setUltima({
          pedidoId: data.pedidoId,
          items: carrito,
          total,
          medioPago,
          cliente,
          vuelto,
        });
        setProductos((prev) =>
          prev.map((p) => {
            const it = carrito.find((c) => c.productoId === p.id);
            return it ? { ...p, stock: (p.stock ?? 0) - it.cantidad } : p;
          })
        );
        setCarrito([]);
        setPagaCon('');
        setCliente(null);
        enfocarBusqueda(); // listo para la próxima venta sin tocar el mouse
      }
    } catch {
      setMensaje('Error de conexión.');
    } finally {
      setCobrando(false);
    }
  }

  function imprimirTicket(v) {
    const filas = v.items
      .map((i) => `<tr><td>${i.cantidad} x ${i.nombre}</td><td style="text-align:right">${formatearMonto(i.cantidad * i.precioUnitario)}</td></tr>`)
      .join('');
    const html = `<html><head><title>Ticket #${v.pedidoId}</title>
      <style>body{font-family:monospace;padding:12px;width:280px}h3{text-align:center;margin:4px 0}
      table{width:100%;border-collapse:collapse}td{padding:2px 0}hr{border:none;border-top:1px dashed #000}
      .tot{font-weight:bold;font-size:16px}</style></head><body>
      <h3>Almacén Nefertiti</h3>
      <div>Ticket #${v.pedidoId}</div><hr/>
      <table>${filas}</table><hr/>
      <table><tr class="tot"><td>TOTAL</td><td style="text-align:right">${formatearMonto(v.total)}</td></tr>
      <tr><td>Pago</td><td style="text-align:right">${ETIQUETA_MEDIO_PAGO[v.medioPago] || '-'}</td></tr>
      ${v.vuelto != null && v.vuelto >= 0 ? `<tr><td>Vuelto</td><td style="text-align:right">${formatearMonto(v.vuelto)}</td></tr>` : ''}
      </table><hr/><div style="text-align:center">¡Gracias por tu compra!</div>
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  async function enviarTicketWhatsApp(v) {
    setEnviando(true);
    setMensaje('');
    try {
      const res = await fetch(`/api/pos/${v.pedidoId}/ticket-whatsapp`, { method: 'POST' });
      const data = await res.json();
      setMensaje(data.ok ? '✅ Ticket enviado por WhatsApp.' : data.error || 'No se pudo enviar.');
    } catch {
      setMensaje('Error de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  const cantidadItems = carrito.reduce((s, i) => s + i.cantidad, 0);

  return (
    <>
    <div className="pos">
      <div className="card pos-products">
        <div className="field" style={{ marginBottom: 14 }}>
          <input ref={searchRef} placeholder="Escaneá o buscá un producto…" value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={onBuscarKeyDown} autoFocus />
        </div>
        {productos.length === 0 ? (
          <p className="muted">No hay productos cargados. Cargalos desde Productos / Inventario.</p>
        ) : (
          <div className="prod-grid">
            {filtrados.map((p) => (
              <button key={p.id} className="prod-btn" onClick={() => agregar(p)}>
                <div className="p-nombre">{p.nombre}</div>
                <div className="p-precio">{formatearMonto(p.precio)}</div>
                <div className="p-precio" style={{ color: (p.stock ?? 0) <= 0 ? 'var(--red)' : 'var(--muted)' }}>
                  Stock: {p.stock ?? 0}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`pos-cart ${cartOpen ? 'open' : ''}`}>
      <div className="card">
        <div className="pos-cart-handle" />
        <button className="pos-cart-close btn ghost sm" onClick={() => setCartOpen(false)}>✕</button>
        <h3 className="section-title">Carrito</h3>
        {carrito.length === 0 && !ultima && <p className="muted">Tocá productos para agregarlos.</p>}

        {carrito.map((i) => (
          <div key={i.productoId} className="cart-line">
            <div style={{ flex: 1 }}>
              <div>{i.nombre}</div>
              <div className="muted" style={{ fontSize: 13 }}>{formatearMonto(i.precioUnitario)}</div>
            </div>
            <div className="qty">
              <button onClick={() => cambiarCantidad(i.productoId, -1)}>−</button>
              <span>{i.cantidad}</span>
              <button onClick={() => cambiarCantidad(i.productoId, +1)}>+</button>
            </div>
            <div style={{ width: 80, textAlign: 'right' }}>{formatearMonto(i.cantidad * i.precioUnitario)}</div>
            <button className="btn ghost sm" onClick={() => quitar(i.productoId)}>✕</button>
          </div>
        ))}

        {carrito.length > 0 && (
          <>
            {/* Cliente */}
            <div className="field" style={{ marginTop: 14, marginBottom: 8, position: 'relative' }}>
              <label>Cliente (opcional)</label>
              {cliente ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{cliente.nombre || cliente.telefono}</span>
                  <button className="btn ghost sm" onClick={() => setCliente(null)}>Quitar</button>
                </div>
              ) : (
                <>
                  <input placeholder="Buscar por nombre o teléfono…" value={busqCliente}
                    onChange={(e) => buscarCliente(e.target.value)} />
                  {resCliente.length > 0 && (
                    <div className="card" style={{ position: 'absolute', zIndex: 10, top: 64, left: 0, right: 0, padding: 6 }}>
                      {resCliente.map((c) => (
                        <div key={c.id} className="prod-btn" style={{ marginBottom: 4 }} onClick={() => elegirCliente(c)}>
                          {c.nombre || 'Sin nombre'} <span className="muted">· {c.telefono}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Medio de pago */}
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Medio de pago</label>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {MEDIOS.map((m) => (
                  <button key={m} className={`btn sm ${medioPago === m ? 'primary' : ''}`}
                    onClick={() => setMedioPago(m)}>{ETIQUETA_MEDIO_PAGO[m]}</button>
                ))}
              </div>
            </div>

            {medioPago === 'efectivo' && (
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Paga con</label>
                <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                  <button type="button" className="btn sm" onClick={() => setPagaCon(String(total))}>Exacto</button>
                  {MONTOS_RAPIDOS.filter((m) => m >= total).slice(0, 4).map((m) => (
                    <button type="button" key={m} className="btn sm" onClick={() => setPagaCon(String(m))}>
                      ${m.toLocaleString('es-AR')}
                    </button>
                  ))}
                </div>
                <input type="number" min="0" step="0.01" placeholder="0" value={pagaCon}
                  onChange={(e) => setPagaCon(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') cobrar(); }} />
                {vuelto != null && (
                  <p className={vuelto < 0 ? 'error' : 'ok'} style={{ marginBottom: 0, fontSize: 16, fontWeight: 700 }}>
                    {vuelto < 0 ? `Falta ${formatearMonto(-vuelto)}` : `Vuelto: ${formatearMonto(vuelto)}`}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {carrito.length > 0 && (
          <>
            <div className="cart-total">
              <span>Total</span>
              <span>{formatearMonto(total)}</span>
            </div>
            <button className="btn green" style={{ width: '100%' }} disabled={cobrando} onClick={cobrar}>
              {cobrando ? 'Registrando…' : `Cobrar ${formatearMonto(total)}`}
            </button>
            <button className="btn ghost sm" style={{ width: '100%', marginTop: 8 }} onClick={() => setCarrito([])}>
              Vaciar carrito
            </button>
          </>
        )}

        {mensaje && <p className={mensaje.startsWith('✅') ? 'ok' : 'error'}>{mensaje}</p>}

        {/* Ticket de la última venta */}
        {ultima && (
          <div className="card" style={{ marginTop: 14, background: 'var(--surface-2)' }}>
            <h3 className="section-title">Venta #{ultima.pedidoId} registrada</h3>
            <div className="cart-total" style={{ fontSize: 16, margin: '6px 0' }}>
              <span>Total</span><span>{formatearMonto(ultima.total)}</span>
            </div>
            {ultima.vuelto != null && ultima.vuelto >= 0 && (
              <p className="muted" style={{ marginTop: 0 }}>Vuelto: {formatearMonto(ultima.vuelto)}</p>
            )}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <button className="btn sm" onClick={() => imprimirTicket(ultima)}>🖨️ Imprimir ticket</button>
              {ultima.cliente?.telefono && (
                <button className="btn sm primary" disabled={enviando} onClick={() => enviarTicketWhatsApp(ultima)}>
                  {enviando ? 'Enviando…' : '📲 Enviar por WhatsApp'}
                </button>
              )}
              <button className="btn ghost sm" onClick={() => setUltima(null)}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>

    {/* Barra fija de total → abre el carrito (celular) */}
    {carrito.length > 0 && !cartOpen && (
      <div className="pos-bar">
        <div className="pb-total">
          {formatearMonto(total)}{' '}
          <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
            · {cantidadItems} item{cantidadItems !== 1 ? 's' : ''}
          </span>
        </div>
        <button className="btn green" onClick={() => setCartOpen(true)}>Ver carrito</button>
      </div>
    )}
    {cartOpen && <div className="pos-backdrop" onClick={() => setCartOpen(false)} />}
    </>
  );
}
