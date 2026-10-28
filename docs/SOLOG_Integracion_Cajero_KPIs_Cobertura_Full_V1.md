# SOLOG — Integración Cajero — KPIs y cobertura Full V1

**Estado:** CONGELADO para definición funcional y contrato objetivo; **sin implementar ni desplegar**. Plan de ejecución pendiente de aprobación del usuario.
**Fecha:** 2026-10-27.
**Proyecto:** SOLOG. **Rama:** `admin-work`; `master` fuera de alcance.
**Clasificación:** Nivel C (lectura/consistencia backend) + B (frontend).
**Fuente primaria única de esta implementación:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.

## 1. Autoridad documental

1. **Este archivo prevalece** únicamente para KPIs/cobertura Full, sus estados A1/A2/B/C, su contrato aditivo y el ajuste explícito de Flujo Operativo en A2.
2. Para sesiones, idempotencia, recuperación, captura, finalización y prioridades **prevalecen el contrato Full V6/V7 realmente desplegado** y `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`; este bloque no los modifica.
3. Referencias visuales reutilizables: `src/features/solog/cajero/cajero.v4.ui.tsx`, `src/operational.css`, `src/features/solog/cajero/cajero.css`. Prototipo HTML V2 aprobado visualmente en conversación; es **referencia, no código de producción ni contrato**.
4. `docs/SOLOG_UI_Cajero_Inicio_Estados_A1_A2_B_C_Delta_V1.md` (histórico V4) y `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md` mantienen las decisiones UX no sustituidas; **este V1 sustituye la ausencia de Flujo Operativo en A2**, además de la fuente de KPI V4 y la semántica de progreso provisional V3.
5. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md` es referencia conceptual. Ante diferencias respecto al Motor Full desplegado (en particular prioridad), **prevalece Full desplegado** y se reporta la discrepancia, sin modificarla en este bloque.
6. `docs/SOLOG_Correccion_Cajero_KPIs_Finish_V1.md` es **histórico V3**: no reintroducir `cobertura_periodo`, cálculos o exclusiones de reconteos de V3.

## 2. Objetivo y restricciones

Restaurar la composición de Inicio de Cajero y sus indicadores de cobertura en Full, con información autoritativa de ronda y trabajo operativo, más progreso visual provisional de capturas locales. No trasladar al cajero el detalle de bloqueos internos.

**Fuera de alcance:** modificar V7 (`rpc_solog_cashier_mutate_v7`, payload, `affected_groups`, idempotencia, triggers), Motor, reglas de prioridad, duración de sesiones, snapshots, catálogos, RLS/roles, Admin, reconteos originales, Historial, recuperación/autocierre, limpieza global de CSS o `master`. No introducir nueva RPC pública, tabla de KPIs, job/cron o polling constante.

## 3. UX congelada: Inicio por estados

| Estado | Sesión | Cobertura oficial | Composición de Inicio |
|---|---|---|---|
| A1 | No | Pendiente | Inventario → tarjeta Cobertura quincenal N con anillo → **Flujo Operativo** → Apariencia |
| A2 | No | Completa | Inventario → cobertura completada compacta → **Flujo Operativo** → Revisar / Conteo diario → Apariencia |
| B | Sí | Pendiente | Inventario → cobertura con anillo → Stock 0 / Stock negativo → Revisar horizontal → Pendientes de registro → Apariencia |
| C | Sí | Completa | Inventario → cobertura completada compacta → Revisar / Conteo diario → Pendientes de registro → Apariencia |

- **A2 muestra siempre Flujo Operativo**, aun con cobertura completa. El componente explica Conteo → Revisar → Diario; no implica disponibilidad de captura ni genera navegación operativa sin autorización de sesión.
- Mantener header SOLOG y sede, indicador de inventario, botón Salir, barra inferior adaptativa, geometría de tarjetas y el anillo de cobertura del Cajero V4, tokens existentes y accesibilidad/responsive. No copiar implementación/contrato V4 en runtime Full.
- Antes de iniciar sesión, KPIs Revisar/Diario son informativos. Durante sesión, rutas, CTA y estado habilitado dependen exclusivamente de la prioridad/acciones Full de la sesión; la prioridad global del KPI no habilita una ruta.
- En A2 y C, “completada” depende de la **cobertura oficial**, nunca de sumar capturas provisionales. En A1 y B, el anillo puede incluir el avance provisional diferenciado visualmente.
- `Pendientes de registro` solo en sesión activa; `Registrar conteo` conserva el comportamiento Full actual.
- Stock 0 (warning) / Stock negativo (danger-soft): **solo en B**, usando `stock_theoretical` congelado y grupos de cobertura de la sesión. Reconteos excluidos. No calcular desde inventario global ni desde un snapshot posterior.
- Categorías y modal: mantener Tipo → Categoría → Grupo, y el progreso **de cola actual** (`n/N contados` según los grupos actualmente presentados y sus drafts). Se admite que el denominador disminuya después de registrar y refrescar Full; no construir un universo histórico adicional.
- Si el universo oficial es cero, mostrar estado vacío explícito `Sin grupos para esta ronda` y 0 % como presentación segura: no simular 100 % ni habilitar acciones. Su manejo exacto se somete a validación UX dirigida.

## 4. Fuente autoritativa y denominador

- `full_temporal_context_v1(p_now)` es autoridad de ronda/turno Full en `America/Lima`. Ventanas `[round_starts_at, round_ends_at)`.
- Universo KPI: filas de `inventario.estado_stock_grupo` de la sede autorizada con `activo=true`; **incluye `requiere_snapshot_completo=true`**. No se habilita captura para estos grupos ni se modifica `full_group_actions_v1`.
- Grupo oficialmente cubierto cuando `ultima_observacion_fisica_at` cae en la ronda vigente, independientemente de conteo normal, diario o reconteo confirmado. No utilizar hora de recepción.
- `coverage_total = counted + pending`; deduplicación de `(sede_id, grupo_conteo_id)` por PK; `coverage_percent` 1 decimal sobre la **ronda activa**. No 0–200 %.
- Colas globales y `next_action`: respetar la clasificación/resolución de **Full desplegado**, usando `full_group_actions_v1` y clasificación de prioridad vigente; no recrear reglas con la precedencia conceptual histórica.
- No exponer en la UI un KPI `Cobertura bloqueada` ni desglose de restricciones. Los pendientes no disponibles siguen sumando en `coverage_pending`.

## 5. Contrato aditivo objetivo (NO desplegado)

**Entrada:** `public.rpc_solog_cashier_bootstrap_v6(p_payload jsonb)`, sin cambio de firma ni autenticación. **Salida existente:** envelope V6 `CASHIER_STATE`, con `server_now` y campos previos intactos.

Añadir a `data` de cada `CASHIER_STATE` exitoso, siempre presente (sin `null`):

```ts
operational_summary: {
  basis: {
    coverage_round: 1 | 2;
    round_starts_at: string;  // timestamptz ISO UTC
    round_ends_at: string;    // timestamptz ISO UTC, límite exclusivo
  };
  coverage_total: number;    // entero >= 0
  coverage_counted: number;  // entero >= 0 y <= total
  coverage_pending: number;  // total - counted
  coverage_percent: number;  // 0..100; 1 decimal; total=0 -> 0
  review_pending: number;    // entero >= 0; casos accionables
  daily_pending: number;     // entero >= 0; cola Full
  next_action: 'coverage' | 'review' | 'daily' | 'none';
};
```

En cada elemento de `data.groups[]` del `CASHIER_STATE` (cuando hay sesión activa), añadir:

```ts
coverage_pending_round: boolean; // grupo del universo actual sin observación válida en ronda actual
```

- Sin sesión: `groups=[]`, resumen global presente.
- La bandera se calcula **a fecha de la ronda actual** y no sustituye `action`, `priority_class` ni la elegibilidad congelada.
- La bandera aplica a los grupos de la sesión activos o no habilitados en ese instante, siempre que pertenezcan al universo actual; para grupo fuera del universo, `false`.
- No incluir obligatoriamente el booleano en `V7.affected_groups`. Evitar forzar cambio a tipos de mutación; separar la variante V6 enriquecida en el cliente si es necesario.
- En errores V6 se conserva el envelope existente, no se fabrican KPIs.
- No añadir permisos `EXECUTE` públicos ni acceso directo a `inventario`.

**Consistencia:** incorporar una única función privada `inventario.full_cashier_kpi_projection_v1(p_site uuid, p_session uuid, p_now timestamptz)` de lectura, de tipo `STABLE` donde proceda, que proyecte **resumen y grupos enriquecidos desde un mismo statement SQL/snapshot y el mismo `p_now`**. Integrarla en `full_cashier_state_v2` dentro del dispatcher V6. Evitar dos SELECT separados de resumen y banderas, consultas frontend independientes, locks extensos y persistencia adicional. Revisar el plan de ejecución antes de añadir índices.

## 6. Progreso provisional del frontend

- `coverage_percent` y `coverage_counted` remotos significan **solo cobertura oficialmente confirmada**.
- Proyección visual B (aprobada): `display_counted = min(coverage_total, coverage_counted + provisional_unique)`; anillo desglosa **azul confirmado** y **ámbar provisional**. Etiquetar cantidades de modo entendible. `display_percent` se calcula con 1 decimal.
- `provisional_unique`: grupos únicos con draft vigente de la sesión **activa**, identificados por `group_id`, con `coverage_pending_round=true`, `countedAt` en la ventana de ronda y no confirmados/rechazados definitivamente. Incluye reconteos si cumplen las condiciones. No incluir drafts de sesiones en recovery o de otros usuarios/dispositivos.
- Una operación incierta sigue siendo provisional hasta reconciliación; nunca marcarla oficialmente confirmada. Tras una confirmación o `finish`, conciliar/actualizar V6 antes de publicar KPIs derivados del nuevo estado; evitar mezclar banderas/summary viejos con delta V7 nuevo.
- Nunca declarar **cobertura completada** desde `display_counted`, `display_percent` o un draft: solo `coverage_pending===0` del resumen autoritativo (con tratamiento vacío cuando `total=0`).

## 7. Temporalidad, concurrencia e invalidación

- `p_now`/ `server_now` de la misma operación V6: mismo origen temporal; no usar reloj local para calcular ronda o cobertura.
- Toda respuesta V6 debe tener `round_starts_at <= server_now < round_ends_at`; ante cambio de ronda, invalidar toda la proyección previa y solicitar V6 nuevo.
- Frente a V7 concurrente: el mismo V6 ve la operación confirmada o no la ve; **resumen y banderas nunca deben mezclar dos snapshots de datos**. El siguiente refresh reconcilia.
- Observación tardía con `contado_at` de ronda anterior se acredita en su ventana original, no en la nueva. Mantener triggers existentes que preservan la última fecha física.
- En el cliente: programar refresh de ronda basado en `round_ends_at` + reloj de servidor confiable; continuar refresh existentes por foco, reconexión, operación y storage. Sin polling constante; en offline/refresh fallido la cobertura vieja queda invalidada, sin mostrarla como vigente.
- Ningún KPI altera expiración, recovery, `finish`, outbox, `navigator.locks`, prioridades, autorizaciones ni persistencia de drafts.

## 8. Plan de ejecución PROPUESTO (aún no aprobado)

**P0 — Baseline / bloqueo documental (solo lectura).** ChatGPT verifica esquema/contrato remoto y migraciones disponibles. Codex más adelante confirma baseline del frontend y dependencias en repositorio. Informar sobre migraciones remotas Full no reflejadas en `supabase/migrations`; reconciliar la trazabilidad **antes de desplegar nuevos cambios** sin reconstruir producción ni sobrescribir historial.

**P1 — Backend, diseño SQL y test sintético.** ChatGPT prepara la proyección única, prueba invariantes, ronda exacta, denominador con `requiere_snapshot_completo`, observaciones tardías, concurrencia a nivel de transacción, plan de ejecución y seguridad. Preferir entorno aislado; para tests con escritura, rollback verificado. No crear datos permanentes ni alterar sesiones reales. No desplegar ante bloqueos.

**P2 — Backend, despliegue y contrato congelado.** ChatGPT aplica migración aditiva controlada, valida funciones, autorización, JSON completo V6, performance/egress y que V7 siga idéntico; documenta contrato real y evidencia. **Barrera:** no enviar frontend a implementación antes de este paso.

**P3 — Codex, baseline + plan frontend, sin implementar.** En `admin-work` inspeccionar el alcance, guardar HEAD, working tree, cambios preexistentes, validaciones iniciales y proponer fases con archivos/tests. Esperar aprobación explícita del usuario.

**P4 — Frontend, contrato y proyección.** Codex incorpora tipos y validación V6, estado de sincronización, avance provisional deduplicado, invalidación por ronda, tests unitarios/contrato/errores y conservación de V7.

**P5 — Frontend, composición UX.** Codex restaura tarjetas, anillo, flujo A1 **y A2**, KPIs A/B/C, accesibilidad y responsive mediante componentes/clases preexistentes; sin reescrituras globales.

**P6 — Validación y cierre.** Tests dirigidos y globales relevantes, `bun test`, `bun run lint`, `bun run build`, `git diff --check`, pruebas navegador de A1/A2/B/C, frontera exacta de ronda, transición de borrador a confirmado, fallo de bootstrap, cero grupos, prioridad sin ruta y responsive. Smoke humano Preview y cierre explícito solo tras aceptación y evidencias.

## 9. Criterios de aceptación / bloqueos

1. V6 es autoritativo, aditivo y mantiene las entradas existentes; V7 no cambia.
2. Resumen y flags comparten snapshot y ronda aun ante carreras; valores coherentes y sin exposición de datos de otras sedes.
3. Los grupos con compuerta de snapshot entran al total, pero no se habilitan para contar.
4. A2 exhibe **Flujo Operativo** junto a cobertura completada, Revisar y Conteo diario.
5. La proyección provisional es distinta de la confirmada, evita doble conteo y no desbloquea flujos.
6. Se mantienen sesiones, drafts, recovery, reconteos, prioridad, inicio HH:59–HH+1:02, finalización y navegación Full.
7. No considerar validada una carrera/entorno real que no se haya probado. Ante incompatibilidad contractual o migraciones faltantes, detenerse, informar bloqueo y recomendar el cambio mínimo; no rediseñar automáticamente.
8. Cambios nuevos fuera del alcance van a backlog. Cierre solo tras validación frontend/backend y smoke humano.

**Estado de documentos previos:** este V1 prevalece para el nuevo bloque Full; documentos V4/V3 citados son históricos para KPI y control de cobertura, vigentes solamente en decisiones UX que este V1 no sustituye.
