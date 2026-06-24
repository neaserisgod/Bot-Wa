import { NextResponse } from 'next/server';
import { empleadoPorTelefono, guardarCodigo, getCodigo } from '../../../../lib/repo.js';
import { normalizarTelefono, generarCodigo, hashearCodigo } from '../../../../lib/auth.js';
import { notificar } from '../../../../lib/bot.js';

export const runtime = 'nodejs';

const VIGENCIA_MS = 5 * 60 * 1000; // el código vive 5 minutos
const REENVIO_MIN_MS = 30 * 1000; // no reenviar antes de 30 segundos

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Pedido inválido' }, { status: 400 });
  }

  const telefono = normalizarTelefono(body.telefono);
  if (!telefono || telefono.length < 8) {
    return NextResponse.json({ ok: false, error: 'Ingresá un celular válido.' }, { status: 400 });
  }

  const empleado = empleadoPorTelefono(telefono);

  // Para no revelar qué números están habilitados, respondemos OK aunque el
  // número no corresponda a un empleado: simplemente no se envía nada.
  if (!empleado || !empleado.activo) {
    return NextResponse.json({ ok: true });
  }

  // Anti-spam: si ya mandamos un código hace muy poco, no reenviamos.
  const existente = getCodigo(telefono);
  if (existente && Date.now() - existente.enviado_at < REENVIO_MIN_MS) {
    const seg = Math.ceil((REENVIO_MIN_MS - (Date.now() - existente.enviado_at)) / 1000);
    return NextResponse.json(
      { ok: false, error: `Ya te enviamos un código. Esperá ${seg}s para pedir otro.` },
      { status: 429 }
    );
  }

  const codigo = generarCodigo();
  guardarCodigo(telefono, hashearCodigo(codigo), Date.now() + VIGENCIA_MS);

  const mensaje =
    `🔐 Tu código para entrar al Panel Nefertiti es: *${codigo}*\n` +
    `Vence en 5 minutos. Si no fuiste vos, ignorá este mensaje.`;

  const res = await notificar(telefono, mensaje);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: 'No pudimos enviar el código por WhatsApp. ¿El bot está conectado?' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
