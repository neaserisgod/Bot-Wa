import { NextResponse } from 'next/server';
import { crearVenta } from '../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../lib/apiAuth.js';

export const runtime = 'nodejs';

const MEDIOS_PAGO = ['efectivo', 'mercadopago', 'tarjeta', 'otro'];

export async function POST(req) {
  try {
    const usuario = exigir('pos');
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ ok: false, error: 'El carrito está vacío.' }, { status: 400 });
    }
    const medioPago = MEDIOS_PAGO.includes(body.medioPago) ? body.medioPago : null;
    // Venta de mostrador: se registra ya entregada (retirado) y descuenta stock.
    const pedidoId = crearVenta({
      clienteId: body.clienteId || null,
      estado: 'retirado',
      medioPago,
      empleadoId: usuario.id,
      items: items.map((i) => ({
        productoId: i.productoId || null,
        nombre: String(i.nombre || 'Producto'),
        cantidad: Number(i.cantidad) || 0,
        precioUnitario: Number(i.precioUnitario) || 0,
      })),
    });
    return NextResponse.json({ ok: true, pedidoId });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
