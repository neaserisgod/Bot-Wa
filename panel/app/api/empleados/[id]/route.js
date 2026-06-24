import { NextResponse } from 'next/server';
import { actualizarEmpleado, empleadoPorId } from '../../../../lib/repo.js';
import { exigir, RespuestaError } from '../../../../lib/apiAuth.js';

export const runtime = 'nodejs';

export async function PATCH(req, { params }) {
  try {
    const usuario = exigir('empleados');
    const id = Number(params.id);
    const actual = empleadoPorId(id);
    if (!actual) {
      return NextResponse.json({ ok: false, error: 'Empleado no encontrado' }, { status: 404 });
    }
    const b = await req.json();
    const nombre = b.nombre != null ? String(b.nombre).trim() : actual.nombre;
    const rol = b.rol === 'admin' ? 'admin' : b.rol === 'empleado' ? 'empleado' : actual.rol;
    const activo = b.activo != null ? (b.activo ? 1 : 0) : actual.activo;

    // No permitir que un admin se desactive o se baje de rol a sí mismo
    // (evita quedarse sin ningún administrador por accidente).
    if (usuario.id === id && (rol !== 'admin' || !activo)) {
      return NextResponse.json(
        { ok: false, error: 'No podés quitarte a vos mismo el rol de admin ni desactivarte.' },
        { status: 400 }
      );
    }

    actualizarEmpleado(id, { nombre, rol, activo });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RespuestaError) return e.respuesta;
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
