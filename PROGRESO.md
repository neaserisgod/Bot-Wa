# Bot Nefertiti — Estado del proyecto

> Este archivo es para retomar el trabajo en otra sesión sin perder contexto. No es el README de producción (ese se escribe en la Fase E) — es la bitácora de avance.

---

## 1. Qué es el proyecto

Bot de WhatsApp para un almacén con taller técnico. Automatiza:
- Apertura de caja (recordatorio automático a las 10:00, registro de efectivo por caja).
- Recordatorio de cierre 5 min antes del cierre del local.
- Cierre de caja con foto de Mercado Pago + montos contados por caja.
- Resumen diario al admin con apertura/cierre/diferencia de cada caja.
- Reenvío de fotos (MP y billetes) al admin.

## 2. Restricciones duras (no negociables)

- Sin APIs pagas, sin IA externa, sin servicios cloud. Todo open source.
- Stack fijo: **Node.js 20 LTS · whatsapp-web.js · better-sqlite3 · node-cron · winston · dotenv · qrcode-terminal · PM2** (en producción).
- DB: SQLite con `better-sqlite3` (síncrono), un solo archivo `.db`.
- **El estado de la máquina de conversación se persiste en SQLite**, no en memoria — si PM2 reinicia el proceso a mitad de un cierre de caja, el flujo se reanuda donde estaba.
- Parser de montos propio (sin librerías de NLP/IA).
- Corre en VPS Ubuntu (Hostinger KVM2) con Chromium headless. En local, Puppeteer usa su propio Chromium; en el VPS se configura `CHROMIUM_PATH` por `.env`.
- Código y mensajes en español (Argentina). Comentarios en español.
- Solo el número admin recibe resumen diario y alertas de "no cerró".

## 3. Negocio: turnos y horarios

| Día | Abre (10:00) | Cierra |
|---|---|---|
| Lunes | Admin | Empleado X |
| Martes | Admin | Empleado X |
| Miércoles | Admin | Empleado X |
| Jueves | Empleado Y | Admin |
| Viernes | Empleado Y | Admin |
| Sábado | Empleado Y | Empleado X |
| Domingo | Empleado Y | Empleado X |

- Cierre del local: 22:00 (lun-vie), 23:00 (sáb-dom). Recordatorio 5 min antes.
- Todo configurable por `.env` (horas, minutos de aviso, timeouts).
- Dos cajas físicas (efectivo) + un Mercado Pago compartido para todo el local (no por caja).

## 4. Plan de fases original (pausa y confirmación del usuario entre cada una)

- **Fase A — Esqueleto:** package.json, estructura de carpetas, `.env.example`, `.gitignore`, logger, conexión DB, migrations, seed. ✅ **COMPLETA**
- **Fase B — Conexión WhatsApp:** client.js + qr.js + router básico ping/pong para admin/empleados. ✅ **COMPLETA**
- **Fase C — Apertura de caja:** cron de apertura + flujo + persistencia de estado + confirmación. ✅ **COMPLETA** (probada de punta a punta con WhatsApp real)
- **Fase D — Cierre de caja:** recordatorio + recepción ordenada (foto MP, montos) + guardado + manejo de "no responde". ✅ **COMPLETA** (probada de punta a punta con WhatsApp real, incluida la foto de billetes opcional por simulación)
- **Fase E — Resumen al admin + backup + PM2 + README + guía de pruebas.** ✅ **COMPLETA** (probada de punta a punta con WhatsApp real)

**Las 5 fases del plan original están completas.** Pendiente transversal antes de producción: completar `EMPLEADO_X_NUMBER`/`EMPLEADO_Y_NUMBER` reales en `.env` (siguen placeholders, ver sección 6) y desplegar en el VPS siguiendo el `README.md`.

---

## 5. Estado actual del código (Fases A y B)

### Estructura creada hasta ahora

```
bot-nefertiti/
├── .env                       # YA TIENE ADMIN_NUMBER real (ver sección 6)
├── .env.example
├── .gitignore
├── package.json                # better-sqlite3 ^12.11.1, whatsapp-web.js ^1.26.0 (instaló 1.34.7)
├── src/
│   ├── bot/
│   │   ├── index.js            # valida .env, conecta DB, migrations, seed, crea cliente WA, registra QR y router, initialize()
│   │   ├── client.js            # Client de whatsapp-web.js + LocalAuth + rate limit de envíos + fix de User-Agent
│   │   └── qr.js                 # eventos de QR/sesión (qr, authenticated, auth_failure, disconnected, ready)
│   ├── handlers/
│   │   ├── messageHandler.js    # router: ignora grupos, resuelve contacto real (ver gotcha LID), admin -> adminHandler, empleado activo -> employeeHandler
│   │   ├── adminHandler.js      # MVP: responde "pong" a "ping". Fase E le agrega comandos
│   │   └── employeeHandler.js   # MVP: responde "pong" a "ping". Fases C/D le agregan los flujos de caja
│   ├── flows/                   # carpeta creada, VACÍA — acá va flows/caja.js en la Fase C
│   ├── db/
│   │   ├── index.js             # conexión better-sqlite3 (WAL, foreign_keys ON)
│   │   ├── migrations.js        # las 6 tablas, CREATE TABLE IF NOT EXISTS
│   │   ├── seed.js              # carga 3 empleados desde .env + 14 turnos (7 días × 2 franjas), idempotente
│   │   └── queries/
│   │       ├── empleados.js
│   │       ├── turnos.js
│   │       ├── caja.js          # aperturas_caja, cierres_caja, cierres_mp (CRUD completo, listo para usarse en Fase C/D)
│   │       └── estados.js       # getEstado/setEstado/clearEstado/listarEstadosVencidos — persistencia de la máquina de estados
│   ├── cron/                    # carpeta creada, VACÍA — acá va cron/tareas.js en la Fase C
│   └── utils/
│       ├── logger.js            # winston + winston-daily-rotate-file, consola + logs/nefertiti-YYYY-MM-DD.log
│       └── validadores.js       # parsearMonto() / formatearMonto() — parser propio probado con $5.000, 5,000, 5000.50, etc.
├── data/, logs/, session/, backups/   # gitignored
```

`src/db/queries/caja.js` y `estados.js` ya están completos y probados (no son stubs) aunque todavía no los usa ningún flujo — quedan listos para que `flows/caja.js` los consuma en la Fase C.

### Esquema de DB ya migrado (`migrations.js`)
Las 6 tablas exactas del plan original: `empleados`, `turnos`, `aperturas_caja`, `cierres_caja`, `cierres_mp`, `estados_conversacion`. Sin cambios respecto al diseño original.

### Variables de entorno — estado real ahora mismo

`.env` ya tiene:
```
ADMIN_NUMBER=5492944676761          # número REAL del admin, confirmado funcionando
EMPLEADO_X_NUMBER=549XXXXXXXXXX     # TODAVÍA placeholder
EMPLEADO_Y_NUMBER=549XXXXXXXXXX     # TODAVÍA placeholder (igual al de Empleado X)
```

Como los dos placeholders de empleados son idénticos, el seed solo creó **2 empleados** (Admin real + uno de los dos Empleado X/Y, porque `telefono` es `UNIQUE`). **Antes de la Fase C hay que completar los números reales de Empleado X e Y y volver a correr el seed** (o borrar `data/nefertiti.db` y dejar que se regenere solo).

### Bugs reales encontrados y resueltos en la Fase B (importante para no repetirlos)

1. **Instalación de Chrome para Puppeteer corrupta**: la extracción automática del `.zip` de Chrome quedaba a medias (solo 3 archivos en vez de ~300, sin `chrome.exe`). Se resolvió extrayendo el zip manualmente con `Expand-Archive` de PowerShell y copiando el resultado a la carpeta esperada por `@puppeteer/browsers`. Si esto vuelve a pasar en el VPS (no debería, ahí se usa `CHROMIUM_PATH` con el Chromium del sistema vía `apt`), revisar lo mismo.
2. **WhatsApp rechazaba el vínculo del QR ("Couldn't link device. Try again later")**: causa real, **no** tiene que ver con cuenta Business. `whatsapp-web.js` manda por defecto un User-Agent fijo y desactualizado (`Chrome/101...` de 2022) que comparten miles de bots — WhatsApp lo detecta como tráfico automatizado. Se solucionó en `client.js` pasando un `userAgent` de Chrome actual en Windows y `ignoreDefaultArgs: ['--enable-automation']`. Se confirmó la causa real haciendo una prueba de control: vincular el mismo número desde `web.whatsapp.com` oficial (sin Puppeteer) funcionó bien al instante, lo que aisló el problema al navegador automatizado y no a la cuenta.
3. **El bot no respondía al "ping"**: la cuenta de WhatsApp del admin usa el sistema nuevo de **LID** (identificador interno que WhatsApp usa en vez del número de teléfono en ciertos chats). `msg.from` llegaba como `145178652360784@lid` en vez de `5492944676761@c.us`, así que comparar por string fallaba. Se resolvió usando `msg.getContact()` y leyendo `contacto.id._serialized` (que sí trae el JID con el número real), **no** `contacto.number` (ese campo devuelve el LID crudo cuando el contacto se resolvió vía LID, no el teléfono — al revés de lo que documenta la librería). Esta resolución de contacto quedó como la forma permanente de identificar remitentes en `messageHandler.js`, porque cualquier número puede estar en este esquema nuevo de WhatsApp.
4. **Procesos en segundo plano se morían solos**: lanzar el bot con `comando &` desde el sandbox de Bash hacía que el proceso muriera apenas terminaba esa llamada puntual a la herramienta (el árbol de procesos se limpiaba). La forma que sí sobrevive entre llamadas es `Start-Process` de PowerShell (proceso desacoplado de verdad, con `-RedirectStandardOutput`/`-RedirectStandardError` a archivos de log y guardando el PID en `bot.pid`). Si hay que reiniciar el bot manualmente en esta máquina de desarrollo, usar ese método, **no** `node src/bot/index.js &`.
5. **Lockfile de Chrome viejo**: al matar el proceso de Chrome de forma forzada (no graceful), queda un `lockfile`/`SingletonLock` en `session/session/` que bloquea el siguiente arranque con "The browser is already running for...". Antes de reiniciar el bot hay que: matar cualquier `chrome.exe`/`node.exe` residual con command line que contenga `bot-nefertiti`, y borrar `session/session/lockfile` y `session/session/Singleton*`.

