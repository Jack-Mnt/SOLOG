# SOLOG — Integración frontend — Motivos y observaciones de diferencias — Plan V1

**Estado:** PROPUESTA DE PLAN — pendiente aprobación del usuario y baseline/plan técnico de Codex. **No autoriza implementación por sí solo.**  
**Fecha:** 14 de octubre de 2026.  
**Clasificación:** Nivel C por dependencia de mutaciones, recuperación e historial.  
**Repositorio:** `Jack-Mnt/SOLOG`. Rama de trabajo exclusiva: `admin-work`. No modificar `master`.  
**HEAD de inspección referencial:** `077231c88b5950689289389347cbe2c677dc45d1`; Codex establecerá el HEAD real antes de empezar.  
**Fuente primaria única (funcional y de integración):** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.

## 1. Jerarquía documental

La fuente primaria anterior prevalece en reglas de producto y UX ya aprobadas. Para el backend **realmente desplegado**, consultar:

- `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md` (contrato remoto de escritura V5 y lecturas aditivas V2, validaciones y E2E pendiente).
- `docs/SOLOG_Backend_Observaciones_Diferencias_Cronologia_Delta_V1.md` (prevalece solo en la representación de eventos Admin y la postergación de su composición visual).
- `docs/SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md` (prioridades/motor actuales, sin cambios).
- `docs/SOLOG_UX_Cajero_Proteccion_Captura_Sin_Guardar_V1.md` (D.1.4, guardia de ediciones, reversión y salida).
- `docs/SOLOG_UI_Cajero_Calculadora_Observacion_Visual_Delta_V1.md` (botón reservado; se habilitará sin alterar la composición congelada).

La fuente primaria aún dice «backend no desplegado» en su fotografía inicial; ese dato de estado **está superado** por el reporte de backend implementado. El estado real debe contrastarse con Supabase y las migraciones; no inferir que falta crear la RPC V5.

**Conflictos:** si un hallazgo técnico contradice la fuente primaria, detener la porción afectada, informar evidencia y proponer el delta mínimo. No reinterpretar ni rediseñar. La geometría final del popup Admin permanece exploratoria.

## 2. Puertas generales antes de implementar

1. **Baseline único de Codex, solo lectura:** confirmar `admin-work`, HEAD, working tree, modificaciones previas, módulos afectados, tests pertinentes, lint y build (según viabilidad del entorno); entregar plan técnico que respete estas cuatro fases; esperar aprobación.
2. **Backend:** V5 y lectores V2 aditivos desplegados, RLS sin acceso directo, V4 conservado. La verificación de escritura/reconteo autenticados E2E con una sesión y snapshot reales aún figura **pendiente**, por falta de fixtures recientes en el momento del despliegue. ChatGPT debe completar o documentar una validación equivalente segura **antes de habilitar el envío V5 en Cajero / aprobar el cierre de integración**. Codex no crea ni altera backend.
3. Preservar los drafts V4 locales, operaciones preparadas y recibos de reintento. Ninguna fase puede causar pérdida de datos, cambio de identidad o alteración de payload preparado.
4. Mantener `master` como producción V4; el corte V4→V5 se realiza en un bloque/decisión posterior, no implícitamente en este plan.

## 3. Fase 1 — RPC, API y persistencia (sin activar V5)

**Objetivo:** preparar la infraestructura frontend para comprender V4/V5, consumir el contrato V5 real y preservar recuperación.

**Alcance técnico:**

- Revisar tipos de `save_batch` y `recount_save_batch`, payloads y respuestas V5: motivos enumerados, textos y `null` explícitos, `contract_version=5` solo en mutaciones V5.
- Adaptar `cajero.v4.api.ts` para reconocer ambos endpoints: `rpc_solog_cashier_mutate_v4` y `rpc_solog_cashier_mutate_v5`. Bootstrap V4, historial Cajero V2 y las lecturas de Detalles/Admin V2 **no cambian arbitrariamente de versión**.
- Preparar coordinación de `cajero.v4.flush.ts`, `cajero.v4.storage.ts`, `cajero.v4.runtime.ts` y tipos para draft nuevo con motivo/textos; separar versión de protocolo de operación preparada. Mantener tolerancia de la persistencia histórica `version: 1` y sus shapes exactos.
- Enviar operaciones preparadas V4 por **V4**, con payload, `operation_id`, timestamps, recibos y replays intactos. Enviar nuevas operaciones V5 por **V5**, sin mezclar versiones en un lote. `start`/`finish` respetan el protocolo de la sesión o de la operación preparada y su namespace idempotente.
- Extender validadores de respuesta, `saved`, confirmación de cantidades/observaciones y errores de dominio conocidos; un recibo incierto no se reconstruye.
- **No cambiar aún el envío predeterminado ni activar la validación de ≥12** en la captura operativa hasta Fase 3. Fase 1 prepara una ruta inactiva/no expuesta; production/preview no debe quedar en estado híbrido.

