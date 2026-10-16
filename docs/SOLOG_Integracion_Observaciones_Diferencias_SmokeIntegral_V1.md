# SOLOG — Integración de Observaciones de Diferencias — Smoke Integral V1

**Estado:** PLAN DE VALIDACIÓN; ejecución y aprobación humana pendientes.
**Fecha:** 2026-10-15 (America/Lima).
**Clasificación:** verificación global proporcional de un cambio Nivel C; no es implementación.
**Rama exclusiva de prueba:** `admin-work`. No fusionar con `master` ni reactivar Cloudflare durante este smoke.

## 1. Fuentes y prevalencia

**Fuente primaria funcional vigente:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.
**Delta sin legacy vigente:** `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_SinLegacy_Delta_V1.md` (prevalece solo sobre transición y almacenamiento V4).
**Backend remoto desplegado:** `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md` y `docs/SOLOG_Backend_Cajero_ReviewQueue_Observaciones_Delta_V1.md`.
**Excepción de cronología:** `docs/SOLOG_Backend_Observaciones_Diferencias_Cronologia_Delta_V1.md` (prevalece para evento coincidente de reconteo con dos contextos temporales).
**Composición Admin provisional:** `docs/SOLOG_UI_AdminControl_Observaciones_Popup_Delta_V1.md` (sin congelar geometría).
**Resultado de fases:** `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_Fase3_V1.md` y `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_Fase4_V1.md`.
Este plan define cómo verificar, no modifica reglas de negocio ni contratos.

## 2. Preflight y entorno seguro

**Hallazgo remoto el 15/10/2026:** el snapshot confirmado más reciente es del 08/10/2026; 0 snapshots confirmados durante las últimas 2 horas; 0 sesiones de conteo activas. No es viable declarar E2E V5 aprobado sin preparar datos nuevos.

- [ ] Registrar `git status`, rama `admin-work` y HEAD; conservar cambios locales preexistentes. Iniciar Vite con `bun run dev` y usar la URL local que indique el proceso, sin despliegue.
- [ ] Confirmar que Admin y Moderador entran en `/admin`, con permisos de cada rol, y que la sesión de Cajero requiere rol/dispositivo/sede autorizados.
- [ ] Elegir una **sede de prueba autorizada** y productos/grupos identificables. Documentar su stock teórico autoritativo `T`. La prueba real necesita un snapshot A nuevo y válido, capturado desde el flujo correcto de ConeXion.
- [ ] Preparar un snapshot B posterior al primer conteo para habilitar la evaluación/reconteo según el Motor. Verificar elegibilidad real del caso; no forzar manualmente estados, prioridades ni snapshots.
- [ ] Documentar identificadores seguros de operación/caso y timestamps solo en el registro interno; no compartir tokens, secretos o datos personales.
- [ ] Si la base es compartida con operación real y no hay grupos dedicados, **no fabricar conteos contra inventario operativo**. Usar fixtures/mock para UI y dejar E2E como bloqueo pendiente de entorno controlado.

## 3. Secuencia — Etapa A: recorrido de captura y D.1.4

Trabajar con los casos de prueba reales autorizados; donde no existan stocks adecuados, validar el caso con mocks deterministas y marcar la evidencia según corresponda. Para cada grupo, `d = físico - T`; el cálculo usa siempre el teórico real de la sesión, no el número mostrado en este ejemplo.

