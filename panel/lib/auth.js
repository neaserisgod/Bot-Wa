// Autenticación por número de celular + PIN, replicando las jerarquías del bot.
//
// - El "usuario" es una fila de la tabla empleados (rol 'admin' o 'empleado').
// - El PIN se guarda hasheado con scrypt en la columna pin_hash.
// - La sesión es una cookie firmada con HMAC-SHA256 (sin dependencias externas).
import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const NOMBRE_COOKIE = 'panel_session';

function secret() {
  const s = process.env.PANEL_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('PANEL_SESSION_SECRET no está configurado (mínimo 16 caracteres).');
  }
  return s;
}

// ===== Normalización de teléfonos =====
// El bot guarda los números en formato internacional sin "+" (ej. 549XXXXXXXXXX).
// Acá dejamos solo dígitos para comparar de forma tolerante.
export function normalizarTelefono(tel) {
  return String(tel || '').replace(/\D/g, '');
}

// ===== Códigos de un solo uso (2FA por WhatsApp) =====
// Genera un código numérico de 6 dígitos.
export function generarCodigo() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Hash del código con HMAC-SHA256 (rápido; el código es corto, de vida breve
// y con límite de intentos, así que no hace falta scrypt).
export function hashearCodigo(codigo) {
  return crypto.createHmac('sha256', secret()).update(String(codigo)).digest('hex');
}

export function compararCodigo(codigo, hashGuardado) {
  const calculado = hashearCodigo(codigo);
  if (calculado.length !== (hashGuardado || '').length) return false;
  return crypto.timingSafeEqual(Buffer.from(calculado), Buffer.from(hashGuardado));
}

// ===== Firma de la cookie de sesión =====
function firmar(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function crearTokenSesion(usuario, horas = Number(process.env.PANEL_SESSION_HORAS) || 12) {
  const payload = {
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    telefono: usuario.telefono,
    exp: Date.now() + horas * 3600 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, firma] = token.split('.');
  const esperada = firmar(payloadB64);
  if (
    firma.length !== esperada.length ||
    !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ===== Helpers de cookies (uso en route handlers / server actions) =====
// recordar=true deja la sesión persistente por más tiempo (que recuerde el
// dispositivo); si es false, dura PANEL_SESSION_HORAS.
export function setCookieSesion(usuario, recordar = true) {
  const horasBase = Number(process.env.PANEL_SESSION_HORAS) || 12;
  const horasRecordar = Number(process.env.PANEL_SESSION_HORAS_RECORDAR) || 24 * 30; // 30 días
  const horas = recordar ? horasRecordar : horasBase;
  cookies().set(NOMBRE_COOKIE, crearTokenSesion(usuario, horas), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: horas * 3600,
  });
}

export function borrarCookieSesion() {
  cookies().set(NOMBRE_COOKIE, '', { path: '/', maxAge: 0 });
}

// Devuelve el usuario de la sesión actual (o null) leyendo la cookie.
export function getUsuario() {
  const token = cookies().get(NOMBRE_COOKIE)?.value;
  return verificarToken(token);
}

export const NOMBRE_COOKIE_SESION = NOMBRE_COOKIE;

// ===== Permisos por rol (mismas jerarquías que el bot) =====
// admin: ve y maneja todo. empleado: opera el día a día (ventas, pedidos, caja).
const MODULOS_POR_ROL = {
  admin: ['dashboard', 'pos', 'pedidos', 'productos', 'inventario', 'clientes', 'ventas', 'caja', 'empleados'],
  empleado: ['dashboard', 'pos', 'pedidos', 'inventario', 'clientes', 'caja'],
};

export function puedeVer(rol, modulo) {
  return (MODULOS_POR_ROL[rol] || []).includes(modulo);
}

export function modulosDe(rol) {
  return MODULOS_POR_ROL[rol] || [];
}
