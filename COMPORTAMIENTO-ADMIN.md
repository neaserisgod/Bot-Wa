# Comportamiento del bot con el Admin — Especificación

> Diseño acordado con Bruno. Reemplaza el modelo actual de "comandos exactos de memoria"
> por **menú numérico + atajos por palabras clave + avisos automáticos**.
> Este doc define el comportamiento; la implementación es un paso posterior.

---

## 1. Principio de diseño

El admin **nunca debería tener que recordar un comando**. Dos caminos siempre disponibles:

1. **Menú numérico** (descubrir): escribe cualquier cosa, saludo, "menu" o "ayuda" → el bot
   muestra opciones numeradas → responde con un número.
2. **Atajos por palabras clave** (rápido): escribe libre y natural ("estado", "pedidos",
   "cerrá caja") → el bot interpreta por palabras clave, **sin IA**, igual que el parser de pedidos.

Los comandos viejos (`ping`, `test apertura`, etc.) **siguen funcionando** como alias ocultos
para no romper nada, pero ya no hace falta usarlos.

---

## 2. Menú principal

**Se dispara cuando el admin escribe:** `menu`, `hola`, `buenas`, `ayuda`, `?`, o **cualquier
texto que no matchee un atajo ni un flujo activo**. (Hoy, ese texto no reconocido no recibe
respuesta — cambia: ahora muestra el menú.)

```
👋 Hola Admin, ¿qué hacemos?

1️⃣  Estado del día
2️⃣  Pedidos activos
3️⃣  Caja (abrir / cerrar)
4️⃣  Backup y resumen

Respondé con el número, o escribime directo
(ej: "estado", "pedidos", "cerrá caja").
```

El admin responde con un número y entra a esa acción. Las opciones 3 y 4 abren un sub-menú
(ver abajo). La navegación del menú se persiste en `estados_conversacion` (mismo patrón que los
demás flujos), así que un "1" suelto se interpreta en contexto y sobrevive reinicios.
Escribir `volver` o `cancelar` en cualquier sub-menú vuelve atrás / limpia el estado.

---

## 3. Atajos por palabras clave (camino rápido, sin pasar por el menú)

| Si el admin escribe (contiene)…                  | El bot hace…                          |
|--------------------------------------------------|---------------------------------------|
| `estado`, `cómo va`, `como va el dia`, `día`     | **Estado del día** (sección 4.1)      |
| `pedidos`, `ped`                                 | **Lista de pedidos activos** (4.2)    |
| `ventas`, `ventas <n>` (ej. `ventas 10`)         | Últimas N ventas (cualquier estado, default 5) |
| `listo <n>`, `retirado <n>`, `entregado <n>`     | Marca ese pedido (ya existe)          |
| `abrir`, `abrí`, `apertura`, `abrir caja`        | Dispara la **apertura** de hoy (4.3)  |
| `cerrar`, `cerrá`, `cierre`, `cerrar caja`       | Dispara el **cierre** de hoy (4.3)    |
| `resumen`                                         | Resumen de hoy (4.4)                  |
| `resumen AAAA-MM-DD`                             | Resumen de ese día puntual            |
| `backup`                                          | Backup de la DB ahora (4.4)           |
| `queda <nombre>` (ej. `queda Juan`)              | Reasigna el **empleado activo** (4.1) |
| `estoy`, `quedo yo`                              | El admin también queda como activo del día |
| `ya no estoy`, `me voy`, `salgo`, `termino mi turno` | Termina el turno propio (si el admin estaba activo) |
| `menu`, `hola`, `ayuda`, `?`                      | Menú principal                        |

El admin tiene **todos** los atajos del empleado (`COMPORTAMIENTO-CLIENTES-EMPLEADOS.md` A.3)
además de los propios de esta tabla — es un superset, nunca un subconjunto.

Matching tolerante: minúsculas, sin acentos, por inclusión de palabra (no igualdad exacta),
reusando el mismo enfoque del parser de pedidos. Así "cerrá la caja por favor" o "quiero ver
los pedidos" caen bien.

