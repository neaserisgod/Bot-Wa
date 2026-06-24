# Prompt para Claude — Implementar el nuevo comportamiento del admin

Copiá todo lo que sigue (dentro del bloque) y pegáselo a Claude en el proyecto `bot-nefertiti`.

---

Trabajás en el proyecto **bot-nefertiti** (bot de WhatsApp para un almacén con taller, Node.js).
Antes de tocar nada, leé estos dos archivos para tener el contexto completo:

- `COMPORTAMIENTO-ADMIN.md` — la especificación EXACTA de lo que hay que construir. Es la fuente
  de verdad. Implementá ese comportamiento al pie de la letra (menús, atajos, mensajes compuestos
  y avisos automáticos).
- `PROGRESO.md` — bitácora del estado del proyecto, arquitectura, gotchas y convenciones.

## Restricciones (no negociables)
- **Sin IA, sin APIs pagas, sin librerías de NLP.** El parseo de intenciones del admin es propio,
  por palabras clave, tolerante a mayúsculas/acentos/inclusión, igual que `src/utils/parserPedido.js`.
- El **estado de conversación se persiste en SQLite** (`src/db/queries/estados.js` →
  `setEstado/getEstado/clearEstado`), nunca en memoria. La navegación del menú del admin es un
  flujo persistido más, con el mismo timeout `ESTADO_TIMEOUT_MIN`.
- Mensajes y comentarios en **español (Argentina)**. Respetá el tono y los emojis del estilo actual.
- No rompas nada existente: `ping`, `test apertura`, `test cierre`, `test cierre insistir`,
  `test cierre avisar`, `test resumen`, `test backup` quedan como **alias ocultos** que siguen
  funcionando.

## Qué construir (resumen — el detalle fino está en COMPORTAMIENTO-ADMIN.md)

1. **Parser de intenciones del admin** (nuevo, ej. `src/utils/parserAdmin.js`):
   - Recibe el texto y devuelve la lista ordenada de acciones detectadas
     (`estado`, `pedidos`, `abrir`, `cerrar`, `resumen[fecha]`, `backup`, `menu`, y `listo/retirado <id>`).
   - Ignora palabras de cortesía (`hola`, `buenas`, `gracias`, `por favor`) cuando acompañan una
     acción; si el mensaje es solo cortesía/desconocido → acción `menu`.
   - Separa por comas, `y`, saltos de línea para soportar mensajes compuestos (sección 3.1 del spec).

2. **Menú navegable del admin** (en `src/handlers/adminHandler.js`, apoyado en un flujo persistido):
   - Menú principal + sub-menús de Caja y de Backup/resumen (textos exactos en el spec, sección 2 y 4).
   - Respuestas numéricas interpretadas en contexto vía `estados_conversacion`. `volver`/`cancelar`
     limpian/retroceden.

3. **Ejecución de mensajes compuestos** (sección 3.1):
   - Ejecutar las acciones en orden. Las de solo-lectura (`estado`, `pedidos`, `backup`, `resumen`)
     encadenan. La primera acción **interactiva** (abrir/cerrar caja, entrar a un sub-menú) ejecuta
     y **corta la cadena** (lo que sigue se descarta).

4. **Acción "Estado del día"** (nueva): snapshot liviano de hoy SIN reenviar fotos
   (apertura/cierre/diferencia por caja, foto MP sí/no, nº de pedidos activos). Reutilizá datos de
   `src/db/queries/caja.js` y `pedidos.js`. Formato en el spec, sección 4.1. Es distinta del resumen
   completo de `src/flows/resumen.js` (ese sí reenvía fotos).

5. **Avisos automáticos nuevos** (sección 5):
   - **Caja abierta en vivo**: al completar la última caja en `src/flows/caja.js`, avisar al admin
     (saltar si quien abrió es el admin).
   - **Caja cerrada en vivo**: ídem al completar el cierre en `src/flows/cierre.js`.
   - **Nadie abrió la caja**: nuevo cron en `src/cron/tareas.js` a
     `HORA_APERTURA + APERTURA_AVISAR_ADMIN_MIN`; si no hay apertura de Caja 1 hoy, avisar al admin
     (espejo de `avisarAdminCierre`). Agregá `APERTURA_AVISAR_ADMIN_MIN=30` a `.env` y `.env.example`,
     y a las variables obligatorias que valida `src/bot/index.js`.
   - **Pedido nuevo con detalle**: mejorar el aviso en `src/flows/pedido.js` para incluir cliente,
     ítems y total en un solo mensaje (formato en el spec).

6. **Ruteo** (`src/handlers/messageHandler.js`): mantené la prioridad — primero flujo activo
   (incluido el menú admin), después parseo de acciones por palabra clave, después menú por defecto.
   El texto no reconocido del admin ahora muestra el menú (antes era silencio).

## Cómo trabajar
- Avanzá por partes y verificá con `node --check` cada archivo que toques.
- El binario nativo de `better-sqlite3` es de Windows: **no se puede correr el bot completo en un
  entorno Linux**. Para la lógica nueva, escribí una **simulación** con una DB SQLite temporal y un
  cliente de WhatsApp falso (sin red), como ya se hizo en las fases anteriores (ver PROGRESO.md):
  probá el parser de intenciones, los mensajes compuestos, el corte de cadena en acciones
  interactivas, el estado del día y cada aviso nuevo.
- Cuando termines, **actualizá `PROGRESO.md`** con una sección nueva que describa lo construido,
  cómo probarlo en la PC de Bruno, y cualquier gotcha. Dejá una tabla de comandos/atajos del admin.
- No completes números de teléfono ni cargues catálogo: eso lo hace Bruno.

Empezá leyendo `COMPORTAMIENTO-ADMIN.md` y `PROGRESO.md`, y proponé un plan breve antes de codear.
