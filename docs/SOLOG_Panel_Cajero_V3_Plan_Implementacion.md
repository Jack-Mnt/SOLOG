# SOLOG — Panel Cajero V3
## Plan de implementación aprobado

## Objetivo general

Implementar el Panel Cajero V3 mediante un flujo simple y predecible:

```text
sessionStorage → buffer local → lote → Supabase
```

La especificación `SOLOG_Panel_Cajero_V3_Especificacion_Implementacion.md` es la fuente de verdad. Este documento define únicamente el orden de ejecución aprobado.

## Estructura final

```text
src/features/solog/cajero/
├── Cajero.tsx
├── cajero.inicio.tsx
├── cajero.conteo.tsx
├── cajero.seguimiento.tsx
├── cajero.historial.tsx
├── cajero.header.tsx
├── cajero.table.tsx
├── cajero.session.ts
├── cajero.types.ts
├── cajero.api.ts
├── cajero.storage.ts
└── cajero.utils.ts
```

La integración afectará además `App.tsx`, `router.ts`, `types.ts`, `api.ts`, `errors.ts` y `styles.css`. `DevicePendingPage.tsx` se conserva. El Home y Conteo V2, junto con `src/features/solog/count/`, se retirarán cuando queden sin consumidores.

## Fases aprobadas

### Fase 1 — Contratos y motor local V3

**Objetivo:** disponer de contratos exactos y un buffer local fiable.

**Cambios principales:**

- Crear tipos, API, almacenamiento y utilidades V3.
- Implementar `sessionStorage`, UUID estable e aislamiento de contexto.
- Procesar individualmente guardados, duplicados y rechazados.
- Soportar lotes mixtos y umbrales 40/80.
- Completar los errores V3 necesarios.

**Dependencias:** ninguna.

**Validaciones:** aislamiento; restauración tras refresh; UUID estable; lote mixto; umbrales; respuesta parcial; conservación de rechazados; eliminación de `guardado` y `ya_guardado`.

**Finalización:** el buffer genera payloads V3 válidos, sobrevive al refresh y nunca elimina observaciones no confirmadas.

### Fase 2 — Shell, rutas y ciclo de sesión

**Objetivo:** activar el workspace `/cajero/*` y coordinar su sesión operativa.

**Cambios principales:**

- Crear `Cajero`, header y navegación persistente.
- Incorporar Inicio, Conteo, Por verificar e Historial.
- Integrar inicio/reanudación, vencimiento, actualización de stock e inactividad.
- Mantener `/device-pending` y redirigir `/count` con reemplazo.

**Dependencias:** Fase 1.

**Validaciones:** rutas directas; atrás/adelante; dispositivo pendiente o revocado; sin snapshot; sesión activa; expiración; inactividad; `focus` y `visibilitychange`; ausencia de polling.

**Finalización:** todos los estados de acceso y sesión enrutan correctamente y los bloqueos operativos preservan el buffer.

### Fase 3 — Inicio y Conteo base

**Objetivo:** completar Inicio, categorías, Stock 0 y Stock negativo.

**Cambios principales:**

- Mostrar cobertura diaria, quincenal y progreso por categoría.
- Implementar tabla compartida de captura.
- Mostrar Stock TumiSoft y previsualizar diferencia y valorización.
- Implementar Enter al siguiente campo y persistencia local inmediata.

**Dependencias:** Fases 1 y 2.

**Validaciones:** categorías; Stock 0; Stock negativo; entero mayor o igual a cero; Enter; cálculos; refresh sin pérdida; navegación con menos de 40 sin envío.

**Finalización:** las tres vistas generan observaciones restaurables y solo transmiten por lote.

### Fase 4 — Por verificar e Historial

**Objetivo:** completar seguimiento operativo e historial Hoy/Ayer.

**Cambios principales:**

- Ordenar Por verificar por prioridad y antigüedad.
- Traducir motivos a terminología operativa.
- Incorporar origen y tipo de observación al buffer.
- Integrar reconteos en `save_batch`.
- Implementar historial sin acumulación de diferencias.

**Dependencias:** Fases 1 a 3.

**Validaciones:** orden; motivos; seguimiento; reconteo con origen; lote mixto; historial Hoy/Ayer; diferencias independientes.

**Finalización:** seguimiento, reconteo e historial cumplen los contratos V3 sin exponer complejidad administrativa.

### Fase 5 — Corte definitivo y limpieza

**Objetivo:** retirar el flujo V2 y realizar la validación global única.

**Cambios principales:**

- Eliminar páginas, tipos, funciones y estilos V2 sin consumidores.
- Confirmar que Administración, Login y Home público permanecen intactos.
- Auditar rutas, llamadas RPC y bundle.

**Dependencias:** todas las fases anteriores.

**Validaciones:** TypeScript; ESLint; build; escenarios funcionales completos; cero referencias V2; regresión de Auth, Admin y Home público.

**Finalización:** no quedan consumidores de `/count`, cola V2, guardado por vista ni reconteo inmediato.

## Ajustes obligatorios aprobados

1. El buffer de `cajero.storage.ts` queda aislado por usuario, sede, dispositivo y `conteo_id`. Un cambio en cualquier identificador impide reutilizar observaciones incompatibles.
2. La frescura de Stock TumiSoft se comprueba exclusivamente en bootstrap, entrada a una vista, `focus`, `visibilitychange` y antes de envíos manuales o automáticos. No se usa `setInterval`, polling, workers ni consulta continua equivalente.
3. Conteo base, Stock 0 y Stock negativo usan preferentemente `tipo_observacion: "auto"`; el backend determina si corresponde a base o seguimiento.
4. `tipo_observacion: "reconteo"` se usa únicamente en un reconteo real con `observacion_origen_id` válido proporcionado por backend.