---

## 3.1 Varios pedidos en un mismo mensaje (mensajes compuestos)

El admin puede mandar **un saludo + una acción**, o **dos acciones**, en el mismo mensaje, y el
bot ejecuta lo que corresponda. Ejemplos:

- `hola, abrí la caja` → ignora "hola", **abre la caja**.
- `mostrame el estado y los pedidos` → manda el **estado del día** y después la **lista de pedidos**.
- `buenas, hacé el backup y el resumen` → **backup** y luego **resumen**.

**Reglas (sin IA, por palabras clave):**

1. **Cortesía sola vs. cortesía + acción.** Palabras de cortesía (`hola`, `buenas`, `gracias`,
   `por favor`) se **ignoran** si vienen acompañadas de una acción real. Si el mensaje es **solo**
   cortesía, sigue mostrando el menú / saludo como antes.
2. **Detección en orden de aparición.** El bot busca todas las acciones-palabra-clave del mensaje
   (separando por comas, `y`, saltos de línea) y las ejecuta **de izquierda a derecha**, en el
   orden en que aparecen.
3. **Acciones de solo-lectura encadenan libre.** `estado`, `pedidos`, `backup`, `resumen` no
   abren ningún flujo interactivo → se pueden combinar todas las que quieras y el bot responde
   cada una.
4. **Una acción interactiva corta la cadena.** Si una acción **abre un flujo que espera tu
   respuesta** (abrir caja → pregunta el monto; cerrar caja → pide la foto de MP; entrar a un
   sub-menú), el bot la ejecuta y **frena ahí**: lo que sigue en el mismo mensaje se descarta,
   porque tu próximo mensaje ya pertenece a ese flujo. Así `abrí la caja y mostrame pedidos`
   abre la caja y queda esperando el monto (no mezcla la lista de pedidos en el medio).
5. **Acciones contradictorias.** Si mandás algo como `abrí y cerrá la caja`, se ejecutan en orden
   y cada una se autoprotege con sus condiciones (no se puede cerrar lo que no está abierto, etc.).
   No se intenta "adivinar" la intención.

**Limitación conocida (igual que con un solo comando):** el matching es por palabra clave, sin
entender negaciones. `no cierres la caja` contiene "cerrar" y dispararía el cierre. Es el mismo
riesgo que ya tiene el modelo de atajos; se asume a cambio de no usar IA.

---

## 4. Las cuatro acciones en detalle

### 4.1 Estado del día
Snapshot de hoy a demanda (versión liviana del resumen, **sin reenviar fotos**):

```
📊 Estado de hoy (lun 23/06):
Activo: Juan, hasta 18:00
Apertura: ✅ Admin · 10:05
  Caja 1: $5.000
  Caja 2: $3.000
Cierre:   ⏳ pendiente
Foto MP:  ⏳ pendiente
Pedidos activos: 2
```

Si ya cerró, muestra el cierre y la diferencia por caja. Si no abrió nada todavía, lo dice
("Hoy todavía no se registró apertura").

**Empleado activo (nuevo, ver `COMPORTAMIENTO-CLIENTES-EMPLEADOS.md` Parte A):** la línea
"Activo: ..." muestra quién está a cargo ahora y hasta qué hora dijo que se queda
(o "Activo: nadie" si no quedó nadie o ya pasó su hora). El admin puede **reasignarlo a mano**
con el atajo `queda <nombre>` (ej. `queda Juan`), sin pasar por ningún submenú.

### 4.2 Pedidos activos
Reusa lo actual, pero el id **siempre se muestra** (no hay que recordarlo):

```
📋 Pedidos activos:
#1 · Celia · $2.400 · confirmado
#2 · Juan · $1.200 · listo

Marcá uno con: listo <número>  /  retirado <número>
```

El admin responde `listo 1` o `retirado 2`. (Se mantiene el formato `<comando> <número>` para
evitar ambigüedad con la navegación numérica del menú.)

