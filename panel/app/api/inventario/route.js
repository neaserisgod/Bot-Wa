import { NextResponse } from 'next/server';
import { ingresarStock, ajustarStock, listarMovimientos } from '../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../lib/apiAuth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Historial de movimientos (opcionalmente por producto).
export async function GET(req) {
  try {
    exigir('inventario');
    const productoId = new URL(req.url).searchParams.get('productoId');
    return NextResponse.json({
      ok: true,
      movimientos: listarMovimientos({ productoId: productoId ? Number(productoId) : null }),
    });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

// Movimiento de stock: { productoId, accion: 'ingreso'|'ajuste', cantidad|nuevoValor, motivo }
export async function POST(req) {
  try {
    const usuario = exigir('inventario');
    const b = await req.json();
    const productoId = Number(b.productoId);
    if (!productoId) {
      return NextResponse.json({ ok: false, error: 'Falta el producto.' }, { status: 400 });
    }
    let stock;
    if (b.accion === 'ingreso') {
      stock = ingresarStock({
        productoId,
        cantidad: Number(b.cantidad),
        motivo: b.motivo || 'Ingreso',
        empleadoId: usuario.id,
      });
    } else if (b.accion === 'ajuste') {
      stock = ajustarStock({
        productoId,
        nuevoValor: Number(b.nuevoValor),
        motivo: b.motivo || 'Ajuste de inventario',
        empleadoId: usuario.id,
      });
    } else {
      return NextResponse.json({ ok: false, error: 'Acción inválida.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, stock });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: e.message || 'Error interno' }, { status: 500 });
  }
}
