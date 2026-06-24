# Panel Nefertiti

Panel web de gestión y ventas (POS) para el almacén. Comparte la misma base
SQLite que el bot de WhatsApp (`../data/nefertiti.db`) y, para avisar a los
clientes, le pide al bot que envíe el WhatsApp a través de un puente HTTP local.

## Qué incluye

- **Login 2FA por WhatsApp**: el usuario entra con su celular y un código de 6
  dígitos que el bot le envía por WhatsApp. La sesión puede quedar recordada.
- **Roles**: las mismas jerarquías del bot. `admin` ve todo; `empleado` ve
  Punto de venta, Pedidos, Clientes y Caja.
- **Punto de venta (POS)**: arma el carrito y registra la venta.
- **Pedidos**: tablero en vivo de los pedidos que entran por el bot, con cambio
  de estado y botón **"Listo + avisar"** que dispara el WhatsApp al cliente.
- **Productos** (admin): alta/baja/edición del catálogo y palabras clave.
- **Clientes**, **Ventas/Reportes** (admin) y **Caja** (resumen del día).
- **Empleados** (admin): alta y gestión de usuarios y roles.

## Requisitos

- Node.js 20+ (el bot ya usa Node 20+).
- El bot corriendo con el puente habilitado (ver más abajo).

## Configuración

1. Copiá `.env.example` a `.env` y completá:
   - `PANEL_SESSION_SECRET`: clave larga y aleatoria para firmar la sesión.
   - `PANEL_BRIDGE_TOKEN`: **el mismo** token que pongas en el `.env` del bot.
   - `PANEL_DB_PATH`: ruta a la base del bot (por defecto `../data/nefertiti.db`).

2. En el `.env` **del bot** agregá (ver `../.env.example`):
   ```
   PANEL_BRIDGE_TOKEN=<el mismo token que en el panel>
   PANEL_BRIDGE_PORT=3100
   PANEL_BRIDGE_HOST=127.0.0.1
   ```
   Sin `PANEL_BRIDGE_TOKEN`, el bot no levanta el puente y el panel no puede
   avisar a los clientes (el resto del panel funciona igual).

## Correr

```bash
npm install
npm run dev      # desarrollo en http://localhost:3000
# o en producción:
npm run build && npm start
```

El bot debe estar corriendo y vinculado a WhatsApp para poder enviar los
códigos de login y los avisos de "pedido listo".

## Cómo entra el primer admin

El bot siembra al admin desde `ADMIN_NUMBER`. Ese número ya existe como
empleado con rol `admin`, así que puede entrar al panel directamente: pone su
celular, recibe el código por WhatsApp y entra. Desde **Empleados** puede dar
de alta al resto.

## Producción en el VPS (resumen)

- Panel y bot en la misma máquina; el puente escucha en `127.0.0.1:3100`, así
  que no queda expuesto a internet.
- Para servir el panel hacia afuera, poné un reverse proxy (nginx) con HTTPS
  delante de `http://127.0.0.1:3000`.
- Podés administrarlo con PM2 igual que el bot:
  `pm2 start npm --name panel-nefertiti -- start`.