### 4.3 Caja (abrir / cerrar)
Sub-menú al elegir la opción 3 (o atajo directo `abrir`/`cerrar`):

```
🏪 Caja — ¿qué hacés?
1️⃣  Abrir caja ahora
2️⃣  Cerrar caja ahora

Respondé el número, o "volver".
```

Internamente es la lógica de `dispararApertura` / `dispararCierre` (hoy escondida tras
`test apertura`/`test cierre`). Mensajes de error claros si ya estaba abierta/cerrada hoy o
falta configurar el empleado de turno.

### 4.4 Backup y resumen
Sub-menú al elegir la opción 4:

```
🗄️ Backup y resumen:
1️⃣  Resumen de hoy
2️⃣  Resumen de otro día  (escribí "resumen 2026-06-20")
3️⃣  Backup de la base ahora

Respondé el número, o "volver".
```

"Resumen de hoy" = el resumen completo (con reenvío de fotos), igual que el de la noche.
"Backup" confirma con la ruta del archivo creado.

---

## 5. Avisos automáticos (el bot te escribe sin que preguntes)

### Los 3 que ya existen — se mantienen igual
- **Resumen diario** a `HORA_CIERRE + RESUMEN_OFFSET_MIN`.
- **Alerta de cierre no hecho** a `cierre + CIERRE_AVISAR_ADMIN_MIN` (no se autoavisa si el que
  cierra es el admin).
- **Aviso de pedido nuevo** (se mejora, ver abajo).

### Los 4 nuevos acordados
1. **Caja abierta en vivo** — apenas un empleado completa la apertura, le llega al admin:
   `🟢 Caja abierta por <nombre> — Caja 1 $5.000 · Caja 2 $3.000`.
   No se manda si quien abrió **es** el admin (ya lo sabe).
2. **Caja cerrada en vivo** — apenas se completa el cierre, el detalle al toque (hoy eso recién
   llega 90 min después en el resumen). Mismo criterio: no si quien cierra es el admin.
3. **Nadie abrió la caja** — nuevo cron a `HORA_APERTURA + APERTURA_AVISAR_ADMIN_MIN` (nueva
   variable en `.env`): si no hay apertura de la Caja 1 hoy, avisa al admin. Es el espejo de la
   alerta de cierre no hecho, que hoy no existe para la apertura.
4. **Pedido nuevo con detalle** — el aviso actual de pedido pasa a incluir cliente, ítems y
   total en el mismo mensaje:
   `🛒 Pedido nuevo #3 — Celia: 2x Coca Cola, 1x Pan · Total $2.400`.

**Nota de volumen:** los avisos 1–3 disparan una sola vez por día cada uno; el 4 ya existía.
El impacto sobre el rate-limit de WhatsApp es bajo.

---

## 6. Compatibilidad y casos borde

- **Comandos viejos siguen vivos:** `ping`→`pong`, `test apertura`, `test cierre`,
  `test cierre insistir`, `test cierre avisar`, `test resumen`, `test backup` quedan como alias
  ocultos. No se documentan en el menú pero funcionan.
- **Texto no reconocido:** ahora muestra el menú principal (antes: silencio).
- **Estado de menú colgado:** la navegación del menú usa `estados_conversacion` con el mismo
  timeout (`ESTADO_TIMEOUT_MIN`), así que un menú a medio responder se limpia solo.
- **Prioridad de ruteo en `messageHandler`:** primero flujo activo (incluido el menú admin),
  después se parsea el mensaje en busca de una o varias acciones por palabra clave (sección 3.1)
  y se ejecutan en orden, y si no hay ninguna, menú por defecto.

---

## 7. Cambios de configuración (`.env`)

| Variable nueva                 | Para qué                                          | Sugerido |
|--------------------------------|---------------------------------------------------|----------|
| `APERTURA_AVISAR_ADMIN_MIN`    | Minutos tras `HORA_APERTURA` para avisar "nadie abrió" | `30` |

El resto de las variables no cambia.
