// Formateo compartido (cliente y servidor).
export function formatearMonto(n) {
  const valor = Number(n) || 0;
  return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
}

export function formatearFecha(iso) {
  if (!iso) return '';
  // El bot guarda 'YYYY-MM-DD HH:MM:SS' en hora local; lo mostramos tal cual, recortado.
  return iso.replace('T', ' ').slice(0, 16);
}

export const ETIQUETA_MEDIO_PAGO = {
  efectivo: 'Efectivo',
  mercadopago: 'Mercado Pago',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

// Arma el texto del ticket para WhatsApp (texto plano con formato simple).
export function formatearTicketTexto(pedido) {
  const lineas = [];
  lineas.push('🧾 *Almacén Nefertiti*');
  lineas.push(`Ticket #${pedido.id} · ${formatearFecha(pedido.created_at)}`);
  lineas.push('————————————');
  for (const it of pedido.items || []) {
    lineas.push(`${it.cantidad} x ${it.nombre} — ${formatearMonto(it.subtotal)}`);
  }
  lineas.push('————————————');
  lineas.push(`*Total: ${formatearMonto(pedido.total)}*`);
  if (pedido.medio_pago) lineas.push(`Pago: ${ETIQUETA_MEDIO_PAGO[pedido.medio_pago] || pedido.medio_pago}`);
  lineas.push('');
  lineas.push('¡Gracias por tu compra! 🛍️');
  return lineas.join('\n');
}

export const ETIQUETA_ESTADO = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
};
