# Comportamiento del bot con Clientes y Empleados — Especificación

> Diseño acordado con Bruno. Hermano de `COMPORTAMIENTO-ADMIN.md`: reusa el mismo patrón de
> **menú numérico + atajos por palabras clave + mensajes compuestos** ya implementado para el
> admin (`src/flows/menuAdmin.js`, `src/utils/parserAdmin.js`, `src/flows/estadoDia.js`).
> Este doc define el comportamiento; la implementación es un paso posterior.

---

## PARTE A — EMPLEADOS

Hoy el empleado es mínimo: solo `ping` y los comandos de pedidos (`pedidos`, `listo <id>`,
`retirado <id>`), sin menú ni atajos. Pasa a tener **el mismo modelo que el admin**, pero con un
subconjunto de acciones (sin backup ni resumen completo, que son del admin).

### A.1 Principio
Mismo de siempre: el empleado **nunca tiene que recordar un comando**. Menú numérico para descubrir
+ atajos por palabra clave para ir rápido + soporte de mensajes compuestos ("hola, abrí la caja").
Lo ideal es **generalizar** el parser y el flujo de menú del admin a un módulo de "personal"
reutilizable (admin y empleado comparten motor, cambian solo las acciones habilitadas por rol).

### A.1.b Empleado activo del día — sin ritual de check-in
El bot guarda quién es el **empleado activo** del día (el que está a cargo ahora). **No** se deduce
del horario (cambia) **ni** hace falta un ritual de "llegué/me voy". Se define solo, por la acción:
- **Quien abre la caja queda como activo.** Abrir el local implica estar ahí: el que manda
  `abrí la caja` pasa a ser el empleado de turno de hoy, automáticamente.
- **Relevo (opcional).** Si más tarde queda otra persona a cargo, lo toma con un mensaje corto
  (`estoy` / `quedo yo`) o el **admin** lo reasigna a mano. Es opcional, no un trámite obligatorio.
- **El admin puede corregir** quién está activo (ej. `queda Juan`) si hace falta. (Capacidad nueva
  del admin — ver C.6.)
- **Reset diario:** un cron limpia el activo cada día (junto al backup / a la hora de apertura)
  para no arrastrar el de ayer.

Este "empleado activo" es lo que decide a quién le llegan los pedidos (A.6). La caja la abre/cierra
quien esté a cargo (A.5).

### A.1.c "¿Hasta qué hora te quedás?" — control de presencia
Apenas alguien queda como **empleado activo** (al abrir la caja o al tomar el relevo con `estoy`),
el bot le pregunta:

```
👋 Hola <nombre>, ¿hasta qué hora te quedás?
(respondé una hora, ej: 18:00)
```

Se guarda esa hora (`activo_hasta`). Sirve para:
- **Control/visibilidad:** el admin ve en el "estado del día" quién está y hasta cuándo
  (ej. "Activo: Juan, hasta 18:00").
- **Ruteo de pedidos (A.6):** pasada esa hora, el empleado deja de ser el activo → los pedidos
  nuevos vuelven al fallback (planilla + admin) hasta que alguien tome el relevo. Opcional: unos
  minutos antes de esa hora, el bot le pregunta "¿seguís vos o queda otro?" para no perder el hilo.

Si el empleado no contesta la hora, queda igual como activo pero **sin** `activo_hasta` (no expira
por hora; sigue activo hasta el reset diario o hasta que otro tome el relevo).

### A.2 Menú del empleado
Se dispara con `menu`, `hola`, `buenas`, `ayuda`, `?`, o cualquier texto no reconocido.

```
👋 Hola <nombre>, ¿qué hacés?

1️⃣  Estado del día
2️⃣  Pedidos activos
3️⃣  Caja (abrir / cerrar)

Respondé con el número, o escribime directo
(ej: "estado", "pedidos", "abrí caja").
```

(El relevo es opcional: si quedás vos sin haber abierto, escribí `estoy` / `quedo yo`.)

### A.3 Atajos por palabra clave (empleado)

