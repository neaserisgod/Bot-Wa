// Cliente del puente HTTP del bot. Solo se usa para acciones que requieren
// enviar un WhatsApp (el panel no tiene la sesión de WhatsApp, el bot sí).
const BASE = process.env.BOT_BRIDGE_URL || 'http://127.0.0.1:3100';
const TOKEN = process.env.PANEL_BRIDGE_TOKEN || '';

async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        'x-panel-token': TOKEN,
        ...(opciones.headers || {}),
      },
      cache: 'no-store',
    });
  } catch {
    // El bot no está escuchando (apagado, sin sesión de WhatsApp, o sin el
    // puente habilitado). Devolvemos un error manejable en vez de explotar.
    return {
      status: 503,
      ok: false,
      error: 'El bot no está disponible. Verificá que esté corriendo y vinculado a WhatsApp.',
    };
  }
  const texto = await res.text();
  let cuerpo = {};
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    cuerpo = { ok: false, error: texto };
  }
  return { status: res.status, ...cuerpo };
}

// Marca el pedido como listo y pide al bot avisar al cliente por WhatsApp.
export function avisarPedidoListo(pedidoId) {
  return pedir(`/pedidos/${pedidoId}/avisar-listo`, { method: 'POST', body: '{}' });
}

// Envío genérico de un mensaje de WhatsApp.
export function notificar(telefono, mensaje) {
  return pedir('/notificar', {
    method: 'POST',
    body: JSON.stringify({ telefono, mensaje }),
  });
}

// Chequea si el bot está vivo (no requiere token).
export async function estadoBot() {
  try {
    const res = await fetch(`${BASE}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
