import { NextResponse } from 'next/server';
import { actualizarProducto, eliminarProducto } from '../../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../../lib/apiAuth.js';

export const runtime = 'nodejs';

export async function PATCH(req, { params }) {
  try {
    exigir('productos');
    const id = Number(params.id);
    const b = await req.json();
    const nombre = String(b.nombre || '').trim();
    const precio = Number(b.precio);
    if (!nombre || !(precio >= 0)) {
      return NextResponse.json({ ok: false, error: 'Nombre y precio válidos son obligatorios.' }, { status: 400 });
    }
    actualizarProducto(id, {
      nombre,
      precio,
      palabrasClave: String(b.palabrasClave || '').trim(),
      activo: b.activo ? 1 : 0,
      stockMinimo: Number(b.stockMinimo) || 0,
      codigoBarras: String(b.codigoBarras || '').trim() || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    exigir('productos');
    eliminarProducto(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