| Si escribe (contiene)…                       | Acción                              |
|----------------------------------------------|-------------------------------------|
| `estado`, `cómo va`, `día`                   | Estado del día (mismo `estadoDia`)  |
| `pedidos`, `ped`                             | Lista de pedidos activos            |
| `listo <n>`, `retirado <n>`, `entregado <n>` | Marca ese pedido (ya existe)        |
| `abrir`, `abrí`, `apertura`                  | Abrir caja a pedido (A.5)           |
| `cerrar`, `cerrá`, `cierre`                  | Cerrar caja a pedido (A.5)          |
| `estoy`, `quedo yo`                          | Tomar el turno (relevo, opcional)   |
| `ya no estoy`, `me voy`, `salgo`, `termino mi turno` | Terminar el turno propio (nuevo) |
| `menu`, `hola`, `ayuda`, `?`                 | Menú del empleado                   |

**Mensajes compuestos (igual que el admin, sección 3.1 de `COMPORTAMIENTO-ADMIN.md`):** el
empleado puede mandar saludo + acción, o dos acciones, en un mismo mensaje. Ejemplos:
- `estoy, abrí la caja` → toma el turno y **abre la caja** (ignora el saludo).
- `hola, abrí la caja` → **abre la caja** (y al abrirla queda como activo, A.1.b).
- `mostrame el estado y los pedidos` → manda el **estado del día** y después la **lista de pedidos**.

Reglas: la cortesía se ignora si acompaña una acción; las acciones de solo-lectura encadenan; la
primera acción interactiva (abrir/cerrar caja) ejecuta y **corta la cadena** (lo que sigue se
descarta, porque tu próximo mensaje pertenece a ese flujo).

### A.4 Acciones de solo-lectura
- **Estado del día**: reutiliza `src/flows/estadoDia.js` tal cual (mismo snapshot que ve el admin).
- **Pedidos activos**: reutiliza `pedidoComandos.listarPedidos()`; el id se muestra siempre, se
  marca con `listo <n>` / `retirado <n>`.

### A.5 Abrir / cerrar caja a pedido
Sub-menú al elegir opción 3 (o atajo `abrir`/`cerrar`):

```
🏪 Caja — ¿qué hacés?
1️⃣  Abrir caja ahora
2️⃣  Cerrar caja ahora
Respondé el número, o "volver".
```

Arranca el flujo de apertura/cierre reusando `flows/caja.js` / `flows/cierre.js`. Guardas:
- Bloqueado si la caja ya está abierta/cerrada hoy (sin overwrite, igual que el cron).
- ✅ **Resuelto:** la abre/cierra **el empleado que esté a cargo**, sin chequear la planilla fija —
  así se adapta a los cambios de horario.
  - **Abrir** la puede mandar cualquier empleado; al hacerlo, **queda como el empleado activo del
    día** (A.1.b) y el bot le pregunta hasta qué hora se queda (A.1.c).
  - **Cerrar** lo hace el empleado activo (el que esté a cargo en ese momento).
  - El admin, como siempre, puede forzar apertura/cierre desde su propio menú.

### A.6 Aviso en vivo de pedido nuevo (a quien esté presente)
Hoy el aviso de pedido nuevo va **solo al admin**. Pasa a ir también a **quien esté presente**
en ese momento (A.1.b).

✅ **Resuelto:** ruteo **por empleado activo**, no por reloj ni planilla:
- Si hay un **empleado activo** (abrió la caja o tomó el relevo) y todavía no pasó su
  `activo_hasta` → el aviso va a él + admin.
- Si **nadie** quedó activo todavía, o ya pasó su hora de salida → **fallback a la planilla**: va a
  los empleados de turno de hoy (apertura y cierre, según `turnos`) + admin, para no perder el aviso.
- El **admin recibe el aviso siempre**, y si quien corresponde **es** el admin, no se duplica.

### A.7 Qué NO puede el empleado
Backup, resumen completo y los alias `test *` quedan **solo para el admin**. Si un empleado escribe
algo de eso, cae en "texto no reconocido" → menú del empleado.

---

## PARTE B — CLIENTES

Hoy el cliente funciona pero es rígido: registro → menú obligatorio (1 pedido / 2 técnico) →
escribe el pedido. Pasa a ser **directo y natural**: si escribe un pedido, se toma al toque, sin
obligar a pasar por el menú. El menú queda como ayuda opcional.

### B.1 Principio
El cliente escribe **como le sale**. El bot intenta entender la intención por palabras clave y por
el parser de pedidos propio (`src/utils/parserPedido.js`, sin IA). El menú 1/2 sigue existiendo
para quien no sabe qué hacer, pero **ya no es una barrera** para pedir.

### B.2 Primer contacto (sin cambios de fondo)
Número desconocido escribe por primera vez → se registra (nombre del perfil de WhatsApp si tiene
letras, o se lo pregunta). Después, bienvenida que **invita a pedir directo** y menciona los atajos:

