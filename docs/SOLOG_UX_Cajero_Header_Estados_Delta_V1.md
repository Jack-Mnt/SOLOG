# SOLOG — UX Cajero — Header, cobertura y diagnóstico — Delta V1

**Estado:** D1 IMPLEMENTADA EN `admin-work`, VALIDACIÓN TÉCNICA/SMOKE PENDIENTES; D2 BLOQUEADA POR CONTRATO DE SEDE NO EXPUESTO.
**Fecha:** 2026-10-28.
**Nivel:** A (textos/icono), B acotado (diagnóstico excepcional), C pendiente para `PR [sede]` por depender de backend.
**Fuente primaria prevalente del bloque:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.
**Alcance de este delta:** reemplaza solamente textos de presentación y la composición de diagnóstico/header descritas aquí; no reabre KPI, prioridades, outbox, idempotencia, reconteos, sesiones, recovery, finalización ni el backend Full vigente.
**Rama:** `admin-work`; sin modificaciones de `master`.

## 1. Decisiones UX aprobadas

1. Cobertura: **«por contar»** cuando se expresa trabajo de conteo; el descriptor antes «pendientes de confirmar» se sustituye específicamente por **«grupos pendientes»** (ej. 476 grupos pendientes).
2. KPI Revisar: **«por recontar»**, con la etiqueta **Revisar** conservada.
3. KPI Stock 0, Stock negativo y Conteo diario: **«por contar»**.
4. KPI **«Pendientes de registro»** y su botón **«Registrar conteo»** se mantienen sin cambios.
5. Header Full: quitar icono de base de datos del botón de estado; conservar únicamente el punto verde/rojo y el popover informativo accesible.
6. Eliminar la tarjeta de diagnóstico/test para borradores normales de Inicio. **No eliminar la persistencia ni las operaciones de recuperación o descarte seguro**, ya que un envío incierto/rechazo/orfandad podría dejar un conteo bloqueado. Esas acciones solo aparecen bajo un acceso compacto y desplegable «Registros que requieren atención» cuando hay operaciones pendientes, rechazos o borradores de otras sesiones.

## 2. Implementación D1 en frontend

- `src/features/solog/cajero/full.home.tsx`: sufijos contextuales, descripciones accesibles y resumen «grupos pendientes».
- `src/features/solog/cajero/full.app.tsx`: estado de inventario solo con punto; elimina la tarjeta siempre visible, usa `issueRequiresAttention` para mostrar `<details>` de incidencias únicamente en casos anómalos. Permite reintento, exportación de diagnóstico y descartes ya permitidos por `FullRuntime`; no modifica su lógica.
- `src/features/solog/cajero/full.css`: estilo local compacto de diagnóstico excepcional con tokens existentes.
- `tests/cajero-full.browser.mjs`: actualiza aserciones de Chrome para expansión de incidencias, ausencia de banner en un borrador normal, punto sin SVG y terminología de KPI. No modifica fixtures backend ni flujos operativos.

**Riesgo mitigado:** la eliminación literal y total de acciones de diagnóstico habría eliminado el único acceso UI al descarte de operaciones definitivamente rechazadas y a reintentos inciertos. El acceso excepcional preserva la recuperación sin contaminar Inicio durante el conteo habitual.

## 3. Header «PR [sede]» — preflight D2, todavía NO implementado

- Se verificó la ruta frontend `src/protected-app.tsx` → `CajeroApp` → `FullCashierPanel`: solo se entrega `userId`, no el nombre de sede.
- `public.rpc_solog_route_v2` entrega `identity.id/nombre/rol` y ruta, **no sede**.
- Contrato Full V6 `CASHIER_STATE` entrega `timezone/stock/session/groups/operational_summary/...`, **no sede ni identificador público seguro para inferirla**. El UI V4 histórico sí exponía `site.nombre`, pero su contrato no debe reactivarse ni mezclarse con Full.
- Supabase read-only verificó que `public.sedes(id uuid, nombre text)` existe, y `inventario.full_cashier_state_v2` ya recibe `p_site uuid` autorizado.
- **Propuesta mínima pendiente de aprobación:** añadir a la respuesta V6 exitosa `data.site = { id: uuid, nombre: string }` desde la sede autorizada en backend; mantener firma V6 y V7 intactas, validar el campo y renderizar `PR {site.nombre}` usando `.cajero-header__site`. Ninguna RPC extra ni lectura directa de tabla desde frontend. Backend debe desplegarse/validarse antes de editar el frontend dependiente.
- Si se aprueba este contrato se prepara delta backend específico, se aplica y verifica con ChatGPT, y luego se consume en frontend. **No se ha realizado ninguna mutación de Supabase**.

## 4. Validación y cierre

**Pendiente tras D1:** el usuario debe sincronizar `admin-work` sin perder cambios locales y ejecutar tests Bun dirigidos, lint, build, diff check y browser Chrome; confirmar visualmente que en el caso normal no aparece la tarjeta anterior. **No considerar verdes las validaciones aún no ejecutadas después de D1.**

Este delta no cierra P6 hasta la validación local y la definición/implementación aprobada de `PR [sede]`.
