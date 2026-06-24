# Bot Nefertiti

Bot de WhatsApp para la gestión de caja de un almacén con taller técnico: apertura y cierre de caja con recordatorios automáticos, y resumen diario al admin. Ver `PROGRESO.md` para la bitácora completa de desarrollo (decisiones, bugs ya resueltos, diseño de cada fase).

## Requisitos

- Node.js 20 LTS o superior.
- En el VPS (Ubuntu): Chromium instalado vía `apt` (no se usa el Chromium que descarga Puppeteer automáticamente). PM2 instalado globalmente (`npm install -g pm2`).
- Un número de WhatsApp dedicado para el bot (se vincula como dispositivo, no reemplaza al WhatsApp del teléfono).

## Instalación

```bash
npm install
cp .env.example .env
```

Completar `.env`:
- `ADMIN_NUMBER`, `EMPLEADO_X_NUMBER`, `EMPLEADO_Y_NUMBER`: números reales en formato internacional sin `+` (ej. `5492944676761`). **Tienen que ser distintos entre sí** — si dos quedan iguales, el seed solo crea un empleado (la columna `telefono` es `UNIQUE`) y el turno del que falta no le va a llegar ningún mensaje.
- `CHROMIUM_PATH`: en el VPS, la ruta al Chromium instalado por `apt` (ej. `/usr/bin/chromium-browser`). En local dejarlo vacío.
- El resto de las variables (horarios, timeouts, nombres, cantidad de cajas) ya tienen valores por defecto razonables en `.env.example`.

Si cambiás los números de empleados después de haber arrancado el bot una vez, borrá `data/nefertiti.db` (o la fila vieja en la tabla `empleados`) y volvé a arrancar para que el seed cargue los nuevos.

## Arranque

**Local (desarrollo):**
```bash
npm start
```

**Producción (PM2):**
```bash
pm2 start ecosystem.config.js
pm2 logs bot-nefertiti
```

### Primer arranque / vincular el WhatsApp del bot

La primera vez que arranca (sin sesión guardada en `session/`), el bot imprime un código QR en la consola (o en `pm2 logs` si corre con PM2). Hay que escanearlo desde el WhatsApp del número del bot: **Dispositivos vinculados → Vincular un dispositivo**. Una vez vinculada, la sesión queda guardada en `session/` y los próximos arranques reconectan solos, sin pedir QR de nuevo (salvo que la sesión se invalide).

## Comandos de prueba (desde el WhatsApp del admin)

Sirven para probar cualquier flujo sin esperar la hora real del cron correspondiente:

| Comando | Qué hace |
|---|---|
| `ping` | Responde `pong 🏓` — chequeo rápido de que el bot está vivo. |
| `test apertura` | Dispara la apertura de caja de hoy ya mismo (a quien le toque según `turnos`). Si la caja ya estaba abierta hoy, avisa que no hizo nada. |
| `test cierre` | Dispara el cierre de caja de hoy ya mismo. Mismo bloqueo si ya estaba cerrado. |
| `test cierre insistir` | Ejecuta ahora la lógica de "todavía no cerraste" (la que normalmente corre a `HORA_CIERRE + CIERRE_INSISTIR_MIN`). |
| `test cierre avisar` | Ejecuta ahora el aviso al admin de cierre pendiente (la que normalmente corre a `HORA_CIERRE + CIERRE_AVISAR_ADMIN_MIN`). No avisa si quien cierra es el propio admin. |
| `test resumen` | Manda el resumen del día de hoy ya mismo, con los datos que haya hasta el momento. |
| `test backup` | Corre el backup de la base de datos ahora y confirma la ruta del archivo creado. |

## Guía de prueba manual paso a paso

Usando los comandos de arriba se puede simular cualquier escenario sin esperar el reloj real:

1. **Apertura normal:** `test apertura` → responder el monto de cada caja en orden → confirmación final.
2. **Empleado manda texto en vez de un número:** durante la apertura o el cierre, mandar algo como `hola` en vez de un monto → el bot rechaza y vuelve a preguntar la misma caja, sin perder lo ya guardado.
3. **Cierre sin foto de MP:** `test cierre` → mandar texto en vez de una foto → el bot rechaza y vuelve a pedir la foto.
4. **Foto de billetes opcional:** durante el cierre, en el paso de un monto, mandar una foto antes del número → el bot la guarda como pendiente y sigue esperando el monto; al llegar el monto válido, la foto queda asociada a esa caja.
5. **Reinicio a mitad de un flujo:** iniciar una apertura o cierre, responder una caja, reiniciar el proceso (`pm2 restart bot-nefertiti` o matar y volver a levantar en local) y mandar la siguiente respuesta — el flujo sigue donde estaba porque el estado vive en SQLite (`estados_conversacion`), no en memoria.
6. **Empleado no responde:** iniciar `test cierre` y no contestar nada → `test cierre insistir` y `test cierre avisar` simulan el paso del tiempo sin tener que esperar los minutos reales.
7. **Re-disparo del mismo día:** `test apertura` o `test cierre` dos veces el mismo día → la segunda vez avisa que ya estaba hecho, no duplica ni pisa el registro.

## Notas

- Solo el número de `ADMIN_NUMBER` recibe el resumen diario y los avisos de "no cerró".
- Las fotos (comprobante de MP y billetes contados) se guardan en `data/media/` y se reenvían al admin recién en el resumen diario, no en tiempo real.
- Los backups quedan en `backups/nefertiti_YYYYMMDD.db` (cron diario a las 3:00, zona `America/Argentina/Buenos_Aires`).
- `data/`, `logs/`, `session/`, `backups/` y `.env` están en `.gitignore` — no se versionan.