```
¡Hola <nombre>! 🛒 Escribime tu pedido cuando quieras
(ej: "2 cocas y un pan") y te paso el total.
También podés escribir *precios* para ver el catálogo.
```

Si ese primer mensaje **ya era un pedido** ("hola, tienen 2 cocas?"), se intenta parsear y, si hay
productos, va directo a confirmación (B.4).

### B.3 Intenciones del cliente (atajos por palabra clave)
Para un cliente conocido **sin flujo activo**, el orden de chequeo es:

| Si el mensaje…                                        | Acción                                  |
|-------------------------------------------------------|-----------------------------------------|
| contiene `precios`, `catálogo`, `lista`, `qué tienen` | **Ver catálogo** con precios (B.6)      |
| contiene `mi pedido`, `está listo`, `listo?`, `estado`| **Consultar su último pedido** (B.7)    |
| contiene `lo de siempre`, `repetir`, `el de siempre`  | **Repetir último pedido** (B.8)         |
| contiene `cancelar`                                   | **Cancelar último pedido** (B.9)        |
| contiene `técnico`/`tecnico`                          | Responder "no disponible" (Fase 6)      |
| contiene `gracias`, `thank`                           | `¡De nada! 🙂` (no re-muestra menú)     |
| contiene `hola`, `buenas`, `menu`, `ayuda`            | Mostrar menú/ayuda                      |
| **parsea como pedido** (hay productos)                | Ir directo a confirmación (B.4)         |
| nada de lo anterior (charla casual)                   | **No responder** (igual que hoy)        |

> El orden importa: primero las intenciones explícitas, después el intento de parsear pedido, y al
> final el silencio para no spamear charla casual. Mantiene el arreglo actual de `pareceSaludo…` /
> `pareceAgradecimiento`.

### B.4 Pedir directo (el cambio central)
Si un cliente conocido escribe algo que `parsearPedido` reconoce, el bot salta el menú y va a
confirmación:

```
Esto entendí:
  2x Coca Cola — $2.400
  1x Pan — $600
Total: $3.000

¿Confirmás? Respondé *Sí* o *No*.
```

`Sí` → crea el pedido confirmado, avisa al admin (y al empleado de turno, A.6). `No` → "escribime
de nuevo tu pedido". (Igual que el flujo actual, pero alcanzable sin pasar por "1".)

### B.5 Menú (sigue existiendo, como ayuda)
Al escribir `menu`/`hola`/`ayuda`:

```
¡Hola <nombre>! ¿En qué te ayudo?
1) Hacer un pedido
2) Servicio técnico
(o escribime tu pedido directo, ej: "2 cocas y un pan")
```

### B.6 Ver catálogo / precios (nuevo)
`precios` → lista de productos activos con precio, desde `productosQueries.listarActivos()`:

```
🛒 Esto tenemos hoy:
• Coca Cola 1.5L — $1.200
• Pan — $600
• Jamón cocido (kg) — $8.000

Escribime tu pedido, ej: "2 cocas y medio kilo de jamón".
```
Si el catálogo está vacío: "Todavía no cargué el catálogo, probá más tarde".

### B.7 Consultar su pedido (nuevo)
`mi pedido` / `está listo?` → estado del **último** pedido del cliente (nueva query
`pedidos.buscarUltimoPorCliente`). Ej:
`Tu pedido #12 está *en preparación*. Te aviso cuando esté listo. 🛍️`
Si no tiene pedidos: "No te encuentro pedidos activos. ¿Querés hacer uno?".

### B.8 Repetir último pedido (nuevo)
`lo de siempre` / `repetir` → toma los ítems del último pedido y los **re-precia con el catálogo
actual**. Va a confirmación (B.4) mostrando el total actualizado.

✅ **Resuelto — precios cambiados:** si algún ítem cambió de precio respecto del pedido anterior,
el bot lo **avisa explícitamente** y muestra el total nuevo antes de pedir confirmación. Ej:

```
⚠️ Ojo, cambiaron algunos precios desde tu último pedido:
  2x Coca Cola — $2.600 (antes $2.400)
  1x Pan — $600 (igual)
Total ahora: $3.200

¿Confirmás así? Respondé *Sí*, o escribime un pedido distinto.
```
`Sí` confirma; cualquier pedido nuevo escrito reemplaza (vuelve a B.4). Si algún producto ya no
existe en el catálogo, lo saca y lo aclara. Si no hay pedido previo: "No tengo un pedido anterior
tuyo todavía".