### Cómo está corriendo el bot ahora mismo

Al cierre de esta sesión el bot está vinculado (sesión persistida en `session/session/`) y probado de punta a punta con ping/pong real desde el número admin. Si en la próxima sesión el proceso ya no está corriendo, para levantarlo de nuevo (PowerShell):

```powershell
cd C:\Users\Bruno\bot-nefertiti
$p = Start-Process -FilePath "node" -ArgumentList "src/bot/index.js" -WorkingDirectory "C:\Users\Bruno\bot-nefertiti" -RedirectStandardOutput "qr_output.log" -RedirectStandardError "qr_output_err.log" -WindowStyle Hidden -PassThru
$p.Id | Out-File -Encoding utf8 "C:\Users\Bruno\bot-nefertiti\bot.pid"
```

Como la sesión ya está vinculada, debería reconectar solo sin pedir QR de nuevo (confirmado: reconectó 3 veces sin escaneo durante esta sesión). Si pide QR de nuevo es porque la sesión se invalidó (hay que volver a vincular).

---

## 6. Fase C (apertura de caja) — IMPLEMENTADA

### Qué se construyó en esta sesión

Archivos nuevos:
- **`src/utils/fechas.js`** — `fechaHoy()` (YYYY-MM-DD) y `diaSemanaHoy()` (0=dom..6=sáb), ambos en timezone `America/Argentina/Buenos_Aires`. Probado: hoy lunes devuelve fecha correcta y día 1.
- **`src/flows/caja.js`** — máquina de estados de apertura. `iniciarApertura()` (manda el saludo y setea estado, salta si la Caja 1 ya tiene apertura hoy) y `continuarApertura()` (parsea monto con `parsearMonto`, rechaza texto inválido y re-pregunta, guarda con `registrarApertura` de forma idempotente, avanza caja por caja hasta `CANTIDAD_CAJAS`, confirma y limpia el estado). El progreso se persiste con `setEstado` → sobrevive reinicios.
- **`src/cron/tareas.js`** — `iniciarCronJobs(client)` programa la apertura a `HORA_APERTURA:00` (timezone AR). `dispararApertura(client)` es el núcleo reutilizable: consulta `turnos` (día actual, franja apertura), mapea la persona al teléfono de `.env`, busca el empleado, resuelve el destino y arranca el flujo.

Archivos modificados:
- **`src/bot/client.js`** — nueva `resolverDestino(client, telefono)` que usa `getNumberId` para obtener el JID real (robustez ante el esquema LID que nos pegó en Fase B). Fallback a `numero@c.us`.
- **`src/handlers/messageHandler.js`** — ahora chequea `estados_conversacion` ANTES de rutear por rol; si hay un flujo de apertura en curso para ese número, lo continúa (`continuarFlujoActivo`). Dejé marcado el punto donde engancha el flujo de cierre en Fase D.
- **`src/bot/index.js`** — arranca los cron jobs en el evento `ready` del cliente (para no enviar antes de tener sesión).
- **`src/handlers/adminHandler.js`** — comando de prueba **`test apertura`**: el admin lo manda y dispara la apertura de hoy al instante, sin esperar las 10 AM.

Todos los archivos pasan `node --check`. No se pudo correr el bot completo en el entorno de desarrollo asistido (binario nativo de better-sqlite3 es de Windows) → **la prueba de punta a punta con WhatsApp la tiene que hacer Bruno en su PC.**

**Verificación adicional (revisión posterior):** se simuló todo `dispararApertura` → `iniciarApertura` → `continuarApertura` con una DB SQLite temporal y un cliente de WhatsApp falso (sin red real), con 3 empleados de prueba con teléfonos distintos. Resultado: mensaje de saludo correcto, rechazo de texto inválido sin perder el progreso, registro idempotente de cada caja, mensaje de confirmación final byte a byte igual a la plantilla, y el segundo disparo del mismo día no reabre. La lógica de negocio funciona como está escrita; lo único no cubierto por esta simulación es la capa real de whatsapp-web.js (envío/recepción reales, resolución de JID vía `getNumberId` contra el servidor de WhatsApp).

### Cómo probar la Fase C (en la PC de Bruno)

1. Levantar el bot (método PowerShell de la sección 5). Como hoy es lun-mié, **abre el Admin**, así que se puede probar todo solo con el número admin.
2. Desde el WhatsApp del admin, mandar `test apertura`.
3. El bot debe responder: `🏪 ¡Buenos días Admin! ¿Con cuánto efectivo abre la Caja 1?`
4. Responder un monto (ej. `5000`). Debe preguntar la Caja 2.
5. Responder otro monto (ej. `3.000`). Debe confirmar con el detalle de ambas cajas.
6. **Casos de borde a verificar:** mandar texto en vez de número (ej. `hola`) → debe rechazar y re-preguntar la misma caja; reiniciar el bot a mitad del flujo y seguir respondiendo → debe reanudar (estado en SQLite); mandar `test apertura` de nuevo con la caja ya abierta → no debe reabrir.

### Pendiente antes de producción / turno de empleados
Completar `EMPLEADO_X_NUMBER` y `EMPLEADO_Y_NUMBER` reales en `.env` (siguen placeholders), borrar `data/nefertiti.db` y dejar que el seed cree los 3 empleados, para poder probar la apertura de Empleado Y (jue-dom).

---

## 6-bis. Notas originales de Fase C (referencia)

Pendiente, en orden:

1. **Completar `.env`** con los números reales de `EMPLEADO_X_NUMBER` y `EMPLEADO_Y_NUMBER` (hoy son placeholders idénticos). Borrar `data/nefertiti.db` y dejar que el próximo arranque siembre los 3 empleados reales.
2. **`src/flows/caja.js`** — máquina de estados de apertura:
   - Generalizar para `CANTIDAD_CAJAS` (no hardcodear 2).
   - Usa `estados.setEstado/getEstado/clearEstado` (ya implementado y probado) para persistir el progreso entre reinicios.
   - Usa `validadores.parsearMonto` (ya implementado y probado) para validar la respuesta de texto.
   - Usa `caja.registrarApertura` (ya implementado) para guardar cada caja.
3. **`src/cron/tareas.js`** — primer cron job: a `HORA_APERTURA:00`, consultar `turnos` (franja `apertura`, día actual) para saber a quién preguntar, mapear la `persona` (`admin`/`empleado_x`/`empleado_y`) al teléfono real vía `.env`, mandar el mensaje inicial y setear el estado `apertura_caja / esperando_monto_caja1`.
   - Usar timezone `America/Argentina/Buenos_Aires` en `node-cron`.
   - El cron debe consultar `turnos` en runtime, no asumir nombres fijos.
4. **Enganchar el chequeo de estado en `messageHandler.js`**: hoy el router rutea directo por rol (admin/empleado) sin mirar `estados_conversacion`. Hay un comentario marcando dónde va este chequeo (línea ~18 de `messageHandler.js`): si el teléfono tiene un estado activo, hay que continuar ese flujo en `flows/caja.js` **antes** de rutear por rol normal.
5. Mensajes de apertura/confirmación según las plantillas exactas del plan original (ver sección de "Lógica funcional del MVP" más abajo, punto 3).
6. Modo de prueba: agregar alguna forma de disparar el cron de apertura manualmente sin esperar la hora real (lo pidió el usuario para poder testear sin esperar; documentarlo en el README cuando se escriba en la Fase E, pero el mecanismo en sí hay que construirlo en C/D).

### Plantilla de mensajes de apertura (del plan original, para no tener que pedirla de nuevo)

Mensaje inicial (cron, a quien abre):
```
🏪 ¡Buenos días {nombre}!
¿Con cuánto efectivo abre la Caja 1?
```
Tras cada monto válido, pregunta la siguiente caja; al completar todas:
```
✅ Apertura registrada:
  Caja 1: $5.000
  Caja 2: $3.000
¡Buen día de trabajo!
```

---

## 7. Fase D (cierre de caja) — IMPLEMENTADA

### Qué se construyó

Archivos nuevos:
- **`src/utils/media.js`** — `guardarFotoMensaje(msg, prefijo)`: valida que el mensaje traiga una imagen (`msg.hasMedia && msg.type === 'image'`), la descarga con `msg.downloadMedia()` y la guarda en `data/media/{timestamp}_{prefijo}.{ext}`. Devuelve `null` si no es una imagen válida.
- **`src/flows/cierre.js`** — máquina de estados de cierre, mismo patrón que `flows/caja.js`. Pasos: `esperando_foto_mp` (solo acepta imagen, registra `cierres_mp`) → `esperando_monto` por cada caja (acepta una foto opcional de billetes que queda pendiente en `data.fotoPendiente` hasta que llega el monto válido de esa caja; `registrarCierre` guarda el monto + la foto si había una pendiente). Bloquea reabrir el flujo si `cierres_mp.buscarCierreMpDelDia` ya tiene fila hoy (mismo criterio que `iniciarApertura` con la Caja 1).

Archivos modificados:
- **`src/utils/fechas.js`** — `sumarMinutosAHora(horaBase, minutosOffset)`: normaliza a 24hs, usado para calcular recordatorio/insistencia/aviso a partir de `HORA_CIERRE_*` sin hardcodear.
- **`src/cron/tareas.js`** — se extrajo `resolverPersonaDeHoy(franja)` (turno de hoy → teléfono vía `.env` → empleado activo), reusada por `dispararApertura` y las funciones nuevas: `dispararCierre`, `insistirCierre`, `avisarAdminCierre` (este último se salta a sí mismo si quien cierra es el admin) y `limpiarEstadosVencidos` (cron cada 10 min con `estados.listarEstadosVencidos(ESTADO_TIMEOUT_MIN)`). Los crons de cierre se registran dos veces cada uno (lun-vie con `HORA_CIERRE_SEMANA`, sáb-dom con `HORA_CIERRE_FINDE`) vía el helper `programarTareaDeCierre`.
- **`src/handlers/messageHandler.js`** — `continuarFlujoActivo` ahora también reconoce `cierreFlow.FLUJO` y continúa ese flujo.
- **`src/handlers/adminHandler.js`** — comandos de prueba nuevos: `test cierre` (dispara el cierre de hoy ya), `test cierre insistir` y `test cierre avisar` (ejecutan esa lógica sin esperar los minutos reales).

