import { NextResponse } from 'next/server';
import {
  cambiarEstadoPedido,
  pedidoConItems,
  ESTADOS_PEDIDO,
  descontarStockDePedido,
} from '../../../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../../../lib/apiAuth.js';

export const runtime = 'nodejs';

export async function PATCH(req, { params }) {
  try {
    const usuario = exigir('pedidos');
    const id = Number(params.id);
    const { estado } = await req.json();
    if (!ESTADOS_PEDIDO.includes(estado)) {
      return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 });
    }
    if (!pedidoConItems(id)) {
      return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 });
    }
    cambiarEstadoPedido(id, estado);
    // Al retirar el pedido, la mercadería sale: descontamos stock (una sola vez).
    if (estado === 'retirado') descontarStockDePedido(id, usuario.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
