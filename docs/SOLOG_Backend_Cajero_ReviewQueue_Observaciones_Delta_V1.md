# SOLOG — Backend Cajero — Contexto de observaciones en review_queue — Delta V1

**Estado:** APROBADO, DESPLEGADO Y VALIDADO ESTRUCTURALMENTE; prueba de caso real con motivo previo PENDIENTE.
**Fecha:** 2026-10-15 (America/Lima).
**Clasificación:** Nivel C — contrato interno de lectura Cajero.
**Rama de documentación:** `admin-work`; `master` no fue modificado.
**Proyecto Supabase:** PuertoRicoOnline — `fvtohxvcvsflzmftgfzs`.

## 1. Fuente y precedencia

**Fuente primaria funcional:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.
**Backend ya desplegado:** `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md`.
**Delta frontend sin legacy vigente:** `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_SinLegacy_Delta_V1.md`.
**Prioridades y Motor vigentes:** `docs/SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md`.

Este delta concreta **únicamente** la necesidad de entregar el motivo y observación inicial durante un reconteo, detectada y aprobada en la exploración de Fase 3. No reemplaza prioridades ni exige una nueva versión de bootstrap.

## 2. Alcance desplegado

**Migración remota y repositorio:**

`supabase/migrations/20261015171315_solog_cashier_review_queue_observaciones_v1.sql`

**Única función modificada:**

`inventario.solog_cashier_panel_state_v4(p_conteo_id uuid, p_at timestamptz DEFAULT clock_timestamp()) RETURNS jsonb`

En el `jsonb_build_object` de **cada elemento** de `review_queue`, se agregaron exactamente:

```sql
'motivo_diferencia',cd.motivo_diferencia,
'observacion_diferencia',cd.observacion_diferencia,
```

Los campos se toman de `inventario.conteo_detalle cd` ya relacionado por `cd.id = sg.detalle_reconteo_id`. Se preservan:

- `grupo_id`, `detalle_id`, `ultima_diferencia`, `contado_at`, `priority_class`.
- Orden por prioridad / fecha de captura / detalle, filtros y cardinalidad.
- `kpis`, `next_action`, `coverage_queue`, `daily_queue`, `groups` y capacidades.
- `SECURITY INVOKER`, `search_path`, esquema privado y ACL originales.

La función existente `inventario.solog_cashier_panel_delta_v4` utiliza `v_state->'review_queue'`; por tanto **no se modificó** y entrega automáticamente el nuevo shape. Lo mismo ocurre en `rpc_solog_cashier_bootstrap_v4` al incorporar el panel.

No se agregan `observacion_reconteo` ni un motivo diferente a los eventos pendientes de reconteo: se presenta exclusivamente la información del conteo original.

## 3. Contrato JSON de `review_queue[]`

```json
{
  "grupo_id": "uuid",
  "detalle_id": "uuid",
  "ultima_diferencia": -12,
  "contado_at": "timestamptz",
  "priority_class": "review_regular",
  "motivo_diferencia": "Transferencia",
  "observacion_diferencia": "Trasladadas doce unidades"
}
```

Los últimos dos campos son **siempre claves presentes**; su valor es `null` si no fueron informados en el conteo original, especialmente en los registros históricos.

**Frontend Fase 3:**

1. Extender `CashierV4ReviewQueueItem` y `queues()` para validar los dos campos `string | null` de `review_queue`, sin cambiar el número de contrato de bootstrap/panel.
2. Mostrar de forma no editable el motivo previo cuando exista; cuando sea `null`, permitir incorporar un motivo durante reconteo.
3. Presentar `observacion_diferencia` solo como **contexto del conteo anterior**; no copiarla en `observacion_reconteo`.
4. Mantener un solo camino de escritura V5 en el producto final; esta lectura no crea ninguna compatibilidad dual permanente.
5. Respetar validaciones autoritativas de `rpc_solog_cashier_mutate_v5`; un motivo original existente se conserva, aunque el nuevo texto de reconteo sea independiente.

## 4. Preflight y validación

- SQL de migración remoto: **success**.
- `pg_proc`: misma firma y `search_path=''`; `security_definer=false` y `anon/authenticated` sin EXECUTE directo sobre la función interna.
- La tabla `inventario.conteo_detalle` conserva la protección por esquema privado/RLS; sin cambios de privilegios.
- **Prueba transaccional:** en una sesión existente se llamó a `solog_cashier_panel_state_v4` y `solog_cashier_panel_delta_v4`; ambos devolvieron `review_queue` de tipo array e idéntica representación; la transacción se revirtió.
- **Limitación E2E:** al ejecutar la migración había `0` grupos en `solog_session_runtime_groups` y ninguna sesión activa. Los `91` casos históricos elegibles por estado para futuro reconteo carecían de motivo/nota; por tanto no fue posible validar en lectura una fila **no nula** de `review_queue` con el camino operativo real.
- Advisors de seguridad consultados: los avisos existentes son de infraestructura compartida, sin un nuevo hallazgo referido a la función interna modificada. No se modificó seguridad para silenciarlos.

**Prueba pendiente antes del cierre global de Fase 3:** crear/reutilizar una sesión autorizada y snapshot válido en entorno seguro; guardar diferencia con motivo/observación vía V5, obtener reconteo elegible después del snapshot posterior y comprobar en `review_queue` ambos campos, además de comprobar la prohibición de modificar el motivo previo.

## 5. Fuera de alcance y estado

No se modificaron V5, Supabase Auth, RLS, tablas, triggers, Cron, Motor, prioridades, contratos del historial, interfaz frontend ni `master`.

**Backend para la Fase 3:** preparado y desplegado.
**Frontend de la Fase 3:** todavía no implementado.
**Validación de la presentación visual:** corresponde al smoke tras implementación.