Con `test apertura` + `test cierre`, el admin puede abrir y cerrar caja a gusto — bloqueado si esa caja ya está abierta/cerrada hoy (no hay overwrite, confirmado con el usuario).

### Cómo se probó
- Simulación completa (DB temporal + cliente de WhatsApp falso) cubriendo: foto de MP inválida/válida, foto de billetes opcional sin perder el progreso ante un monto inválido, confirmación final, bloqueo de re-cierre, y disparo de `insistirCierre`/`avisarAdminCierre` tanto con el cierre completo (no deben mandar nada) como con el cierre a mitad de camino (deben avisar).
- Prueba real con WhatsApp: se puso temporalmente el número del admin en `EMPLEADO_X_NUMBER` (hoy lunes cierra Empleado X) para poder ver los mensajes en el propio teléfono, se corrió `test cierre` de punta a punta con una foto real, se confirmó en la DB (`cierres_mp`, `cierres_caja`, `estados_conversacion` vacía al final) y en `data/media/`, y después se devolvió el placeholder y se reinició el bot. La foto de billetes opcional con WhatsApp real no se probó (solo por simulación), no es necesario repetirla salvo que se quiera ver en persona.

### Pendiente / notas
- Sigue pendiente completar `EMPLEADO_X_NUMBER` y `EMPLEADO_Y_NUMBER` reales en `.env` (ver sección 6) para probar la apertura/cierre de Empleado Y de forma definitiva.
- Los crons de recordatorio/insistencia/aviso son dependientes del reloj real; no se probaron esperando la hora real, solo vía los comandos manuales `test cierre insistir`/`test cierre avisar` y la simulación.

---

## 7-bis. Notas originales de Fase D (referencia, ya implementadas arriba)
- Recordatorio 5 min antes del cierre (cron, a quien cierra hoy según `turnos`).
- Orden estricto: foto MP → monto Caja 1 → monto Caja 2 → ... → monto Caja N.
- Fotos a `data/media/`, ruta guardada en `cierres_mp.foto_mp` / `cierres_caja.foto_billetes` (foto de billetes opcional, no bloquea el cierre).
- Manejo de "no responde": a `cierre + CIERRE_INSISTIR_MIN` insistir a quien cierra; a `cierre + CIERRE_AVISAR_ADMIN_MIN` avisar al admin (**excepto si quien cierra ES el admin** — no avisarse a sí mismo).
- Cron de limpieza de estados vencidos (`ESTADO_TIMEOUT_MIN`), usando `estados.listarEstadosVencidos` (ya implementado).

---

## 8. Fase E (resumen diario + producción) — IMPLEMENTADA

El texto exacto del resumen diario del plan original no estaba disponible en esta sesión (la nota previa decía que estaba "en el historial de la conversación original", inaccesible ahora), así que se diseñó de cero, consistente con el estilo de los mensajes de apertura/cierre. El usuario confirmó dos decisiones de diseño antes de implementar: el resumen se manda a una hora fija después del cierre real (no apenas se completa el cierre), y las fotos de MP/billetes no se reenvían en tiempo real — se adjuntan todas juntas al resumen.

### Qué se construyó

Archivos nuevos:
- **`src/flows/resumen.js`** — `enviarResumenDiario(client, fecha)`: junta aperturas/cierres/cierre de MP de esa fecha, manda un texto con apertura/cierre/diferencia por caja (`formatearMonto`) + estado de la foto de MP, y después reenvía cada foto disponible (`MessageMedia.fromFilePath`) con un caption (`Foto MP`, `Foto billetes Caja N`). Si no hay ningún registro ese día, manda un mensaje corto en vez del resumen vacío. Siempre al admin, sin importar quién abrió/cerró.
- **`src/cron/backup.js`** — `backupAhora()`: fuerza `wal_checkpoint(TRUNCATE)` (la DB corre en modo WAL, sin esto el backup podía perder las escrituras más recientes) y copia `nefertiti.db` a `backups/nefertiti_YYYYMMDD.db`. `iniciarBackupCron()` lo programa todos los días a las 3:00.
- **`ecosystem.config.js`** — config de PM2 (`max_memory_restart: '500M'`, `restart_delay: 5000`, logs a `./logs/pm2-*.log`).
- **`README.md`** — instalación, `.env`, arranque local/PM2, primer QR, tabla completa de comandos `test *`, y guía de prueba manual paso a paso reusando esos comandos.

Archivos modificados:
- **`src/utils/fechas.js`** — `sumarMinutosAHora` ahora devuelve también `diasOffset` (puede cruzar la medianoche); nueva `fechaConOffsetDias(offsetDias)` (`fechaHoy()` es el caso `offsetDias=0`).
- **`src/cron/tareas.js`** — los días de cron de las tareas de cierre ya no son literales fijos (`'1-5'`/`'0,6'`): se calculan con `diasConOffset(dias, diasOffset)` a partir de arrays `DIAS_SEMANA`/`DIAS_FINDE`, para poder correr el cron de resumen del finde en el día calendario correcto cuando el offset cruza la medianoche. Nueva `enviarResumenDiario(client, diasOffset)` (wrapper de cron que resuelve la fecha correcta con `fechaConOffsetDias(-diasOffset)`) registrada con `RESUMEN_OFFSET_MIN`.
- **`src/handlers/adminHandler.js`** — comandos `test resumen` y `test backup`.
- **`src/bot/index.js`** — `RESUMEN_OFFSET_MIN` agregada a las variables obligatorias; `iniciarBackupCron()` arranca junto a `iniciarCronJobs()` en el evento `ready`.
- **`.env` / `.env.example`** — `RESUMEN_OFFSET_MIN=90` (minutos después de `HORA_CIERRE_*`; con los valores actuales da 23:30 lun-vie y 00:30 sáb-dom, confirmado por cálculo).

### Cómo se probó
- Simulación: `enviarResumenDiario` con DB temporal cubriendo sin-datos / solo-apertura / apertura+cierre+MP+foto-de-billetes-en-una-sola-caja (la otra caja sin foto, para confirmar que no se manda una foto que no existe). `backupAhora()` contra una DB de prueba, confirmando que la copia tiene las filas (abriendo la copia con `better-sqlite3` en modo lectura). Cálculo de `sumarMinutosAHora(23, 90)` confirmado a mano: `{hora:0, minuto:30, diasOffset:1}`, y que el cron de fin de semana queda en días `0,1` (domingo/lunes), no `0,6`.
- Prueba real con WhatsApp: `test resumen` (con los datos reales de apertura/cierre ya cargados ese día) y `test backup`, ambos confirmados en los logs, en el mensaje recibido y abriendo el archivo de backup real (`aperturas_caja`, `cierres_caja`, `cierres_mp` con las filas esperadas).
- No se probó el cruce de medianoche con el reloj real (solo por cálculo) ni el cron de backup a las 3:00 real — quedan para cuando el bot lleve un fin de semana corriendo en producción.

---

## 8-bis. Fase 4 (clientes y pedidos) — v1 mínima IMPLEMENTADA Y PROBADA

Primera versión del flujo de clientes. Decisiones confirmadas con el usuario antes de construir: **catálogo arranca vacío** (se carga después por CSV), **sin lógica de seña de fiambres** (queda para v2), y **servicio técnico responde "no disponible"** (es Fase 6). El parser de pedidos es propio, sin IA, deliberadamente simple.

### Qué se construyó

Tablas nuevas (en `migrations.js`, idempotentes): `clientes`, `productos` (con `palabras_clave` csv para el matching), `pedidos` (estado: pendiente→confirmado→en_preparacion→listo→retirado→cancelado), `pedido_items` (guarda nombre y precio_unitario como "foto" del momento).

Archivos nuevos:
- **`src/db/queries/clientes.js`**, **`productos.js`**, **`pedidos.js`** — CRUD. `pedidos.crearConItems` usa transacción (pedido + items atómico). `pedidos.listarActivos` hace join con clientes.
- **`src/utils/parserPedido.js`** — `parsearPedido(texto, productos)`: normaliza (saca acentos), tokeniza, matchea cada producto por sus palabras_clave (tolera plurales simples: coca→cocas, pan→panes), y detecta la cantidad caminando hacia atrás desde el producto saltando palabras de relleno/unidad ("1,5 kg de jamón" → 1.5x; "medio kilo" → 0.5x). `formatearResumen` arma el texto con total. Probado en aislado con varios casos.
- **`src/flows/pedido.js`** — máquina de estados del cliente (mismo patrón persistido). Pasos: `esperando_nombre` (si el perfil de WhatsApp no tiene letras), `menu` (1 pedido / 2 técnico), `esperando_items` (parsea), `esperando_confirmacion` (Sí→crea pedido confirmado + notifica admin; No→vuelve a pedir). 
- **`src/handlers/clienteHandler.js`** — entrada de números no registrados (primer contacto sin estado). Registra al cliente tomando el nombre del perfil o preguntándolo, y muestra el menú.
- **`src/handlers/pedidoComandos.js`** — comandos del personal (admin y empleados): `pedidos` (lista activos), `listo <id>` (marca listo + avisa al cliente), `retirado <id>`.
- **`scripts/importar-productos.js`** — carga el catálogo desde un CSV separado por `;` (formato de Excel AR): `nombre;precio;palabras_clave`. Uso: `node scripts/importar-productos.js [ruta]` (default `data/productos.csv`).

Archivos modificados:
- **`messageHandler.js`** — `continuarFlujoActivo` ahora también reconoce `pedidoFlow.FLUJO`; los números no registrados ya **no se ignoran**: van a `clienteHandler` (antes era "fuera de alcance del MVP").
- **`employeeHandler.js`** / **`adminHandler.js`** — enganchan `pedidoComandos.manejarComando`.

