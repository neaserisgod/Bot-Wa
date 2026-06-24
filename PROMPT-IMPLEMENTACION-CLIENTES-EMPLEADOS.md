# Prompt para Claude — Implementar el nuevo comportamiento de Clientes y Empleados

Copiá todo lo que sigue (dentro del bloque) y pegáselo a Claude en el proyecto `bot-nefertiti`.

---

Trabajás en el proyecto **bot-nefertiti** (bot de WhatsApp para un almacén con taller, Node.js).
Antes de tocar nada, leé estos archivos para tener el contexto completo:

- `COMPORTAMIENTO-CLIENTES-EMPLEADOS.md` — la especificación EXACTA de lo que hay que construir.
  Es la fuente de verdad. Implementá ese comportamiento al pie de la letra.
- `COMPORTAMIENTO-ADMIN.md` — el rediseño del admin **ya implementado**. Reusá su patrón
  (`src/flows/menuAdmin.js`, `src/utils/parserAdmin.js`, `src/flows/estadoDia.js`) en vez de
  reinventarlo.
- `PROGRESO.md` — bitácora del estado del proyecto, arquitectura, gotchas y convenciones.

## Restricciones (no negociables)
- **Sin IA, sin APIs pagas, sin librerías de NLP.** El parseo de intenciones es propio, por
  palabras clave, tolerante a mayúsculas/acentos/inclusión, igual que `src/utils/parserPedido.js`
  y `src/utils/parserAdmin.js`.
- El **estado de conversación se persiste en SQLite** (`src/db/queries/estados.js`), nunca en
  memoria. Los menús y flujos nuevos son flujos persistidos más, con el mismo timeout.
- Mensajes y comentarios en **español (Argentina)**. Respetá el tono y los emojis del estilo actual.
- No rompas nada existente (apertura/cierre de caja, resumen, comandos del admin).

## Qué construir (resumen — el detalle fino está en COMPORTAMIENTO-CLIENTES-EMPLEADOS.md)

### Empleados (Parte A del spec)
1. **Empleado activo del día, sin ritual de check-in (A.1.b/A.1.c):**
   - Nuevo registro en DB: quién está activo hoy y su `activo_hasta` (tabla `turno_activo` con
     `fecha, empleado_id, activo_desde, activo_hasta`, o columnas en `empleados`). Funciones
     `setActivo(empleadoId, hasta)`, `getActivoDeHoy()`, y un **reset diario** (colgado del cron de
     backup o de la hora de apertura).
   - **El que abre la caja queda activo** automáticamente. Relevo opcional con `estoy`/`quedo yo`.
   - Apenas alguien queda activo, el bot pregunta **"¿hasta qué hora te quedás?"** (paso de flujo
     persistido `esperando_hora_salida`) y guarda `activo_hasta`. Si no contesta, queda activo sin
     hora (no expira hasta el reset).
2. **Menú + atajos + mensajes compuestos para el empleado (A.2/A.3):** mismo motor que el admin,
   con subconjunto de acciones (Estado del día, Pedidos, Caja). Lo ideal es **generalizar**
   `menuAdmin.js`/`parserAdmin.js` a un módulo de "personal" parametrizado por rol, en vez de
   duplicar. Soportar mensajes compuestos (`estoy, abrí la caja`) con las reglas de la sección 3.1
   del spec del admin.
3. **Caja a cargo del empleado activo (A.5):** abrir lo manda cualquier empleado (y queda activo);
   cerrar lo hace el activo. Reusa `flows/caja.js` / `flows/cierre.js`. Bloqueo de doble apertura/
   cierre como hoy.
4. **Estado del día y pedidos:** reusar `flows/estadoDia.js` y `handlers/pedidoComandos.js` tal
   cual. El estado del día suma una línea "Activo: Juan, hasta 18:00".
5. **Aviso de pedido nuevo por empleado activo (A.6):** el aviso pasa a ir al **empleado activo**
   (si no pasó su `activo_hasta`) + admin; si no hay activo o ya expiró, **fallback** a los de turno
   de hoy según `turnos` + admin. El admin lo recibe siempre, sin duplicar si coincide.

### Clientes (Parte B del spec)
6. **Pedir directo, sin menú obligatorio (B.3/B.4):** un cliente conocido sin flujo activo que
   escribe algo que `parsearPedido` reconoce va directo a confirmación, salteando el menú. El menú
   1/2 queda como ayuda opcional. Mantener el filtro actual que evita spamear charla casual
   (`pareceSaludoOPedido` / `pareceAgradecimiento`).
7. **Intenciones nuevas del cliente (orden de chequeo en B.3):**
   - `precios`/`catálogo` → **ver catálogo** con precios desde `productosQueries.listarActivos()` (B.6).
   - `mi pedido`/`está listo?` → **estado de su último pedido** (B.7).
   - `lo de siempre`/`repetir` → **repetir último pedido** re-preciando con el catálogo actual,
     **avisando qué precios cambiaron** (antes/ahora) antes de confirmar (B.8).
   - `cancelar` → **cancelar** el último pedido no retirado, con confirmación (B.9).
   - `técnico` sigue "no disponible" (B.10).
8. **Queries nuevas:** `pedidos.buscarUltimoPorCliente(clienteId)` y un helper para re-preciar los
   ítems de un pedido viejo contra el catálogo actual detectando cambios de precio.

### Admin (nota C.6 del spec)
9. El admin gana ver/reasignar el empleado activo (`queda Juan`) y el estado del día muestra el
   activo + hasta qué hora. Reflejarlo también en `COMPORTAMIENTO-ADMIN.md` y en la implementación
   del menú admin.

## Cómo trabajar
- Avanzá por partes y verificá con `node --check` cada archivo que toques.
- El binario nativo de `better-sqlite3` es de Windows: **no se puede correr el bot completo en
  Linux**. Para la lógica nueva, escribí una **simulación** con una DB SQLite temporal y un cliente
  de WhatsApp falso (sin red), como en las fases anteriores (ver PROGRESO.md): probá el empleado
  activo + "hasta qué hora", el ruteo de pedidos por activo con fallback, los mensajes compuestos,
  el pedir directo del cliente, ver catálogo, consultar/repetir/cancelar pedido, y el re-precio con
  aviso de cambios.
- Cuando termines, **actualizá `PROGRESO.md`** con una sección nueva describiendo lo construido,
  cómo probarlo en la PC de Bruno, y los gotchas. Dejá tablas de atajos del empleado y del cliente.
- No completes números de teléfono ni cargues catálogo: eso lo hace Bruno.

Empezá leyendo los tres archivos y proponé un plan breve antes de codear.