**Archivos de interés, no inventario cerrado:** `src/features/solog/cajero/cajero.v4.ts`, `cajero.v4.api.ts`, `cajero.v4.flush.ts`, `cajero.v4.storage.ts`, `cajero.v4.runtime.ts` y tests V4 del mismo dominio.

**Validación:** tests dirigidos de contratos V4/V5, `null`, rechazos, payloads preparados antiguos, lectura de storage viejo, replays idénticos, mezcla de sesiones, fallos parciales y ausencia de pérdida; typecheck/lint/build/diff-check. **Puerta:** no activar V5 ni marcar Fase 1 cerrada si rompe recuperación V4.

## 4. Fase 2 — Detalles

**Objetivo:** consultar las anotaciones desde el historial de sede existente, sin alterar sus listas, paginación o rutas.

**Alcance:**

- Consumir los campos `motivo_diferencia`, `observacion_diferencia`, `observacion_reconteo` ya añadidos a `rpc_solog_details_v2('detail')`.
- Actualizar `DetailsCase` y `parseDetailsResponse` en `detalles.v2.ts`: campos `string | null`, validación de forma y coherencia; no asumir motivo en registros históricos.
- Incorporar en `detalles.case.tsx` dos secciones opcionales claramente separadas por procedencia: conteo inicial y reconteo. Cuando el motivo solo se conoció durante reconteo, **no mostrarlo como motivo originalmente conocido**.
- Reutilizar `DetailsCaseView` dentro de `detalles.historial.dialog.tsx`. Sin agregar columnas a la lista ni cargar textos para cada página.
- Mantener visibles las etiquetas históricas, stocks, fechas y contexto de SKU existentes.

**Validación:** casos con ambos textos, solo motivo incorporado al reconteo, `Resuelto`, motivo/observaciones nulos e historial anterior; parser y navegador cuando corresponda; responsive/accesibilidad; lint/build.

**Dependencia:** únicamente lectores V2 ya desplegados; no requiere que Cajero V5 haya sido activado.

## 5. Fase 3 — Cajero y activación funcional V5

**Objetivo:** habilitar el botón reservado, registrar motivos/observaciones con cada captura normal o reconteo y mostrar esa información en historial de Cajero.

**Alcance:**

- Habilitar el IconButton `MessageSquarePlus` existente de la calculadora sin rediseñar su geometría.
- Construir diálogo accesible (selector excluyente con cinco opciones, ninguna preseleccionada cuando no existe motivo; textarea), `trim` y longitud mínima efectiva 3. Aceptar observación voluntaria con diferencia pequeña o cero.
- Al `Continuar` con `abs(físico-teórico)>=12` sin explicación válida, abrir automáticamente el diálogo. Aplicar la misma guardia a cualquier camino de `runtime.capture`, incluido `Guardar` de D.1.4. **Nunca permitir guardar/enviar desde vías alternativas sin validación.**
- `Omitir producto`: desechar solo captura o edición actual, conservar draft previo y cola/otros conteos; avanzar sin enviar, resolver ni marcar contado.
- En reconteo: mostrar motivo previo sin ofrecer modificarlo; permitir incorporarlo si faltaba; nota de reconteo independiente; diferencia física cero => `Resuelto` autoritativo (sin exigir texto).
- Integrar motivo y texto en draft local de negocio, guardia de ediciones D.1.4, almacenamiento y flush V5. No introducir envío independiente de observación; preservar abort/retry y operaciones V4 preparadas.
- Activar la ruta V5 **solo cuando estén disponibles UI, validadores, storage y contratos completos**, y superada la puerta de verificación backend de escritura autenticada.
- Ampliar `cajero.history.ts` y `cajero.historial.tsx`: tres campos nullable en cada registro; mostrar motivo y las dos explicaciones en detalle expandido, distinguiendo su procedencia.

**Validación:** matriz +11/+12/−11/−12; cero; caracteres insuficientes/espacios; nota voluntaria; motivo original/inexistente; `Resuelto`; rechazo backend; D.1.4 (X, Escape, clic exterior, Anterior, Guardar, Descartar, navegación y corrección de valor ya guardado); sin pérdida/reintentos; ventana de recovery; historial; responsive tablet/desktop y accesibilidad. Typecheck/lint/build y pruebas de integración autenticada con entorno seguro.