### Cómo probarlo (en la PC de Bruno)
1. Reiniciar el bot (las migraciones crean las 4 tablas nuevas solas).
2. Cargar catálogo: crear `data/productos.csv` (ej. `Coca Cola 1.5L;1200;coca,cocacola` por línea) y correr `node scripts/importar-productos.js`. **Sin esto el flujo de pedidos siempre responde "no tengo catálogo / no reconocí productos".**
3. Desde un número **distinto** al del admin/empleados (un cliente real), escribir algo → debe registrar y mostrar menú → `1` → escribir "2 cocas y un pan" → confirma resumen con total → `si` → llega aviso al admin.
4. Desde el admin/empleado: `pedidos` para ver la lista, `listo 1` para avisar al cliente.

### Probado de punta a punta con WhatsApp real (revisión posterior)
Se cargó un catálogo de prueba (`data/productos.csv`: Coca Cola, Pan, Jamón cocido, Queso) con `scripts/importar-productos.js` y se probó con una clienta real (número distinto al admin). Funcionó: registro automático tomando el nombre del perfil, menú, `"Dos cocas jajajs"` parseado correctamente a 2x Coca Cola pese a la mayúscula y el ruido, confirmación, pedido guardado completo en la DB, aviso al admin. `pedidos`/`listo <id>`/`retirado <id>` también confirmados.

**Bug real encontrado y corregido:** después de confirmar el pedido, la clienta siguió escribiendo cosas casuales ("Gracias", "jajajaja", "Es buenísima"). Como `iniciarConversacion` le mostraba el menú de nuevo a *cualquier* mensaje de un cliente conocido sin flujo activo, esas respuestas casuales quedaban atrapadas por `procesarMenu` (que no matchea "1" ni "2") y el bot le insistía con "Respondé *1* o *2*" — compitiendo con la charla normal. Se corrigió en `src/flows/pedido.js`: ahora un cliente conocido sin flujo activo solo recibe el menú de nuevo si su mensaje parece un saludo o pedido explícito (`pareceSaludoOPedido`: contiene "hola", "buenas", "pedido", "menu", "ayuda", etc.); si no, el bot no responde nada, igual que ya hacían `adminHandler`/`employeeHandler` con texto no reconocido. El primer contacto de un cliente nuevo no cambia — sigue respondiendo siempre, sin este filtro.

**Ajuste pedido por el usuario:** un agradecimiento ("gracias", "thank") sí recibe respuesta — `pareceAgradecimiento` detecta esas palabras y el bot contesta `¡De nada! 🙂` sin volver a mostrar el menú. Se chequea antes que `pareceSaludoOPedido`, así que "gracias" nunca cae en el menú. El resto de la charla casual (sin esas palabras) sigue sin respuesta.

