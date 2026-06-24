import { NextResponse } from 'next/server';
import {
  empleadoPorTelefono,
  getCodigo,
  sumarIntentoCodigo,
  borrarCodigo,
} from '../../../../lib/repo.js';
import { normalizarTelefono, compararCodigo, setCookieSesion } from '../../../../lib/auth.js';

export const runtime = 'nodejs';

const MAX_INTENTOS = 5;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Pedido inválido' }, { status: 400 });
  }

  const telefono = normalizarTelefono(body.telefono);
  const codigo = String(body.codigo || '').trim();
  const recordar = body.recordar !== false; // por defecto recuerda la sesión

  if (!telefono || !codigo) {
    return NextResponse.json({ ok: false, error: 'Falta el código.' }, { status: 400 });
  }

  const registro = getCodigo(telefono);
  if (!registro) {
    return NextResponse.json(
      { ok: false, error: 'No hay un código pendiente. Pedí uno nuevo.' },
      { status: 400 }
    );
  }

  if (Date.now() > registro.expira_at) {
    borrarCodigo(telefono);
    return NextResponse.json({ ok: false, error: 'El código venció. Pedí uno nuevo.' }, { status: 400 });
  }

  if (registro.intentos >= MAX_INTENTOS) {
    borrarCodigo(telefono);
    return NextResponse.json(
      { ok: false, error: 'Demasiados intentos. Pedí un código nuevo.' },
      { status: 429 }
    );
  }

  if (!compararCodigo(codigo, registro.codigo_hash)) {
    sumarIntentoCodigo(telefono);
    const restantes = MAX_INTENTOS - (registro.intentos + 1);
    return NextResponse.json(
      { ok: false, error: `Código incorrecto. Te quedan ${Math.max(restantes, 0)} intentos.` },
      { status: 401 }
    );
  }

  // Código correcto: confirmamos que el empleado sigue habilitado.
  const empleado = empleadoPorTelefono(telefono);
  if (!empleado || !empleado.activo) {
    borrarCodigo(telefono);
    return NextResponse.json({ ok: false, error: 'Tu usuario no está habilitado.' }, { status: 403 });
  }

  borrarCodigo(telefono);
  setCookieSesion(empleado, recordar);
  return NextResponse.json({ ok: true, rol: empleado.rol });
}
