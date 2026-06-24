import { NextResponse } from 'next/server';
import { listarPedidos, listarPedidosActivos } from '../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../lib/apiAuth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    exigir('pedidos');
    const { searchParams } = new URL(req.url);
    if (searchParams.get('activos') === '1') {
      return NextResponse.json({ ok: true, pedidos: listarPedidosActivos() });
    }
    const estado = searchParams.get('estado');
    const pedidos = listarPedidos({ estados: estado ? [estado] : null });
    return NextResponse.json({ ok: true, pedidos });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