| ID | Escenario | Ejemplo si T=20 | Resultado esperado |
|---|---|---|---|
| C01 | Conteo sin diferencia | 20 (d=0) | Continúa sin motivo obligatorio; permite observación voluntaria consistente |
| C02 | Diferencia positiva inferior a umbral | 31 (d=+11) | No obliga motivo/texto; permite `null` o pareja voluntaria |
| C03 | Diferencia negativa inferior a umbral | 9 (d=-11) | Misma regla que C02 |
| C04 | Diferencia positiva en umbral | 32 (d=+12) | `Continuar` abre diálogo obligatorio; no guarda hasta completar pareja |
| C05 | Diferencia negativa en umbral | 8 (d=-12) | Igual que C04 |
| C06 | Motivo y texto voluntario | d pequeño o 0 | Cinco motivos, ninguno preseleccionado; pareja motivo/texto de ≥3 caracteres efectivos |
| C07 | Validación de texto | vacío, 1–2 caracteres, solo espacios | `Aplicar` y el guardado no aceptan pareja incompleta; texto válido tras `trim()` |
| C08 | Botón Limpiar | observación voluntaria | Borra solo motivo/texto local; no ejecuta RPC |
| C09 | Omitir producto | diferencia ≥12 sin nota | Descarta solo edición actual, avanza, no cambia n/N, borradores previos, cola ni backend |
| C10 | Recuperación de draft anterior | corregir un grupo ya guardado localmente | Omitir/Descartar no elimina el draft previo; al regresar sigue disponible |

**Protección D.1.4 (C11):** verificar X, Escape, clic exterior, botón Anterior, navegación entre grupos y regreso. La confirmación debe aparecer al modificar cantidad **o solo observación**; `Cancelar` conserva la edición, `Descartar` revierte únicamente la edición actual y `Guardar` aplica también el requisito de ≥12. `Continuar` captura correctamente cuando se permite.

## 4. Secuencia — Etapa B: roundtrip autenticado Supabase V5

Esta etapa es la puerta de mayor riesgo. Se realiza **solo después** de disponer de sede, dispositivo, grupos y snapshots autorizados.

| ID | Paso real | Evidencia necesaria |
|---|---|---|
| E01 | Snapshot A reciente + iniciar sesión Cajero | Autorización correcta; `start` utiliza `rpc_solog_cashier_mutate_v5`, contrato 5; panel bootstrap sigue v4 |
| E02 | Guardar un conteo con motivo y nota y enviar lote | Mismo payload contiene físico, motivo, texto, ID y timestamp; respuesta `save_batch` confirmada |
| E03 | Verificar persistencia de conteo | Nota inicial/motivo coinciden entre captura, historial y lectura autoritativa; no duplicación |
| E04 | Capturar snapshot B **posterior** y establecer elegibilidad real | El caso aparece en `review_queue` solo si lo determinan estados/prioridades del Motor; incluye motivo/nota anterior |
| E05 | Reconteo con motivo ya existente y diferencia no coincidente | Motivo original visible, bloqueado; nueva nota se registra aparte en `observacion_reconteo`; no reescribe observación inicial |
| E06 | Reconteo sin motivo original | Permite incorporar motivo solo al reconteo; no muestra como anotación del conteo inicial |
| E07 | Reconteo coincidente | Cuando físico = teórico **del reconteo**, backend produce `observacion_reconteo = 'Resuelto'`; no obliga texto adicional |
| E08 | Finalizar sesión | `finish` V5, borradores/operaciones preparados en estado consistente, sin pendientes indebidos |
| E09 | Red interrumpida/reintento controlado | Mantener exactamente mismo UUID, payload y timestamps de operación preparada; evitar duplicado o pérdida; no cortar realmente la conexión de usuarios ajenos |
| E10 | Salida/reingreso y recuperación | Borradores y recibos pendientes se conservan/recuperan correctamente; envío parcial no descarta lo que no está confirmado |

**Notas:** E05, E06 y E07 pueden requerir casos/sesiones diferentes. No forzar un mismo caso por varios estados incompatibles. Si una acción real carece de elegibilidad, registrar `BLOQUEADO POR DATOS` y cubrir presentación con fixtures hasta preparar el escenario. No usar SQL para fabricar conteos o saltar validaciones sin autorización explícita.

## 5. Secuencia — Etapa C: lecturas cruzadas

