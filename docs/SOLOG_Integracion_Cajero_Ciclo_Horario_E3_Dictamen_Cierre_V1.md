# SOLOG — Integración Cajero — Ciclo horario V3 — Dictamen E3 y propuesta de cierre V1

**Estado:** E3 — REVISIÓN GLOBAL COMPLETADA. **CIERRE O1 PROPUESTO, PENDIENTE DE APROBACIÓN EXPLÍCITA DEL USUARIO Y ACEPTACIÓN DE RIESGOS RESIDUALES.**
**Fecha:** 2026-11-20 (America/Lima), revisión remota de las 16:04.
**Nivel:** C (validación global de lógica temporal, integración frontend/backend y evidencia operativa).
**Alcance:** O1 — Cajero Full V3 con ciclo horario de snapshots. **Solo documentación:** no se implementó código, no se modificó Supabase y no se publicó un nuevo artefacto funcional.
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`. **Repositorio:** `Jack-Mnt/SOLOG`, rama `admin-work`.

## 1. Fuente primaria, precedencia y estados documentales

- **Primaria funcional congelada para O1:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`. Sus reglas de HH:59, HH:57, TTL, respaldo, B4 y B5 prevalecen.
- **Primaria funcional por su subdominio de entrega/recovery:** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`. Prevalece para journal, borradores, secuencia de envío, idempotencia y cierre.
- **Contrato backend vigente:** `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`, RPC públicas V6/V7, desplegadas y consumidas.
- **Delta vigente de activación:** `docs/SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md`; sustituye únicamente la transición `legacy→dual→required` por `legacy→required`. `dual` no es ruta de implementación vigente.
- **Evidencias complementarias y vigentes en su fecha:** `docs/SOLOG_Integracion_Cajero_Ciclo_Horario_Revision_Global_V1.md`, `docs/SOLOG_Backend_Cajero_E2E_Transaccional_Cutervo_V1.md`, `docs/SOLOG_Backend_Cajero_E1_Recovery_Idempotencia_B4_B5_Validacion_V1.md`, `docs/SOLOG_Integracion_Cajero_E2_Validacion_Segura_Sin_Entorno_Aislado_V1.md`.
- **Estado histórico, no autoritativo hoy:** encabezados antiguos que afirman «no implementado», «sin E2E» o «`master` utiliza rutas legacy». Su fecha y contexto describen el momento de congelación, no el despliegue verificado en E3. **Este reporte no reescribe las fuentes congeladas.**

## 2. Baseline, CI, despliegue y Supabase

**Código:** CI GitHub Actions [#44196074189](https://github.com/Jack-Mnt/SOLOG/actions/runs/44196074189), SHA `84f2c4d1c7502ab949e4f57051e02894b14c815a`, éxito: **70/70 dirigidos Full**, **877/877 globales Bun**, **35/35 Chromium con RPC simuladas**, lint, typecheck/build y `git diff --check` exitosos. No se reejecutó la CI durante E3.

**Trazabilidad de cambios:** comparación GitHub entre SHA de CI y rama `admin-work` antes de E3: **4 archivos añadidos de documentación, ningún archivo de código modificado**. El SHA de código `5d10b19963183de6670a6c2c53ac14ece14192ad` es idéntico en `master` y en el último despliegue funcional correcto de `admin-work`. Los commits adicionales de `admin-work` son documentales. No se necesita una nueva publicación funcional para el código revisado.

**Cloudflare Pages:** despliegues funcionales completados correctamente el 2026-11-20:
- `production`, rama `master`, SHA `5d10b199`, estado `deploy/success`.
- `preview`, rama `admin-work`, SHA `5d10b199`, estado `deploy/success`; alias `https://admin-work.sologpr.pages.dev`.
- Deployments de commits documentales posteriores aparecen `queued/idle`; **no interpretarlos como builds funcionales aprobados**.

**Supabase — consulta independiente 2026-11-20 16:04 Lima:**

| Control | Evidencia |
|---|---|
| `full_cashier_hourly_config_v3.mode` | `required` |
| `full_settings.policy_version` | `2` global, independiente del V3 horario |
| Sesiones `full_session_windows.policy_version=3` | 3 |
| Sesiones V3 finalizadas | 3 |
| Sesiones activas/recovery | 0 |
| Observaciones confirmadas asociadas a V3 | 30 |
| Detalles de conteo normales con `client_observation_id` asociados a V3 | 30 |
| Reservas B4 actuales | 0 |
| Rechazos B5 persistidos actuales | 0 |
| Ventanas V3 con referencia/expiración/entrega inconsistente | 0 |

Esta lectura muestra **consistencia actual**, no prueba la inexistencia de riesgos de concurrencia ni valida reconteos reales.

## 3. Matriz final de aceptación por tipo de evidencia

