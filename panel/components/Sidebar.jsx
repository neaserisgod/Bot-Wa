'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

// Orden de aparición en el menú lateral (escritorio).
const ITEMS = [
  { modulo: 'pos', href: '/pos', label: 'Punto de venta', icon: '🧾' },
  { modulo: 'pedidos', href: '/pedidos', label: 'Pedidos', icon: '📋' },
  { modulo: 'dashboard', href: '/', label: 'Inicio', icon: '🏠' },
  { modulo: 'inventario', href: '/inventario', label: 'Inventario', icon: '🏷️' },
  { modulo: 'productos', href: '/productos', label: 'Productos', icon: '📦' },
  { modulo: 'clientes', href: '/clientes', label: 'Clientes', icon: '👤' },
  { modulo: 'ventas', href: '/ventas', label: 'Ventas', icon: '📈' },
  { modulo: 'caja', href: '/caja', label: 'Caja', icon: '💵' },
  { modulo: 'empleados', href: '/empleados', label: 'Empleados', icon: '🛠️' },
];

// Prioridad para la barra inferior en celular (los 4 primeros visibles + "Más").
const PRIORIDAD_MOVIL = ['pos', 'pedidos', 'dashboard', 'inventario', 'ventas', 'clientes', 'productos', 'caja', 'empleados'];

function esActivo(pathname, href) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export default function Sidebar({ modulos, usuario }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  const visibles = ITEMS.filter((i) => modulos.includes(i.modulo));
  const movilPrincipales = PRIORIDAD_MOVIL
    .map((m) => visibles.find((i) => i.modulo === m))
    .filter(Boolean)
    .slice(0, 4);

  async function salir() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  function ir(href) {
    setDrawer(false);
    router.push(href);
  }

  return (
    <>
      {/* ===== Sidebar (escritorio) ===== */}
      <aside className="sidebar">
        <div className="brand">
          <div>
            Nefertiti
            <small>Gestión y ventas</small>
          </div>
        </div>
        <nav className="nav">
          {visibles.map((i) => (
            <Link key={i.href} href={i.href} className={esActivo(pathname, i.href) ? 'active' : ''}>
              <span className="nav-ic">{i.icon}</span> <span>{i.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ marginBottom: 8 }}>
            {usuario.nombre}
            <br />
            <span className="muted">{usuario.rol === 'admin' ? 'Administrador' : 'Empleado'}</span>
          </div>
          <button className="btn ghost sm" onClick={salir}>Salir</button>
        </div>
      </aside>

      {/* ===== Barra inferior (celular) ===== */}
      <nav className="bottomnav">
        {movilPrincipales.map((i) => (
          <Link key={i.href} href={i.href} className={`bn-item ${esActivo(pathname, i.href) ? 'active' : ''}`}>
            <span className="bn-ic">{i.icon}</span>
            <span className="bn-label">{i.label.split(' ')[0]}</span>
          </Link>
        ))}
        <button className="bn-item" onClick={() => setDrawer(true)}>
          <span className="bn-ic">☰</span>
          <span className="bn-label">Más</span>
        </button>
      </nav>

      {/* ===== Cajón "Más" (celular) ===== */}
      {drawer && (
        <div className="drawer-overlay" onClick={() => setDrawer(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <strong>{usuario.nombre}</strong>
              <span className="muted">{usuario.rol === 'admin' ? 'Administrador' : 'Empleado'}</span>
            </div>
            <div className="drawer-list">
              {visibles.map((i) => (
                <button
                  key={i.href}
                  className={`drawer-item ${esActivo(pathname, i.href) ? 'active' : ''}`}
                  onClick={() => ir(i.href)}
                >
                  <span className="nav-ic">{i.icon}</span> {i.label}
                </button>
              ))}
            </div>
            <button className="btn ghost" style={{ width: '100%' }} onClick={salir}>Cerrar sesión</button>
          </div>
        </div>
      )}
    </>
  );
}