**Puerta:** Fase 3 no se declara validada sin confirmar que todos los caminos reales de captura usan el mismo contrato V5 y que los lotes V4 antiguos se reenvían por V4 sin transformación.

## 6. Fase 4 — Admin Control (definición visual primero)

**Objetivo:** consultar observaciones en puntos de la cronología sin duplicar datos ni atribuirlas a otro momento.

**Paso 4A — revisión visual y aprobación dirigida (bloqueante para la UI):**

- Revisar el drawer actual de cronología y decidir **dónde** colocar el icono y **cómo** presentar `observaciones.inicial` y `observaciones.reconteo`.
- Considerar un popup que muestre un motivo y dos textos, con sus fechas, como **alternativa exploratoria**; no darla por aprobada.
- Registrar la decisión en delta de esta fuente primaria; no volver a diseñar el backend si la estructura aditiva existente es suficiente.

**Paso 4B — implementación tras aprobar el delta:**

- Ampliar `ControlChronologyViewRow` y `chronologyViewRows` en `admin.v2.ts` para aceptar `observaciones: { inicial: objeto|null; reconteo: objeto|null }` del backend desplegado.
- Actualizar `admin.control.v2.tsx` y estilos estrictamente asociados al popup según diseño aprobado.
- Icono únicamente si existe al menos una anotación asociada. Sin `hover` como mecanismo; clic/pulsación y soporte teclado/foco/cierre.
- Conservar `row_id`, estados, orden, eventos, cantidades, colores, periodos, caché y lógica del drawer.
- Un evento `Coincide` por reconteo puede contener dos contextos con fechas originales distintas: representar las fechas correctamente; no inventar eventos extra.

**Validación:** una y dos anotaciones, notas nulas, snapshots automáticos, evento coincidente por reconteo, `current_biweekly` / `previous_counts`, keyboard, tablet/desktop, pruebas de contrato, lint/build y smoke humano.

**Puerta:** la Fase 4 solo se implementa después de una decisión visual aprobada. Cambios no bloqueantes nuevos a backlog.

## 7. Revisión final y cierre transversal (sin quinta fase)

Al finalizar la Fase 4, realizar una sola revisión global proporcional al Nivel C:

- Diff/archivos realmente modificados y cobertura contra fuente primaria + delta de cronología.
- `bun test` para pruebas unitarias compatibles con Bun, Playwright por su runner específico, `bun run lint`, `bun run build`, typecheck cuando esté separado, `git diff --check`.
- Control de regresiones de Cajero D.1.4, prioridad V4, accesos por rol/dispositivo, reconteos y estados del Motor, cierre/recovery, idempotencia y no duplicación.
- Smoke visual/operativo humano sobre Detalles, Cajero y Admin; permitir que el usuario posponga smoke, pero no darlo por validado o cerrado hasta completarlo.
- Backend E2E autenticado: escribir/recuperar y leer una operación inicial y un reconteo con snapshot/credenciales autorizadas en un entorno seguro, sin alterar datos reales no aprobados.
- `master` y producción V4 no se despliegan ni cambian por este cierre. El corte V4 es una operación posterior con aprobación separada.

## 8. Reglas para Codex

- **Primero:** inspección dirigida + baseline y propuesta de plan, sin modificar el código. Esperar aprobación.
- **Después:** ejecutar solamente la fase autorizada, preservar cambios preexistentes y reportar archivos, tests, lint, build, diff-check y bloqueos.
- No cambiar backend, RPC, migraciones, RLS, tablas, permisos ni datos de Supabase. Si es necesario un cambio backend: detener, informar dependencia y devolver a ChatGPT.
- No refactorizar globalmente, no rediseñar el Motor ni las prioridades, no cambiar estados, no tocar `master`, no hacer cambios al Admin fuera de su fase ni anticipar decisiones visuales.
- No cambiar la fuente primaria ni su prevalencia; los cambios mínimos bloqueantes necesitan delta aprobado.
- Mantener nomenclatura legada que forme parte del contrato desplegado salvo autorización expresa.

## 9. Estado

**Plan:** propuesta de cuatro fases; pendiente aprobación del usuario y baseline/plan detallado de Codex.  
**Backend:** desplegado y validado estructuralmente; E2E autenticado aún pendiente.  
**Frontend:** sin cambios de implementación por este documento.  
**Visual Admin Control:** por definir al inicio de Fase 4.  
**Despliegue/corte V4:** fuera de alcance.
