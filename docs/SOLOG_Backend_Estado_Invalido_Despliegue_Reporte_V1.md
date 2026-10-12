# SOLOG — Bloque C: despliegue de exclusión de Inválido — reporte V1

**Fecha:** 2026-10-12. **Proyecto:** Supabase PuertoRicoOnline (`fvtohxvcvsflzmftgfzs`). **Rama documental:** `admin-work`.

**Fuente primaria vigente:** `docs/SOLOG_Backend_Estado_Invalido_Filtros_Consumidores_V1.md`. Este reporte registra despliegue/evidencia y no modifica decisiones congeladas.

## Desplegado
- C.1: `public.rpc_solog_details_v2`: filtros SQL `cd.estado_diferencia <> 'Inválido'` antes de paginación del historial, en consulta por ID y en la cronología asociada. Rama `export` inalterada.
- C.2: `public.rpc_solog_cashier_history_v2`: filtro antes del agregado del historial propio del Cajero.
- C.3: `public.rpc_solog_control_export_v2`: filtro en CTE `base`, pues el KPI `total` contaba todas las filas de `normalized` (incluidas potencialmente las inválidas). Así, no aparecen en el total.
- Comprobado por SQL: `solog_control_groups_v10` ya usa una allowlist de los cuatro estados visibles; `solog_daily_detail_bootstrap_v1` también; `solog_daily_detail_page_v1` valida explícitamente `v_state` contra esa lista. Sin cambios.
- `solog_control_chronology_view_v1`: CTE fuente puede contener inválidos, pero las filas funcionales observadas se construyen mediante ramas de estados específicos. No se modificó sin una exposición pública demostrada. Requiere revisión de test con fixture si se busca garantía completa.

## Respaldos y migraciones

- `docs/backend/SOLOG_Backend_Estado_Invalido_RPC_PreCambio_V1.sql`: versiones originales Detalles y Cajero.
- `docs/backend/SOLOG_Backend_Estado_Invalido_ControlExport_PreCambio_V1.sql`: versión original exportación Control.
- Migraciones aplicadas mediante Supabase: `solog_backend_estado_invalido_filtros_consumidores_v1` y `solog_backend_estado_invalido_control_export_v1`.

## Evidencia verificada en remoto

- Las tres RPC siguen `SECURITY DEFINER`, con las mismas firmas.
- Conteo de predicados en código desplegado: Detalles 3, Historial Cajero 1, Exportación Control 1.
- Privilegios de ejecución comprobados: `authenticated=true`, `anon=false` para las tres RPC.
- Datos sin cambios: 1 399 registros de conteos; 0 en estado `Inválido` al verificar.
- No se añadieron triggers, permisos, tablas ni mecanismos de trazabilidad.

## Pendientes de validación

- No hay un registro `Inválido` actual para comprobar su exclusión end-to-end; validación negativa con fixture controlada pendiente.
- No se ejecutaron RPCs como un Cajero/Admin autenticado ni smoke humano de UI; no afirmar que están superados.
- Comprobar, mediante smoke de Detalles y Control Export, formato JSON, cursores y recuentos reales. El despliegue del código SQL sí está confirmado.
