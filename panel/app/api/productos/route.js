import { NextResponse } from 'next/server';
import { listarProductos, crearProducto } from '../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../lib/apiAuth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    exigir('productos');
    return NextResponse.json({ ok: true, productos: listarProductos() });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    exigir('productos');
    const b = await req.json();
    const nombre = String(b.nombre || '').trim();
    const precio = Number(b.precio);
    if (!nombre || !(precio >= 0)) {
      return NextResponse.json({ ok: false, error: 'Nombre y precio válidos son obligatorios.' }, { status: 400 });
    }
    const id = crearProducto({
      nombre,
      precio,
      palabrasClave: String(b.palabrasClave || '').trim(),
      activo: b.activo === false ? 0 : 1,
      stock: Number(b.stock) || 0,
      stockMinimo: Number(b.stockMinimo) || 0,
      codigoBarras: String(b.codigoBarras || '').trim() || null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
