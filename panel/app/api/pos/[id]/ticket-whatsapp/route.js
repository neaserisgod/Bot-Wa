import { NextResponse } from 'next/server';
import { pedidoConItems } from '../../../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../../../lib/apiAuth.js';
import { notificar } from '../../../../../lib/bot.js';
import { formatearTicketTexto } from '../../../../../lib/format.js';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  try {
    exigir('pos');
    const pedido = pedidoConItems(Number(params.id));
    if (!pedido) {
      return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
    }
    if (!pedido.cliente_telefono) {
      return NextResponse.json(
        { ok: false, error: 'La venta no tiene un cliente con teléfono asociado.' },
        { status: 400 }
      );
    }
    const res = await notificar(pedido.cliente_telefono, formatearTicketTexto(pedido));
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || 'No se pudo enviar el ticket.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
