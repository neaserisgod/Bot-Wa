import { NextResponse } from 'next/server';
import { listarEmpleados, crearEmpleado, empleadoPorTelefono } from '../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../lib/apiAuth.js';
import { normalizarTelefono } from '../../../lib/auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    exigir('empleados');
    return NextResponse.json({ ok: true, empleados: listarEmpleados() });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    exigir('empleados');
    const b = await req.json();
    const nombre = String(b.nombre || '').trim();
    const telefono = normalizarTelefono(b.telefono);
    const rol = b.rol === 'admin' ? 'admin' : 'empleado';
    if (!nombre || telefono.length < 8) {
      return NextResponse.json({ ok: false, error: 'Nombre y celular válidos son obligatorios.' }, { status: 400 });
    }
    if (empleadoPorTelefono(telefono)) {
      return NextResponse.json({ ok: false, error: 'Ya existe un usuario con ese celular.' }, { status: 409 });
    }
    const id = crearEmpleado({ nombre, telefono, rol });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
