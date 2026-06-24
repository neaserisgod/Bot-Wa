import { NextResponse } from 'next/server';
import { borrarCookieSesion } from '../../../../lib/auth.js';

export const runtime = 'nodejs';

export async function POST() {
  borrarCookieSesion();
  return NextResponse.json({ ok: true });
}