**Limpieza de cierre de sesión:** se vaciaron `clientes`, `productos`, `pedidos`, `pedido_items` y el estado de conversación colgado de la prueba (catálogo de prueba de 4 productos, clienta real "Celia Cadagan", pedido #1) — la DB real queda como recién migrada, sin datos de prueba. **El catálogo de productos está vacío de nuevo: hay que crear `data/productos.csv` y correr `node scripts/importar-productos.js` antes de que un cliente real pueda pedir algo.**

### Pendiente / notas
- Riesgo conocido: la Fase 4 expone el número al público → más volumen, más chance de que WhatsApp lo marque. El rate-limit de `client.js` (1s entre envíos) ya está, pero conviene vigilarlo.
- La notificación de pedido nuevo hoy va **al admin** (simple y confiable). Si se quiere que vaya al "empleado de turno" según la hora, es un ajuste futuro.
- `scripts/importar-productos.js` no es idempotente — correrlo dos veces duplica los productos. No es un problema para una carga inicial, pero hay que tenerlo en cuenta si se vuelve a correr.
- Para v2: seña de fiambres con timer de 15 min, edición del catálogo por WhatsApp desde el admin, y enganche con stock (cada pedido confirmado podría descontar inventario).

---

## 8-ter. Comportamiento del admin (menú + atajos + mensajes compuestos + avisos) — IMPLEMENTADO

Implementa al pie de la letra `COMPORTAMIENTO-ADMIN.md`: menú numérico, atajos por palabra clave, mensajes compuestos con corte de cadena, "Estado del día", y los 4 avisos automáticos nuevos. Sin IA — todo por palabras clave, reusando el enfoque de `parserPedido.js`.

### Archivos nuevos

- **`src/utils/parserAdmin.js`** — `parsearAcciones(texto)`: separa el mensaje en fragmentos (coma, salto de línea, "y" suelta) y detecta como mucho una acción por fragmento (`estado`, `pedidos`, `marcar` {listo/retirado, id}, `abrir`, `cerrar`, `resumen` {fecha opcional}, `backup`, `menu`), en el orden en que aparecen. Reusa `normalizar` de `parserPedido.js` (minúsculas, sin acentos). Si no detecta ninguna acción (cortesía sola — "hola", "gracias" — o texto no reconocido), devuelve `[{tipo:'menu'}]`.
- **`src/flows/estadoDia.js`** — `formatearEstadoDia()`: snapshot de hoy sin reenviar fotos (apertura/cierre/diferencia por caja, foto MP sí/no, pedidos activos). Si no hubo apertura, lo dice y corta ahí. Reusa `db/queries/caja.js` y `pedidos.js`.
- **`src/flows/menuAdmin.js`** — `FLUJO='menu_admin'`, persistido en `estados_conversacion` igual que los demás flujos (mismo timeout `ESTADO_TIMEOUT_MIN`). Pasos: `principal` (4 opciones), `caja` (abrir/cerrar), `backup_resumen` (resumen hoy / resumen otro día / backup). `volver` retrocede un nivel, `cancelar` limpia todo. **Decisión de diseño:** si estando en el menú el admin escribe un atajo (ej. "pedidos") en vez de un número, el menú lo detecta (no matchea 1-4/volver/cancelar) y lo redirige al dispatcher de atajos (`adminHandler.procesarTexto`) en vez de solo repreguntar — así el camino rápido sigue "siempre disponible" incluso con el menú abierto, como pide la sección 1 del spec.

### Archivos modificados

- **`src/handlers/adminHandler.js`** — reescrito. Los alias ocultos (`ping`, `test apertura`, `test cierre`, `test cierre insistir`, `test cierre avisar`, `test resumen`, `test backup`, y el nuevo `test apertura avisar`) se siguen chequeando por igualdad exacta **antes** de cualquier parseo nuevo (necesario: `test apertura` contiene "apertura" y matchearía el atajo `abrir` si no tuviera prioridad). Si no es un alias, `procesarTexto()` parsea el mensaje con `parserAdmin` y ejecuta la cadena de acciones con `ejecutarAcciones()`: las de solo lectura (`estado`, `pedidos`, `marcar`, `backup`, `resumen`) encadenan; la primera interactiva (`abrir`, `cerrar`, `menu`) ejecuta y hace `return` (corta la cadena, sección 3.1 del spec). **Nota:** ante la ambigüedad de la sección 3.1 punto 5 del spec (que sugiere que "abrí y cerrá la caja" ejecuta ambas), se priorizó la regla operativa explícita del punto 4 ("interactiva corta la cadena", con "abrir caja" como ejemplo nombrado) — con ese mensaje, solo se ejecuta `abrir` y `cerrar` se descarta. Si Bruno prefiere el otro comportamiento, es un cambio de una línea en `ejecutarAcciones`.
- **`src/handlers/pedidoComandos.js`** — ahora exporta también `listarPedidos`, `marcarListo`, `marcarRetirado` (antes privadas) para que `adminHandler` las reuse desde la cadena de acciones sin duplicar lógica.
- **`src/handlers/messageHandler.js`** — `continuarFlujoActivo` reconoce también `menuAdminFlow.FLUJO`.
- **`src/flows/caja.js`** — al completar la última caja de la apertura, si quien abrió **no** es el admin, le avisa: `🟢 Caja abierta por <nombre> — Caja 1 $X · Caja 2 $Y` (usa `resolverDestino` + `empleadosQueries.buscarPorTelefono`).
- **`src/flows/cierre.js`** — mismo patrón al completar el cierre: `🔴 Caja cerrada por <nombre> — Caja 1 $X · Caja 2 $Y` (el spec no daba el texto exacto para este aviso, se elige por consistencia con el de apertura).
- **`src/flows/pedido.js`** — `notificarPedidoNuevo` ahora manda un solo mensaje compacto: `🛒 Pedido nuevo #N — Cliente: 2x Coca Cola, 1x Pan · Total $3.200` (antes era multilínea con `formatearResumen`).
- **`src/cron/tareas.js`** — nueva `avisarAdminApertura(client)` (espejo de `avisarAdminCierre`): si no hay apertura de Caja 1 hoy y no es el admin quien abre según el turno, avisa al admin. Programada a `HORA_APERTURA + APERTURA_AVISAR_ADMIN_MIN` (cron diario simple, no usa `programarTareaDeCierre` porque la apertura no se divide semana/finde). Exportada para el alias `test apertura avisar`.
- **`src/db/queries/empleados.js`** — nueva `buscarPorId(id)`, usada por `estadoDia.js` para resolver el nombre de quien abrió a partir de `aperturas_caja.empleado_id`.
- **`src/bot/index.js`** — `APERTURA_AVISAR_ADMIN_MIN` agregada a las variables de entorno obligatorias.
- **`.env` / `.env.example`** — `APERTURA_AVISAR_ADMIN_MIN=30`.

### Tabla de comandos/atajos del admin (estado final)

| Atajo / comando                              | Acción                                                  |
|-----------------------------------------------|----------------------------------------------------------|
| `menu`, `hola`, `ayuda`, `?`, texto no reconocido | Menú principal (numérico, persistido)                |
| `estado`, `cómo va`, `día`                    | Estado del día (sin fotos)                              |
| `pedidos`, `ped`                              | Lista de pedidos activos                                 |
| `listo <n>` / `retirado <n>` / `entregado <n>`| Marca ese pedido                                         |
| `abrir`, `abrí`, `apertura`                   | Dispara la apertura de hoy (interactivo, corta la cadena)|
| `cerrar`, `cerrá`, `cierre`                   | Dispara el cierre de hoy (interactivo, corta la cadena)  |
| `resumen` / `resumen AAAA-MM-DD`              | Resumen completo (con fotos) de hoy o de esa fecha       |
| `backup`                                      | Backup de la DB ahora                                    |
| `ping` (alias oculto)                         | `pong 🏓`                                                |
| `test apertura` / `test cierre` (alias ocultos)| Disparan apertura/cierre ya, sin esperar la hora real   |
| `test cierre insistir` / `test cierre avisar` / `test apertura avisar` (alias ocultos) | Ejecutan esa lógica de aviso manualmente |
| `test resumen` / `test backup` (alias ocultos)| Resumen/backup manual                                    |

### Cómo se probó

Todos los archivos nuevos/tocados pasan `node --check`. Se armó una simulación completa (`better-sqlite3` corre nativo en esta PC Windows, así que sí se pudo simular con DB temporal real + cliente de WhatsApp falso, sin red) cubriendo: el parser de intenciones con los ejemplos exactos del spec (incluidos mensajes compuestos), el corte de cadena real ("abrí la caja y mostrame pedidos" deja esperando el monto y descarta "pedidos"), el aviso de caja abierta/cerrada en vivo (con y sin autoaviso del admin), el "Estado del día" (con y sin apertura registrada), la navegación completa del menú (entrar a submenús, "volver", "cancelar", y el fallback de atajo dentro del menú), los alias ocultos (`ping`), el aviso de "nadie abrió la caja" (con cambio de turno simulado para probar el caso que sí avisa), y el aviso de pedido nuevo con detalle compacto. Los archivos de foto fake (`.png` de 4 bytes) generados por la simulación en `data/media/` se borraron al terminar; los `.jpg` de pruebas anteriores no se tocaron.

### Cómo probarlo en la PC de Bruno (WhatsApp real)

1. Reiniciar el bot (método PowerShell de la sección 5). La migración no agrega tablas nuevas en esta fase, solo lógica.
2. Desde el admin, escribir cualquier saludo o texto random → debe aparecer el menú numérico (antes no respondía nada con texto no reconocido).
3. Probar el camino rápido: `estado`, `pedidos`, `abrí la caja` (si no está abierta hoy), `resumen 2026-06-20` (alguna fecha sin datos, debe avisar que no hay registros).
4. Probar un mensaje compuesto de solo-lectura: `estado y pedidos` → deben llegar las dos respuestas. Probar uno con una acción interactiva en el medio: `abrí la caja y mostrame pedidos` → debe quedar esperando el monto de la Caja 1 y la lista de pedidos no debe aparecer.
5. Navegar el menú completo: escribir cualquier texto random → `3` (submenú Caja) → `volver` → `4` (submenú Backup y resumen) → `1` (resumen de hoy, con fotos).
6. Para los avisos en vivo: hace falta un segundo número de WhatsApp (empleado) distinto al admin para ver que la apertura/cierre completados por un empleado le llegan al admin (`🟢`/`🔴`). Si solo se prueba con el número del admin, no va a ver estos avisos (es a propósito: no se autoavisa).
7. Para "nadie abrió la caja": usar el alias oculto `test apertura avisar` (no hace falta esperar `HORA_APERTURA + APERTURA_AVISAR_ADMIN_MIN` real). Si hoy le toca abrir al admin, no debería avisar nada (es el comportamiento esperado).

### Gotchas / decisiones a tener en cuenta

- El matching del parser es por inclusión de substring, no por palabra exacta del todo en algunos casos (ej. `\bdia\b` sí usa límites de palabra, pero `'abrir'`/`'cerrar'`/`'resumen'`/`'backup'`/`'pedidos'`/`'estado'` son `.includes()` simple). Esto es **intencional** (igual approach que `parserPedido.js`), pero implica que, por ejemplo, "buenos días" contiene "dia" y dispararía "Estado del día" en vez de tratarse como saludo puro — está explícitamente aceptado como límite conocido en la sección 3.1 del spec ("no entiende negaciones"; este es el mismo tipo de riesgo).
- Igual que con los demás flujos, si el proceso de PM2/Node se reinicia con el menú a mitad de responder, el cron de `limpiarEstadosVencidos` (cada 10 min, `ESTADO_TIMEOUT_MIN`) lo limpia solo — no hace falta lógica nueva, ya estaba genérica desde la Fase D.
- `src/flows/menuAdmin.js` hace algunos `require()` perezosos (dentro de funciones, no al tope del archivo) de `adminHandler.js`, `estadoDia.js` y `pedidoComandos.js` para evitar un ciclo de `require` con `adminHandler.js` (que a su vez requiere `menuAdmin.js`). Es el patrón estándar de Node para romper ciclos cuando solo se necesita la función en tiempo de llamada, no en tiempo de carga del módulo.

### Bug real encontrado y corregido tras el primer arranque en producción (sesión de hoy)

Con el bot ya levantado y vinculado, entró un cliente real (no era una prueba). Sus dos primeros mensajes llegaron con `body` vacío (probablemente un sticker/imagen sin texto): el primero disparó el registro de cliente nuevo y la pregunta `"¡Hola! ¿Cuál es tu nombre?"` (esto se decide por el `pushname` del perfil, no por el contenido del mensaje, así que es esperado). El segundo, también vacío, volvió a insistir con el pedido de nombre porque `procesarNombre` no distinguía "mensaje no textual" de "texto vacío real" — cualquier no-respuesta generaba un nuevo reclamo. Al tercer mensaje el cliente saludó **"Hola"**, y como `tieneLetras("Hola")` es `true` y no había ningún filtro de saludos, el bot lo guardó literalmente como su nombre — el menú siguiente decía `"¡Hola Hola! ¿En qué te ayudo?"`.

**Corrección en `src/flows/pedido.js`:**
1. `esMensajeNoTextual(msg)` (`msg.type !== 'chat'`): si el mensaje en el paso `esperando_nombre` no es texto plano (sticker, foto, audio, ubicación), `procesarNombre` ahora no responde nada — no insiste por cada mensaje no textual.
2. `esSaludoNoNombre(texto)`: lista de saludos comunes (`hola`, `buenas`, `buenas tardes`, etc., comparación exacta tras `trim().toLowerCase()`) que ya **no** se aceptan como nombre — si el cliente responde un saludo, el bot contesta `"Ese no parece tu nombre 🙂 ¿Cómo te llamás?"` y sigue esperando.

Se probó con una simulación dedicada (DB temporal): sticker → pregunta nombre; segundo sticker → silencio (sin insistir de nuevo); "Hola" → rechazado, sigue esperando; nombre real → aceptado y muestra el menú con el nombre correcto. Los 4 casos en verde.

**Dato real corregido:** el cliente real que quedó mal registrado (`telefono` terminado en `...287496`) se borró de la tabla `clientes` (no tenía ningún pedido asociado, así que fue seguro eliminarlo en vez de solo limpiar el nombre) y se limpió su `estados_conversacion`. La próxima vez que escriba, el bot lo trata como contacto nuevo, ya con el fix aplicado. El bot se reinició para tomar el cambio de código (PID nuevo en `bot.pid`).

### Segundo bug real encontrado en la misma sesión: el flujo de pedido no tenía salida

Mismo número de prueba, segunda ronda: pidió un pedido, el catálogo seguía vacío, y a partir de ahí cada mensaje (`"Sos boleta"`, `"Pinga"`, `"Zaracatunga"`, etc.) recibía siempre la misma respuesta de "no tengo catálogo cargado" — sin ninguna palabra que lo sacara de ahí. A diferencia del menú del admin (`volver`/`cancelar`), el flujo de cliente (`esperando_items`, `esperando_confirmacion`) no tenía ninguna salida: quedaba atascado hasta que `ESTADO_TIMEOUT_MIN` (30 min) lo limpiara solo, sin que el cliente supiera que eso iba a pasar. Esto es lo que se reportó como "el bot nunca termina".

**Corrección en `src/flows/pedido.js`:**
- `esCancelar(texto)`: `cancelar`/`volver`/`menu`/`menú` (comparación exacta).
- En `continuar()`, antes de despachar por paso: si el paso no es `esperando_nombre` y el mensaje es una de esas palabras, vuelve directo al menú principal (`mostrarMenu`) sin importar en qué paso estaba. Es una salida universal, no hace falta agregarla en cada función de paso.
- El mensaje de "catálogo vacío"/"no reconocí ningún producto" en `procesarItems` ahora menciona explícitamente `*menu*` como forma de volver, para que el cliente sepa que existe esa salida (antes no se mencionaba en ningún lado).

Se probó con una simulación dedicada: queda atascado en `esperando_items` mientras manda texto random (y el mensaje ya avisa la salida), `"menu"` lo saca y vuelve al menú principal, y `"volver"` desde `esperando_confirmacion` también escapa correctamente. Los 4 casos en verde.

Se limpió el `estados_conversacion` colgado de esta segunda prueba real y se reinició el bot para tomar el fix.

### Atajo nuevo: "ventas" (historial reciente, no solo lo activo)

Pedido directo de Bruno: al admin preguntar por las ventas no le respondía nada (no había ningún
atajo que matchee "ventas"). `pedidoComandos.listarPedidos()` solo muestra pedidos **activos** (ni
retirados ni cancelados), que no es lo mismo que "ventas" — un pedido ya retirado sigue siendo una
venta.

- **`src/db/queries/pedidos.js`** — `listarRecientes(limite = 5)`: últimos N pedidos de **cualquier
  estado**, ordenados por fecha descendente, con el nombre del cliente.
- **`src/handlers/pedidoComandos.js`** — `listarVentas(limite)`: formatea esa lista con fecha corta
  (`DD/MM HH:MM`) además de cliente/total/estado.
- **`src/utils/parserPersonal.js`** — nueva acción `ventas` (solo rol `admin`, mismo criterio que
  `backup`/`resumen`): dispara con `ventas` (trae las últimas 5 por default) o `ventas <n>` (ej.
  `ventas 10`) para pedir más historial. Es de solo lectura, encadena igual que `estado`/`pedidos`.
- **`src/flows/personalAcciones.js`** — caso `ventas` nuevo en `ejecutarAcciones`.

Probado con una simulación (7 pedidos de prueba, uno retirado): `ventas` trae las últimas 5 en
orden descendente sin incluir las más viejas; `ventas 10` trae más historial e incluye la más
vieja. Documentado en la tabla de atajos de `COMPORTAMIENTO-ADMIN.md`.

---

## 9. Comportamiento de Clientes y Empleados (`COMPORTAMIENTO-CLIENTES-EMPLEADOS.md`) — IMPLEMENTADO

Generaliza el motor del admin (menú + atajos + mensajes compuestos) a un módulo de "personal"
compartido por admin y empleado, agrega el concepto de **empleado activo del día** (sin ritual de
check-in), y vuelve mucho más flexible el lado del cliente (pedir directo, catálogo, consultar/
repetir/cancelar pedido).

### Generalización admin/empleado (Parte A.2/C.1)

- **`src/utils/parserPersonal.js`** (nuevo) — el motor real de `parsearAcciones(texto, rol)`, con
  `rol` ∈ `'admin'|'empleado'`. Mismas acciones de siempre (`estado`, `pedidos`, `marcar`, `abrir`,
  `cerrar`, `menu`) + `resumen`/`backup`/`queda <nombre>` (**solo admin**) + `estoy`/`quedo yo`
  (**solo empleado**). `src/utils/parserAdmin.js` quedó como wrapper de una línea
  (`parserPersonal.parsearAcciones(texto, 'admin')`) para no tocar el punto de entrada de
  `adminHandler.js`.
- **`src/flows/menuPersonal.js`** (nuevo, reemplaza a `menuAdmin.js`) — menú navegable
  parametrizado por rol (`estado.data.rol`), `FLUJO = 'menu_personal'`. El empleado ve 3 opciones
  (sin Backup/Resumen); el admin ve 4. Mismo patrón de "atajo en vez de número" como fallback
  dentro del menú.
- **`src/flows/personalAcciones.js`** (nuevo) — `ejecutarAcciones(client, msg, telefono, rol, acciones)`
  generalizado (antes vivía dentro de `adminHandler.js`). Decisión de diseño: el atajo `abrir`/`cerrar`
  del **empleado** usa directamente su propia identidad (`empleadosQueries.buscarPorTelefono`), sin
  mirar la planilla `turnos` — "lo abre cualquier empleado" (A.5). El del **admin** sigue forzando vía
  `turnos` como siempre (`dispararApertura`/`dispararCierre` de `cron/tareas.js`, sin cambios ahí).
- **`src/handlers/adminHandler.js`** y **`src/handlers/employeeHandler.js`** quedaron como capas
  finas: alias ocultos (solo admin: `ping`, `test *`) + `procesarTexto()` que llama al parser/acciones
  generalizado con el rol correspondiente.

### Empleado activo del día (A.1.b/A.1.c)

- **Tabla nueva `turno_activo`** (`fecha`, `empleado_id`, `activo_desde`, `activo_hasta`) — una fila
  por cada vez que alguien queda a cargo; `getActivoDeHoy()` siempre toma la última fila de hoy, así
  que el "reset diario" es automático por fecha (no depende de borrar nada para funcionar bien).
- **`src/db/queries/turnoActivo.js`** — `setActivo`, `getActivoDeHoy` (con JOIN a `empleados` para
  nombre/teléfono), `setActivoHasta`, `limpiarAnteriores` (higiene, no afecta la lógica).
- **`src/flows/empleadoActivo.js`** — `getActivoVigente()` (null si nadie quedó activo hoy o ya pasó
  su `activo_hasta`), `tomarTurnoYPreguntarHora()` (dispara la pregunta y persiste el paso
  `esperando_hora_salida` bajo `FLUJO='turno_activo'`), `continuar()` (parsea la hora con
  `fechas.parsearHora`; si no se puede interpretar, **no insiste**: confirma "sin hora límite" y
  reprocesa el mensaje como una acción normal, por si en realidad el empleado ya estaba escribiendo
  otra cosa — mismo principio que el fix de "nunca termina" de la sección 9).
- **Disparadores:** completar una apertura de caja (`flows/caja.js`, salvo que abra el admin) y el
  atajo `estoy`/`quedo yo` (vía `personalAcciones.js`).
- **Reset diario:** colgado del cron de backup (`cron/backup.js`, 3:00) — `turnoActivoQueries.limpiarAnteriores()`.
- **`estadoDia.js`** suma la línea `Activo: <nombre>, hasta <hora>` (o `Activo: nadie`).
- **Admin (C.6):** atajo `queda <nombre>` (ej. `queda Juan`) reasigna el activo a mano, buscando por
  coincidencia parcial de nombre (sin acentos/mayúsculas) entre empleados con `rol='empleado'`.

**Decisión de diseño (no especificada en detalle por el spec):** "cerrar" vía atajo del empleado NO
está restringido al empleado activo — cualquier empleado que lo escriba cierra con su propia
identidad. El spec dice "lo hace el empleado activo" pero no describe qué pasar si otro lo intenta;
se optó por no inventar un mensaje de error no pedido. Si Bruno prefiere bloquearlo, es un cambio
chico en `personalAcciones.cerrarCaja`.

**Limitación conocida:** `activo_hasta` se guarda como texto `"HH:MM"` y se compara con la hora
actual como string — no maneja que la hora de salida cruce la medianoche (ej. alguien que dice
"hasta las 02:00"). No es un problema real con los horarios actuales del local (cierra 22:00/23:00),
así que no se le agregó manejo de fecha completa.

### Corrección posterior: el admin es un superset del empleado, no debía quedar nada afuera

Bruno hizo notar que el admin tiene que tener **todos** los comandos del empleado además de los
propios — y `"estoy"`/`"quedo yo"` se había quedado gateado a `rol === 'empleado'` en
`parserPersonal.js` (el admin lo escribía y no pasaba nada, caía al menú). Se sacó esa restricción:
ahora cualquiera de los dos roles puede tomar el turno con `estoy`/`quedo yo`.

De paso, en `flows/caja.js` el hook de "queda activo" (A.1.b) estaba en el mismo `if` que el aviso
🟢 al admin, y por eso se saltaba entero cuando quien completaba la apertura era el admin. Se separó
en dos bloques: el aviso 🟢 sigue sin mandarse a sí mismo (no tiene sentido autoavisarse), pero
"queda activo + pregunta la hora" ahora aplica también al admin — por ejemplo, los días que a él le
toca abrir según `turnos` (lunes a miércoles), o si usa `estoy` para tomar el relevo.

**Lo que no cambió a propósito:** el atajo `abrir`/`cerrar` del admin para *forzar* la apertura de
**otra persona** (cuando no es su turno) sigue resolviendo vía `turnos`, sin tocar — es una acción
distinta ("forzar remotamente a quien le toca" vs. "yo estoy presente"), documentada así desde
`COMPORTAMIENTO-ADMIN.md` sección 4.3 ("el admin puede forzar apertura/cierre desde su propio
menú"). No es que le falte un comando, es un comando con un propósito distinto al de "estoy".

Probado con una simulación: `estoy` del admin pregunta la hora y guarda `turno_activo` con el
admin; `queda Juan` sigue funcionando después; y abriendo la caja en un día que le toca al admin
según `turnos`, también queda activo igual que un empleado. 7 verificaciones, todas en verde.

### Segunda corrección: "abrir"/"cerrar" del admin dependían de la planilla y se quedaban mudos

Bug real reportado por Bruno: "sigo sin poder cerrar caja". Causa exacta (en los logs reales): hoy
(miércoles) le toca cerrar a Empleado X según `turnos`, y como `EMPLEADO_X_NUMBER` todavía es el
placeholder de `.env`, el atajo `cerrar` del admin (que hasta ahora forzaba vía `dispararCierre` →
`resolverPersonaDeHoy('cierre')` → el teléfono de Empleado X) fallaba al resolver/enviar el mensaje
— y como `dispararCierre`/`cerrarCaja` solo avisaban algo al admin si la caja **ya** estaba
cerrada, el admin se quedaba sin ninguna devolución (ni error, ni confirmación, silencio total).

**Corrección en `src/flows/personalAcciones.js`:** `abrirCaja`/`cerrarCaja` dejaron de bifurcar por
rol. Ahora **siempre** operan con la identidad de quien escribe el mensaje (`empleadosQueries.buscarPorTelefono(telefono)`
+ `aperturaFlow.iniciarApertura`/`cierreFlow.iniciarCierre` directo) — admin o empleado, sin
distinción, consistente con "el admin es un superset del empleado". El mecanismo viejo de "forzar
la apertura/cierre de quien le toca según `turnos`" **no se perdió**: sigue intacto y disponible
exactamente igual que antes vía los alias ocultos `test apertura` / `test cierre`
(`adminHandler.js`, sin cambios), que es lo que hay que usar si en algún momento se quiere
específicamente empujarle el recordatorio a la persona programada en vez de cerrar uno mismo.

Se sacó el `if (rol === 'admin')` que llamaba a `dispararApertura`/`dispararCierre` desde el atajo
natural — esas funciones de `cron/tareas.js` quedan usadas solo por el cron real y por `test
apertura`/`test cierre`, no por el atajo de palabra clave.

Probado reproduciendo el caso exacto (Empleado X con teléfono placeholder, turno de cierre de hoy
asignado a él, admin escribe "cerrar caja"): ahora el admin recibe la pregunta de la foto de MP
directamente en su propio chat, sin depender de que el número de Empleado X exista.

### Tercer pedido: diccionario de variantes para "escuchar siempre" sin pasar por el menú

Bruno pidió que el bot "quede siempre escuchando" para admin/empleado sin tener que entrar por el
menú — y sugirió, acertadamente, un diccionario de variantes. La arquitectura ya soportaba esto (los
atajos por palabra clave funcionan en cualquier momento, no hace falta estar "dentro" del menú); lo
que faltaba era cobertura: el diccionario de palabras por acción era chico, así que frases naturales
("¿cómo vamos?", "tomo el turno", "cerrame la caja") no matcheaban nada y caían al menú por defecto.

**`src/utils/parserPersonal.js`** se reescribió alrededor de un diccionario explícito,
`PALABRAS_POR_ACCION` (un array de variantes por acción), separado de la función de detección — para
sumar una forma nueva de decir lo mismo alcanza con agregar una palabra a la lista correspondiente,
sin tocar el resto del parser. Variantes nuevas agregadas: `estado` (como va/vamos/anda/esta,
novedades, situación), `pedidos` (pendientes, ordenes, que hay/falta pendiente), `abrir` (abrime,
abro), `cerrar` (cerrame, cierro), `estoy` (yo quedo, me quedo, tomo el turno, asumo, quedo a cargo),
`menu` (opciones, comandos, que puedo hacer), y para el admin `ventas` (vendido, facturado, vendimos)
y `backup` (respaldo, copia de seguridad).

Probado con 15 frases naturales nuevas (ej. "como vamos hoy" → estado, "cerrame la caja" → cerrar,
"tomo el turno" → estoy, "cuanto vendimos" → ventas) más una verificación de que nada viejo se rompió
(`pedidos`, `abrir`, `listo 3`, y que el empleado sigue sin poder usar `backup`). Todo en verde.

**Para seguir ampliando el diccionario más adelante:** solo hace falta agregar la palabra/frase
(normalizada: minúsculas, sin acentos) al array correspondiente de `PALABRAS_POR_ACCION` en
`src/utils/parserPersonal.js` — no hace falta tocar nada más. Ojo con el orden de chequeo dentro de
`detectarAccionEnFragmento` si una palabra nueva pudiera superponerse con otra acción (ej. agregar
"dia" a otra lista competiría con `estado`, que ya lo usa).

### Aviso de pedido nuevo por empleado activo (A.6)

`flows/pedido.js`: `destinatariosPersonal()` devuelve, por orden de prioridad, el teléfono del
empleado activo vigente, o (si no hay/expiró) los de turno de hoy según `turnos` (apertura y cierre,
vía `cronTareas.resolverPersonaDeHoy`, ahora exportada) — siempre + el admin, deduplicado con `Set`
(no se manda doble si coincide). La usan tanto `notificarPedidoNuevo` (pedido confirmado) como el
aviso de pedido cancelado (B.9).

### Cliente: pedir directo y nuevas intenciones (Parte B)

`flows/pedido.js` reescrito. Orden de chequeo para un cliente conocido sin flujo activo
(`procesarClienteConocido`, B.3): catálogo → mi pedido → repetir → cancelar → técnico → gracias →
saludo/menú → **parsea como pedido (va directo a confirmación, sin pasar por "1")** → silencio.

- **B.2** — primer contacto: si el mensaje ya parsea como pedido, va directo a confirmación; si no,
  bienvenida nueva que invita a pedir directo (`enviarBienvenida`, ya no es el menú numerado).
- **B.5** — el menú 1/2 sigue existiendo como ayuda opcional; si dentro de él el cliente escribe
  cualquier otra cosa (no "1"/"2"), se reprocesa con el mismo `procesarClienteConocido` en vez de
  solo insistir "Respondé 1 o 2".
- **B.6** — `precios`/`catálogo`/`lista`/`qué tienen` → catálogo con precios desde
  `productosQueries.listarActivos()`.
- **B.7** — `mi pedido`/`está listo`/`listo?`/`estado` → estado del último pedido
  (`pedidos.buscarUltimoPorCliente`, nueva).
- **B.8** — `lo de siempre`/`repetir`/`el de siempre` → re-precia los ítems del último pedido contra
  el catálogo actual (`reprecisarItems`): si no cambió nada, va directo a confirmación normal; si
  cambió algún precio o algún producto ya no existe, lo avisa explícitamente (antes/ahora) antes de
  pedir confirmación.
- **B.9** — `cancelar` → si hay un pedido no retirado/cancelado, pide confirmación
  (`esperando_confirmacion_cancelar`, paso nuevo) y al confirmar lo marca `cancelado` + avisa al
  personal (A.6). Si no hay nada cancelable, lo aclara.
- **B.10** — técnico sigue "no disponible", sin cambios de fondo.

**Ajuste de formato:** `parserPedido.formatearResumen` cambió de `  - 2x Coca: $2.400` a
`  2x Coca Cola — $2.400` (con "Total:" sin sangría) para coincidir exactamente con la plantilla del
spec (B.4). Es el único lugar que usaba esa función, así que no rompe nada existente.

**Gotcha de diseño encontrado en la simulación:** la palabra `cancelar` significa dos cosas distintas
según el contexto: (1) la "salida universal" que ya existía para escapar de un paso atascado
(`esCancelar`, sección 9) y (2) la intención nueva de B.9 ("cancelá mi pedido"). Se resuelven sin
conflicto porque corren en momentos distintos: (1) solo aplica si el cliente **ya tiene** un paso
activo del flujo de pedido (`esperando_items`, `esperando_confirmacion`, etc.); (2) solo aplica
cuando **no tiene ningún flujo activo** (`procesarClienteConocido`, llamado desde
`iniciarConversacion`). Si un cliente queda en un paso colgado (ej. declinó un "repetir" y el bot le
pidió que escriba de nuevo) y ahí escribe "cancelar", gana la lectura (1) — sale al menú en vez de
cancelar un pedido viejo. Es la lectura más natural en ese contexto ("dejá, no sigas insistiendo") y
no se trató como bug.

### Tabla de atajos del empleado

| Atajo (contiene)                              | Acción                                          |
|------------------------------------------------|--------------------------------------------------|
| `menu`, `hola`, `ayuda`, `?`, texto no reconocido | Menú del empleado (3 opciones)                |
| `estado`, `cómo va`, `día`                     | Estado del día (incluye línea "Activo: ...")    |
| `pedidos`, `ped`                               | Lista de pedidos activos                         |
| `listo <n>` / `retirado <n>` / `entregado <n>` | Marca ese pedido                                 |
| `abrir`, `abrí`, `apertura`                    | Abre la caja con su propia identidad y queda activo |
| `cerrar`, `cerrá`, `cierre`                    | Cierra la caja con su propia identidad           |
| `estoy`, `quedo yo`                            | Toma el turno (relevo) y le preguntan la hora    |
| `ping`                                          | `pong 🏓` (único alias oculto que sí tiene el empleado) |
| Backup/resumen/`test *`                        | No existen para el empleado → caen al menú       |

### Tabla de atajos/intenciones del cliente

| El cliente escribe (contiene)…                | Acción                                          |
|-------------------------------------------------|--------------------------------------------------|
| `precios`, `catálogo`, `lista`, `qué tienen`   | Ver catálogo con precios (B.6)                  |
| `mi pedido`, `está listo`, `listo?`, `estado`  | Estado de su último pedido (B.7)                |
| `lo de siempre`, `repetir`, `el de siempre`    | Repetir último pedido, re-preciado (B.8)        |
| `cancelar` (sin flujo activo)                  | Cancelar su último pedido no retirado (B.9)     |
| `técnico`/`tecnico`                            | "No disponible por acá" (Fase 6)                |
| `gracias`/`thank`                              | `¡De nada! 🙂` (no re-muestra el menú)           |
| `hola`, `buenas`, `menu`, `ayuda`, `pedido`    | Menú/ayuda (B.5)                                |
| Pedido reconocible (`2 cocas y un pan`, etc.)  | Directo a confirmación, sin pasar por "1" (B.4) |
| `menu`/`volver`/`cancelar` (con un paso atascado, ej. catálogo vacío) | Salida universal al menú (sección 9) |
| Cualquier otra cosa                            | Silencio (no responde)                          |

### Cómo se probó

Simulación dedicada (DB SQLite temporal + cliente de WhatsApp falso, sin red real) cubriendo: abrir
caja como empleado vía mensaje compuesto (`"hola, abrí la caja"`) → queda activo → pregunta la hora →
la guarda; `estadoDia` muestra "Activo: ...”; aviso de pedido nuevo al activo + admin (sin duplicar al
de turno); con el activo expirado, fallback a apertura+cierre de `turnos` + admin; relevo con
`"estoy"` y respuesta no interpretable como hora (confirma "sin hora límite" sin insistir); menú del
empleado sin Backup/Resumen y sin alias `test *`; `"queda Juan"` del admin reasigna el activo; ver
catálogo; consultar último pedido; repetir con cambio de precio (avisa antes/ahora) y sin cambios
(va directo); cancelar pedido con confirmación y aviso al personal; pedir directo sin pasar por el
menú. 27 verificaciones, todas en verde. Se encontraron y corrigieron dos problemas en el *test*
mismo (no en el código): horarios hardcodeados que ya habían "pasado" según el reloj real del día de
la prueba, y un estado de cliente colgado de un paso anterior — quedaron documentados en los
comentarios del script de simulación para no repetir la confusión.

### Cómo probarlo en la PC de Bruno (WhatsApp real)

1. Reiniciar el bot (la migración crea la tabla `turno_activo` sola, no hace falta tocar nada a mano).
2. Desde el número de un **empleado** (no el admin): `hola, abrí la caja` → debe abrir caja y, al
   completarla, preguntar `¿hasta qué hora te quedás?`. Responder una hora (ej. `19:00`).
3. `estado` (desde el empleado o el admin) → debe mostrar la línea `Activo: <nombre>, hasta 19:00`.
4. Desde un cliente, hacer un pedido y confirmarlo → debe avisarle **al empleado activo** (no al de
   turno de `turnos`, salvo que coincidan) + al admin.
5. Desde el admin: `queda <nombre del otro empleado>` → reasigna el activo a mano.
6. Desde un cliente conocido (ya con pedidos previos): `precios`, `mi pedido`, `lo de siempre`,
   `cancelar` — probar cada uno. Para ver el aviso de cambio de precio en "repetir", hace falta tener
   al menos un pedido viejo y haber cambiado el precio de algún producto del catálogo en el medio.
7. Un cliente nuevo que escribe directo `"2 cocas y un pan"` como primer mensaje debe ir derecho a la
   confirmación, sin preguntar nombre primero (si su perfil de WhatsApp tiene nombre con letras).

### Pendiente / notas

- El catálogo sigue vacío en la DB real (se vació al cerrar la sesión anterior) — sin productos
  cargados, B.4/B.6/B.8 no tienen nada para reconocer. Cargar con
  `node scripts/importar-productos.js` antes de probar con WhatsApp real.
- No se probó el cruce de medianoche de `activo_hasta` con el reloj real (ver limitación conocida
  arriba) — no debería ocurrir con los horarios actuales del local.
- Para v2 (no pedido en esta sesión): notificar al empleado reasignado por el admin (`queda Juan`)
  que quedó a cargo; permitir que el empleado active/edite su propia `activo_hasta` después de
  haberla fijado, sin tener que esperar al próximo relevo.

---

## 9-bis. El bot ahora reconoce las ventas hechas desde el panel de gestión

Bruno construyó un panel de gestión (Next.js, carpeta `panel/`) que comparte la misma DB SQLite que
el bot, y le pidió al bot que avise mensajes (`PANEL_BRIDGE_TOKEN`, `src/api/server.js`, ver sección
10). Pidió además que el bot **reconozca las ventas hechas desde el panel** — no aparecían en
`ventas` ni en `pedidos`.

**Causa real:** `panel/lib/repo.js` → `crearVenta({ clienteId = null, ... })` puede crear una venta
de mostrador **sin cliente asociado** (`cliente_id = NULL` en `pedidos`). Las queries del bot
(`src/db/queries/pedidos.js` → `listarRecientes`, `listarActivos`) usaban `JOIN clientes` (INNER):
con `cliente_id` `NULL`, el INNER JOIN excluye la fila **en silencio** — la venta existía en la DB
pero el bot nunca la mostraba.

**Corrección (una función a la vez):**
1. `pedidos.listarRecientes` → `LEFT JOIN clientes` en vez de `JOIN`.
2. `pedidoComandos.listarVentas`/`nombreVenta` → si no hay `cliente_nombre` ni `cliente_telefono`,
   muestra `"Venta de mostrador"` en vez de `null`.
3. `pedidos.listarActivos` → mismo cambio a `LEFT JOIN` (mismo riesgo si una venta de mostrador
   queda en un estado no terminal, ej. "confirmado" para preparar antes de retirar).
4. `pedidoComandos.listarPedidos` → reusa `nombreVenta` para el mismo fallback.

`marcarListo`/`marcarRetirado` ya estaban a salvo de este bug (usan `clientesQueries.buscarPorId` y
ya chequeaban `if (cliente)` antes de intentar notificar a un teléfono que no existe).

**Nota:** no se probó con una simulación (a pedido de Bruno, de acá en más los cambios se verifican
contra los logs reales en uso, no con DB temporal) — queda pendiente de confirmar en producción
mandando `ventas`/`pedidos` después de una venta de mostrador real desde el panel.

---

## 10. Endurecimiento de todos los flujos (pedido explícito del usuario)

Pasada transversal de robustez sobre todo lo construido hasta ahora (caja, cierre, menú personal,
empleado activo, pedidos), sin agregar funcionalidad nueva. Disparada por un pedido directo de
Bruno ("endurecer al 100% todos los flujos") después de confirmar en producción que WhatsApp
reenvía mensajes de backlog al reconectar (lo vimos pasar con mensajes de grupo al arrancar el bot).

### 1. Deduplicación de mensajes reenviados

- **Tabla nueva `mensajes_vistos`** (`msg_id`, `recibido_at`) + **`src/db/queries/mensajesVistos.js`**
  (`yaVisto`, `marcarVisto`, `limpiarAntiguos`).
- **`src/handlers/messageHandler.js`**: al tope de `procesarMensaje`, si `msg.id._serialized` ya
  estaba marcado como visto, se ignora el mensaje entero (ni se lo loguea como acción, solo un
  `warn`). Evita que un reenvío de WhatsApp (reconexión) repita una acción que ya se ejecutó —
  el caso real que motivó esto: registrar dos veces el mismo monto de apertura/cierre.
- **Limpieza:** colgada del mismo cron que ya limpiaba estados vencidos (`limpiarEstadosVencidos`,
  cada 10 min) — borra registros de `mensajes_vistos` de más de 1 hora.

### 2. Cola de procesamiento por remitente

- **`src/handlers/messageHandler.js`**: `manejarMensaje` ahora encola la tarea real
  (`procesarMensaje`) por `msg.from` en un `Map` de promesas encadenadas. Mensajes de un mismo
  remitente se procesan siempre en orden, uno a la vez; remitentes distintos siguen en paralelo sin
  esperarse entre sí.
  **Por qué hacía falta:** cada `enviarMensaje` tiene un rate-limit de ~1 segundo entre envíos
  (`bot/client.js`), así que un flujo que manda 2-3 mensajes seguidos deja una ventana real de
  varios segundos con `await` pendientes. Si la misma persona mandaba un segundo mensaje en ese
  lapso (típico: alguien que no espera la respuesta y ya escribe lo siguiente), antes podía
  interleavearse con la lectura/escritura del estado en SQLite y pisarlo. Probado en simulación:
  dos mensajes disparados sin esperar el primero (`Promise.all`, sin `await` secuencial) generan
  exactamente una respuesta cada uno, en el orden correcto.

### 3. Red de seguridad ante excepciones

- **`src/handlers/messageHandler.js`**: si `continuarFlujoActivo` o el ruteo por rol tira una
  excepción no anticipada, el `catch` ahora (antes solo logueaba):
  1. Limpia el `estado` de esa persona (si había uno) — para que el **próximo** mensaje no vuelva a
     pisar el mismo bug en bucle (mismo principio que el fix de "el menú nunca termina" de la
     sección 9, pero para el caso de una excepción real en vez de texto no reconocido).
  2. Manda `"⚠️ Uy, algo salió mal de mi lado. Probá de nuevo, o escribime *menu*."` — antes, ante
     una excepción, la persona se quedaba sin ninguna respuesta y sin saber qué pasó.
- **`src/bot/index.js`**: `process.on('unhandledRejection', ...)` y `process.on('uncaughtException', ...)`
  a nivel de proceso — loguean y, en el caso de `uncaughtException` (algo que se escapó de
  absolutamente todo try/catch), salen del proceso para que PM2 lo reinicie limpio en vez de seguir
  corriendo en un estado posiblemente inconsistente (ver `ecosystem.config.js`).

### 4. Guards defensivos (lookups que se asumían exitosos)

Se agregaron chequeos de `null`/`undefined` con mensaje de error claro (en vez de un crash que ahora
sí se recupera gracias al punto 3, pero es mejor evitarlo directamente) en:
- **`src/flows/personalAcciones.js`**: `abrirCaja`/`cerrarCaja` (rol empleado) y la acción `estoy`
  ahora chequean que `empleadosQueries.buscarPorTelefono` haya encontrado algo antes de usarlo.
- **`src/flows/empleadoActivo.js`**: el fallback de `continuar()` (cuando no se interpretó una hora
  válida) chequea el empleado antes de reprocesar el mensaje.
- **`src/flows/pedido.js`**: `procesarMenu` (fallback a `procesarClienteConocido`) y
  `procesarConfirmacion` chequean que el cliente exista antes de usarlo.
- **`src/utils/media.js`**: `guardarFotoMensaje` envuelve la escritura a disco (`fs.writeFileSync`)
  en try/catch — antes, si el disco fallaba (lleno, permisos), tiraba sin capturar.

### 5. Condición de carrera en "cancelar pedido" (B.9)

**`src/flows/pedido.js`**, `procesarConfirmacionCancelar`: antes, al responder "Sí" a "¿Cancelo tu
pedido #12?", se marcaba `cancelado` sin volver a mirar el estado actual del pedido. Si pasó un
rato entre la pregunta y el "Sí" (plausible: el cliente se demora en contestar) y mientras tanto un
empleado ya marcó ese pedido `listo`/`retirado` con `pedidoComandos`, confirmar la cancelación
pisaba ese estado más reciente. Ahora se vuelve a consultar `pedidos.buscarPorId` justo antes de
aplicar el cambio: si ya está `retirado`/`cancelado`, se avisa que ya no se puede cancelar en vez de
sobrescribirlo.

### Cosas que se revisaron y NO hacía falta tocar

- **Mensajes propios del admin (`fromMe`):** `whatsapp-web.js` ya filtra los mensajes que el admin
  manda desde su propio teléfono *antes* de emitir el evento `'message'` (los descarta a nivel de
  librería, ver `Client.js`). El bot nunca llega a verlos, así que no hay riesgo de que el admin
  "se comande a sí mismo" escribiendo en otro chat desde su celular.
- **Idempotencia de apertura/cierre/pedidos:** ya estaba bien resuelta desde las fases C/D (chequeo
  "ya existe" antes de cada `INSERT`) y desde el diseño de `estados_conversacion` (al completarse un
  paso final se limpia el estado, así que un reenvío *después* de completado simplemente no
  encuentra flujo activo y no repite la acción — confirmado en la simulación del punto 1).
- **SQLite/concurrencia a nivel de DB:** `better-sqlite3` es síncrono y de un solo proceso — no hay
  carrera real a nivel de motor de base de datos, todo el riesgo estaba en el `async`/`await` de
  JavaScript (resuelto en el punto 2).

### Cómo se probó

Simulación dedicada (DB temporal + WhatsApp falso) con 9 verificaciones: mismo `msg.id` "reenviado"
no repite la apertura ya iniciada ni duplica cajas registradas; dos mensajes del mismo remitente
lanzados sin esperar el primero (`Promise.all`) generan una respuesta cada uno, en orden, sin
mezclarse; un estado deliberadamente corrupto (forzado a mano, no alcanzable por un mensaje normal)
hace explotar `continuarApertura` como se esperaba, y la recuperación limpia el estado, avisa, y el
bot sigue funcionando con normalidad en el mensaje siguiente (`ping` → `pong` 🏓). Todo en verde.

### Pendiente / notas

- No se tocó la lógica de negocio de ningún flujo, solo robustez alrededor. Si algo de lo que ya
  funcionaba deja de comportarse igual, es un efecto no buscado de esta sección — avisar.
- El endurecimiento es transversal (vive en `messageHandler.js` para dedup/cola/recuperación), así
  que cualquier flujo **nuevo** que se agregue de acá en adelante ya lo hereda automáticamente sin
  tener que repetir nada.

---

## 11. Notas de entorno de esta PC de desarrollo (no aplican al VPS)

- Node global: v24.17.0 (no hay Python/Build Tools, por eso se usa `better-sqlite3 ^12.11.1` con binario prebuilto en vez de `^11.x` que requería compilar).
- Chrome para Puppeteer: `C:\Users\Bruno\.cache\puppeteer\chrome\win64-146.0.7680.31\`.
- En el VPS (Node 20 LTS + Ubuntu) no debería repetirse el problema de extracción de Chrome ni el de compilación nativa, pero sí hay que mantener el fix del User-Agent en `client.js` (es independiente del SO) y configurar `CHROMIUM_PATH` apuntando al Chromium instalado por `apt`.
