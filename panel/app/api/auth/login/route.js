// Ruta obsoleta: el login por PIN se reemplazó por 2FA con código de WhatsApp.
// Ver /api/auth/solicitar-codigo y /api/auth/verificar-codigo.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Método de login no disponible. Usá el código de WhatsApp.' },
    { status: 410 }
  );
}
