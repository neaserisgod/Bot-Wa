// Protege todo el panel: si no hay cookie de sesión válida, redirige a /login.
// El middleware corre en el runtime Edge, así que usamos solo Web Crypto y
// nada de Buffer/Node. Acá solo verificamos la FIRMA y la expiración del token;
// la validación contra la base de datos ya ocurrió al hacer login.
import { NextResponse } from 'next/server';

const NOMBRE_COOKIE = 'panel_session';

function base64urlABytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesABase64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenValido(token) {
  if (!token || !token.includes('.')) return false;
  const secret = process.env.PANEL_SESSION_SECRET;
  if (!secret) return false;
  const [payloadB64, firma] = token.split('.');

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const firmaBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
    if (firma !== bytesABase64url(firmaBuf)) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64urlABytes(payloadB64)));
    return Boolean(payload.exp && payload.exp > Date.now());
  } catch {
    return false;
  }
}

export async function middleware(req) {
  const token = req.cookies.get(NOMBRE_COOKIE)?.value;
  if (await tokenValido(token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

// Aplica a todo menos: /login, las rutas de auth, estáticos y favicon.
export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