| Contrato / comportamiento | Evidencia | Estado de aceptación |
|---|---|---|
| Snapshot confirmado de ConeXion y oferta `new` V6 | Smoke real Cutervo, consulta en Supabase, 493 grupos | **Aprobado real** |
| `start` V3 con usuario/dispositivo real | Sesión real `895e273d`, política V3, horas y snapshot congelados | **Aprobado real** |
| Conteos/diferencias y notas | Sesión primera: 11, incluyendo Cartavio +25/-25 con motivos y notas | **Aprobado real** |
| Envío automático de borradores al pulsar `finish` | Dos `save_batch` de 5+6 antes de `SESSION_FINISHED` | **Aprobado por secuencia real**, no prueba aislada del clic |
| Autocierre HH:00 con pendientes | Sesión segunda: 14+5 `save_batch`, 5 confirmados después de 05:00 con captura previa; `finish` 05:00:15 | **Aprobado real** |
| Cierre de sesión sin observaciones | Tercera sesión `finalizado`, sin observaciones | **Aprobado real** |
| Huellas idempotentes y replay compactable | E1: 10/10 fingerprints, 30/30 receipts, 0 miembros faltantes | **Aprobado read-only** |
| `bootstrap→start→save→replay→finish` en RPC reales | E2E reversible Cutervo anterior a smoke real | **Aprobado por rollback** |
| B4: reserva durante `recovery`, unicidad y liberación | E1, sesión sintética SQL, `PASS_ROLLED_BACK` | **Aprobado por rollback** |
| B5: duplicado del turno y atomicidad | E1, trigger real, `PASS_ROLLED_BACK`; helper de errores revisado | **Aprobado SQL**, falta RPC externa real |
| Fallback y límites HH:57 / 180 s / turnos | E2: 7/7 escenarios SQL read-only, tests Chromium | **Aprobado sintético** |
| Lost response / reintentos y cierre seguro | Bun/Chromium simulados; código y journal revisados | **Aprobado simulado**, no red real |
| Varias ventanas, suspensión, falta Web Locks | Chromium simulado; instancia única y persistencia del journal | **Aprobado simulado** |
| `recount_save_batch` y prioridad dinámica | Chromium simulado | **Aprobado simulado**, sin flujo operativo de reconteo real |
| Smoke visual humano exhaustivo teclado/responsive | No consta evidencia humana sistemática para todos los breakpoints | **No acreditado íntegramente** |

## 4. Riesgos residuales y clasificación

**R1 — Pérdida real de respuesta de V7 después de confirmar. Severidad: media-alta; evidencia indirecta alta.** No se ha provocado con red y dispositivo reales. Mitigación: operation UUID+payload inmutable, replays, reconciliación por V6, bloqueo de cierre con outbox incierto. Mantener como riesgo residual; monitorear incidentes naturales antes de introducir correcciones.

**R2 — Concurrencia simultánea B4 entre transacciones. Severidad: media; controles estructurales verificados.** Se probó unicidad y reserva en recovery dentro de SQL, no carrera entre conexiones. Mitigación: exclusividad por `detail_id`, bloqueo de sede y restricciones PostgreSQL.

**R3 — Rechazo B5 completo a través de V7 real y resolución en navegador. Severidad: media; cobertura de componentes alta.** Trigger de duplicados y serialización de errores confirmados; tests de UI simulan la respuesta. No inducir conflictos en datos reales para alcanzar el test.

**R4 — Fallback real con snapshot anterior válido. Severidad: media-baja; evidencia sintética.** Backend calcula condición y frontend exige consentimiento y una V6 por espera. Falta smoke humano espontáneo de respaldo, sin manipular snapshots.

**R5 — Recovery real de múltiples borradores, fin +2h, reloj/conexión y prioridades cambiantes. Severidad: media; pruebas simuladas y SQL parciales.** Los límites están desplegados; no se ha comprobado todo con red real. Preservar diagnósticos y observar fallos naturales.

**R6 — Contexto original de reconteo en UI. Severidad: funcional de UX, fuera de O1 temporal.** `full.app.tsx` aún muestra el mensaje provisional «Motivo y diferencia inicial: pendiente de contrato de lectura». La ruta de reconteo tiene pruebas simuladas, pero su contexto original **no está resuelto**. Abrir un bloque independiente de contrato de lectura + UX antes de considerar validado el reconteo integral; **no llamar a este punto «validado» ni inventar datos**.

**R7 — Smoke humano integral de accesibilidad y responsive. Severidad: baja-media; evidencia Chromium dirigida.** Existen tests de foco/teclado en modal B5 y fallback, pero no se dispone de smoke humano exhaustivo de todas las resoluciones en E3.

Los riesgos R1–R5 y R7 son **ausencia de prueba integrada**, no fallos demostrados. **R6 es una dependencia funcional preexistente, delimitada a otro bloque.**

## 5. Decisión recomendada y próximos controles

**Dictamen E3:** GO para **proponer cierre O1 con riesgos residuales expresamente aceptados**; **NO declarar cierre pleno de pruebas excepcionales** ni del módulo integral de reconteos.

Fundamento: todas las rutas centrales del ciclo horario fueron comprobadas con operaciones reales; invariantes críticas revisadas con SQL reversible/lectura; CI completa y navegador simulado aprobados; sin inconsistencias actuales en backend. El usuario indicó que **no puede disponer de entorno Supabase aislado**, por lo que no se recomienda forzar fallos de red o carreras contra datos operativos. Crear otro entorno **no es prerrequisito impuesto** para el cierre por aceptación de riesgo.

**Pendiente de decisión del usuario:**
1. Aprobar **cierre funcional de O1 (ciclo horario Cajero V3)** aceptando expresamente R1–R5 y R7 como riesgos residuales no verificados E2E.
2. Mantener **R6 en backlog/bloque independiente** de contexto original de reconteos.
3. No confundir «O1 cerrado» con «SOLOG completo» o «reconteos plenamente validados». La política `required` y producción ya están desplegadas; **no fusionar ni desplegar de nuevo sin una decisión diferenciada**.

**Si se aprueba:** registrar un delta corto de **cierre formal** o cambiar el estado de este documento a `CERRADO`, sin reabrir fuentes congeladas; conservar riesgos como backlog de seguimiento y reaccionar solo ante incidentes reales, nuevo requisito o evidencia técnica nueva.

**Hasta aprobación:** `E3 COMPLETADO — PROPUESTA DE CIERRE`; `O1 PENDIENTE DE APROBACIÓN FORMAL`.
