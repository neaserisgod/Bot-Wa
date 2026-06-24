import { NextResponse } from 'next/server';
import { pedidoConItems } from '../../../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../../../lib/apiAuth.js';
import { avisarPedidoListo } from '../../../../../lib/bot.js';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  try {
    exigir('pedidos');
    const id = Number(params.id);
    const pedido = pedidoConItems(id);
    if (!pedido) {
      return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 });
    }

    // El bot marca el pedido como listo y le avisa al cliente por WhatsApp.
    const res = await avisarPedidoListo(id);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || 'No se pudo avisar (¿el bot está conectado?)' },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, avisado: res.avisado, motivo: res.motivo });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
