// Autorización para route handlers (APIs). Devuelve el usuario o lanza una
// respuesta con el código adecuado, que el handler debe propagar.
import { NextResponse } from 'next/server';
import { getUsuario, puedeVer } from './auth.js';

export class RespuestaError extends Error {
  constructor(respuesta) {
    super('auth');
    this.respuesta = respuesta;
  }
}

// Usar dentro de try/catch: si falla, hacer `return e.respuesta`.
export function exigir(modulo = null) {
  const usuario = getUsuario();
  if (!usuario) {
    throw new RespuestaError(NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 }));
  }
  if (modulo && !puedeVer(usuario.rol, modulo)) {
    throw new RespuestaError(NextResponse.json({ ok: false, error: 'Sin permiso' }, { status: 403 }));
  }
  return usuario;
}