### B.9 Cancelar pedido (nuevo)
`cancelar` → toma el último pedido **no retirado/cancelado** del cliente y pide confirmación:
`¿Cancelo tu pedido #12 (2x Coca, 1x Pan)? Respondé *Sí* o *No*.`
`Sí` → `pedidos.cambiarEstado(id, 'cancelado')` + avisar al admin/empleado de turno. Si ya está
`retirado` o no hay pedido cancelable: mensaje aclaratorio. No se puede cancelar lo ya retirado.

### B.10 Servicio técnico
Sigue respondiendo "no disponible por acá" (es Fase 6). Sin cambios.

---

## PARTE C — Infra compartida y notas

### C.1 Reutilización
- **Motor de menú + parser de intenciones**: generalizar `menuAdmin.js`/`parserAdmin.js` a algo tipo
  `flows/menuPersonal.js` + `utils/parserPersonal.js`, parametrizado por rol (admin vs empleado),
  para no duplicar la lógica de mensajes compuestos ni el ruteo numérico.
- **Estado del día**: `flows/estadoDia.js` ya existe y se reusa para el empleado sin cambios.
- **Pedidos**: `pedidoComandos.js` ya tiene listar/marcar; se reusa para empleado.

### C.2 Cambios de DB
- **Empleado activo del día** (A.1.b/A.1.c): guardar quién está activo y su `activo_hasta`. Lo más
  simple es una fila por día (ej. tabla `turno_activo`: `fecha`, `empleado_id`, `activo_desde`,
  `activo_hasta`) o columnas en `empleados` (`activo_hoy`, `activo_hasta`). Funciones:
  `setActivo(empleadoId, hasta)`, `getActivoDeHoy()`, reset diario.
- `pedidos.buscarUltimoPorCliente(clienteId)` — para B.7/B.8/B.9.
- Helper para re-preciar ítems de un pedido viejo contra el catálogo actual y **detectar qué
  precios cambiaron** (B.8): devuelve, por ítem, precio anterior vs. actual.

### C.3 Ruteo (`messageHandler.js`)
Prioridad sin cambios estructurales: flujo activo → (admin/empleado: parser de acciones; cliente:
intenciones B.3) → fallback (menú personal / silencio del cliente). El empleado entra al nuevo
motor de menú igual que el admin.

### C.4 Decisiones resueltas
1. **Empleado activo del día (A.1.b):** ✅ **sin ritual de check-in** — el que abre la caja queda
   activo; relevo opcional con `estoy`/`quedo yo`; el admin puede corregir; reset diario.
2. **Control de presencia (A.1.c):** ✅ al quedar activo, el bot pregunta **"¿hasta qué hora te
   quedás?"** y guarda `activo_hasta`; pasada esa hora, expira el activo.
3. **Quién maneja la caja (A.5):** ✅ **el que esté a cargo**, no la planilla — abrir lo manda
   cualquier empleado (y queda activo), cerrar lo hace el activo.
4. **Aviso de pedido nuevo (A.6):** ✅ **al empleado activo** (si no expiró su hora) + admin; si no
   hay activo o ya pasó su hora, fallback a los de turno de hoy según `turnos` + admin.
5. **Mensajes compuestos del empleado (A.3):** ✅ mismas reglas que el admin — `estoy, abrí la caja`
   funciona; cortesía se ignora, solo-lectura encadena, la acción interactiva corta la cadena.
6. **Repetir pedido con precios cambiados (B.8):** ✅ **re-preciar con el catálogo actual, avisar de
   los cambios** y mostrar el total nuevo; el cliente confirma o escribe un pedido distinto.

### C.5 Config
No hace falta ninguna variable nueva de horario: la presencia se setea en vivo, no por reloj.
(El reset diario de presencia puede colgarse del cron de backup o de la hora de apertura ya
existentes, sin config nueva.)

### C.6 Nota para `COMPORTAMIENTO-ADMIN.md` (capacidad nueva del admin)
El "empleado activo" agrega una capacidad al admin que conviene reflejar también en su spec: ver
**quién está activo y hasta qué hora**, y **reasignarlo** a mano (`queda Juan`, o una opción en su
menú). El "estado del día" (`estadoDia.js`) suma una línea: "Activo: Juan, hasta 18:00". Es el
único agregado del lado admin que sale de este rediseño.
