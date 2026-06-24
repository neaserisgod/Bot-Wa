import { NextResponse } from 'next/server';
import { buscarClientesPOS } from '../../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../../lib/apiAuth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    exigir('pos');
    const q = new URL(req.url).searchParams.get('q') || '';
    if (q.trim().length < 2) return NextResponse.json({ ok: true, clientes: [] });
    return NextResponse.json({ ok: true, clientes: buscarClientesPOS(q) });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
