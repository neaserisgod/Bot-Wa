// Helpers de autorización para usar en server components (páginas).
import { redirect } from 'next/navigation';
import { getUsuario, puedeVer } from './auth.js';

// Devuelve el usuario o redirige a /login. Si se pasa `modulo`, además exige
// que el rol tenga permiso para ese módulo (si no, manda al inicio).
export function requerirUsuario(modulo = null) {
  const usuario = getUsuario();
  if (!usuario) redirect('/login');
  if (modulo && !puedeVer(usuario.rol, modulo)) redirect('/');
  return usuario;
}
