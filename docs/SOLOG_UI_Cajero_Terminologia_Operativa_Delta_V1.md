# SOLOG — UI Cajero — Terminología Operativa — Delta V1

**Estado:** CONGELADO — DECISIÓN APROBADA
**Fecha:** 7 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel B — UX/UI frontend Cajero
**Rama:** `admin-work`

---

## 1. Alcance y precedencia

Este delta congela exclusivamente la Fase 2.6 — inventario y normalización de terminología del Cajero.

Para este alcance prevalece sobre:

- `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
- `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`

Los deltas específicos de las fases anteriores permanecen vigentes salvo las sustituciones terminológicas expresamente indicadas aquí.

No modifica backend, Supabase, Motor V4, contratos públicos, estados de negocio, routing, persistencia ni semántica de acciones.

---

## 2. Términos que se mantienen

Se mantienen:

- `Stock TumiSoft`;
- `Conteo`;
- `Conteo diario`;
- `Revisar`;
- `Registrar conteo`;
- `Pendientes de registro`;
- `Diferencia actual`;
- `Productos incluidos`;
- `Finalizar conteo`;
- `Registra la realidad` en Conteo y Conteo diario.

---

## 3. Historial

El término `Observación` queda reservado para la futura nota añadida por el cajero.

Por tanto, Historial deja de usar `observación/observaciones` como sinónimo de conteo registrado.

Sustituciones:

```text
observación / observaciones
→
registro / registros
```

```text
No hay observaciones para hoy/ayer.
→
No hay registros para hoy/ayer.
```

```text
No hay observaciones en esta categoría.
→
No hay registros en esta categoría.
```

```text
El historial muestra únicamente capturas confirmadas por SOLOG.
→
El historial muestra únicamente conteos registrados en SOLOG.
```

---

## 4. Revisar

Se adopta:

```text
Última diferencia
→
Diferencia inicial
```

Se mantiene:

```text
Diferencia actual
```

La misma terminología se aplica a:

- cabecera de la tabla;
- detalle dentro del modal;
- filtro accesible;
- etiquetas accesibles de cada fila.

El subtítulo de Revisar pasa de:

```text
Registra la realidad
→
Verifica la realidad
```

Conteo y Conteo diario conservan `Registra la realidad`.

---

## 5. Flujo operativo

La etapa:

```text
Diario
→
Conteo diario
```

usa el mismo nombre que el módulo y la navegación.

---

## 6. Inventario

En Inicio:

```text
Inventario disponible
→
Inventario cargado
```

```text
No hay un inventario disponible
→
No hay inventario cargado
```

En el indicador de vigencia del header:

```text
Stock vencido
→
Stock desactualizado
```

No se rediseña el indicador ni se cambian los demás estados visuales en esta fase.

---

## 7. Registro y recuperación

El copy visible deja de usar `envío` como nombre de la acción de usuario.

Familia aprobada:

```text
último envío
→ último registro

El envío necesita revisión.
→ El registro necesita revisión.

Envío pendiente
→ Registro pendiente

Reintentar envío
→ Reintentar registro

conteos pendientes de envío
→ conteos pendientes de registro
```

Los nombres internos de funciones, variables y protocolos pueden conservar `send/delivery`; este delta afecta solo copy visible.

---

## 8. Mensajes técnicos

Se elimina jargon interno innecesario del feedback al cajero, sin alterar códigos ni políticas.

Sustituciones aprobadas incluyen:

```text
snapshot confirmado
→ inventario recibido / actualización del inventario
```

```text
revisión de grupos
→ lista de grupos
```

```text
entregar pendientes
→ registrar conteos pendientes
```

Los mensajes visibles de conflicto dejan de pedir al cajero conservar un `identificador`; la idempotencia interna permanece sin cambios.

---

## 9. Fuera de alcance

No modificar:

- códigos de error;
- clasificación retryable/refresh/sessionInvalid;
- UUID/idempotencia;
- contratos de RPC;
- lógica de drafts;
- Motor V4;
- estructura visual;
- CSS general;
- responsive;
- implementación funcional de Observaciones.