| ID | Módulo / caso | Resultado esperado |
|---|---|---|
| L01 | Historial Cajero, detalle expandido | Motivo y nota inicial donde corresponde; nota de reconteo separada, `Resuelto` textual; históricos nulos sin texto ficticio |
| L02 | Detalles (`DetailsCaseView`) | Mismas observaciones del mismo caso, sin duplicación ni modificación; fechas/etapas correctas |
| L03 | Admin Control, cronología actual | Icono Info solo en eventos humanos anotados; apertura por clic/pulsación; no hay columnas ni eventos nuevos |
| L04 | Admin Control, `Coincide` por reconteo | Un punto existente puede mostrar un motivo y dos explicaciones con **dos timestamps reales diferentes**; no atribuir ambos al mismo instante |
| L05 | Admin Control, snapshot automático | Ausencia de Info si el evento solo representa snapshot y no tiene anotaciones humanas |
| L06 | Admin Control, `previous_counts` | Notas visibles al activar Conteos anteriores; sin consultas repetidas por abrir/cerrar popup; persistencia del caché |
| L07 | Admin Control, teclado/cierre | Clic, Enter/Espacio, X, Escape, clic fuera, foco; Escape cierra popup sin cerrar drawer; solo un popup abierto |
| L08 | Roles y acceso | Admin puede ver Control; Moderador accede únicamente a capacidades autorizadas; Cajero sin permisos directos de tabla privada |

## 6. Secuencia — Etapa D: revisión visual y regresiones

- [ ] Escritorio y tablet en Cajero: icono de observación, diálogo, cinco motivos, scroll, teclado, foco, invalidaciones, botones Aplicar/Cancelar/Limpiar/Omitir.
- [ ] Escritorio y tablet en Detalles: textos extensos, saltos de línea, `Resuelto`, ausencia de bloques vacíos, historial expandido.
- [ ] Escritorio y tablet en Admin Control: Info al lado del estado, fecha/hora Lima am/pm, popup sin clipping ni salto engañoso de la línea de tiempo, cierre de teclado; `previous_counts`.
- [ ] Comprobación regresiva en viewport móvil si el módulo lo soporta, zoom, texto largo y escalado de fuente. Revisar contraste y foco visible.
- [ ] Verificar que tablas, filtros, paginación, exportación, prioridades del Motor, estados y otras funciones fuera del bloque siguen funcionando.
- [ ] Registrar ajustes visuales como **deltas**, sin reabrir las decisiones funcionales congeladas. No rediseñar automáticamente ante una preferencia visual.

## 7. Evidencia y reporte

Para cada ID usar `OK`, `FALLO`, `NO EJECUTADO` o `BLOQUEADO POR DATOS`. Indicar módulo, sede/grupo de prueba (sin secretos), acción, resultado observado, esperado, tipo de evidencia y captura/redacción del problema.

Clasificación de hallazgos:
- **P0**: pérdida/duplicación de datos, autorización indebida, corrupción de operación o edición irreversible; detener el roundtrip.
- **P1**: bloqueo funcional, regla de motivo/umbral incumplida, origen temporal incorrecto, falta de recuperación o proceso de envío que falla.
- **P2**: accesibilidad, legibilidad, geometría, enfoque, etiquetas o detalles visuales sin impacto sobre la integridad del conteo.
- **Backlog**: mejora deseable no necesaria para el cierre.

## 8. Criterio de cierre

1. Validación técnica ya confirmada: suite, lint, build y diff sin incidencias tras la Fase 4.
2. Evidencias de los escenarios críticos C04–C11, E01–E10 y L01–L08, sin P0/P1 abiertos. Cuando un escenario sea imposible por falta de datos, no presentarlo como aprobado.
3. Roundtrip autenticado `start → save_batch → [snapshot posterior] → recount_save_batch → finish` y lectura cruzada verificados con contratos desplegados en ambiente autorizado.
4. Smoke visual aceptado por el usuario tras deltas necesarios. Ejecutar pruebas técnicas dirigidas y revisión global proporcional después de correcciones.
5. Cerrar explícitamente el bloque antes de considerar merge a `master` y reactivación de Cloudflare, que requieren aprobación separada.
