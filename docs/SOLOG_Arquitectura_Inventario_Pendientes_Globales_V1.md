# SOLOG — Arquitectura — Inventario global de pendientes V1

**Estado:** AUDITORÍA DE CONTINUIDAD — 2026-11-21 (America/Lima). **No es una especificación de implementación ni una nueva decisión aprobada.**
**Rama observada:** `admin-work`, HEAD de código antes de este cierre documental `119ea42b8b4855ded85a89846482eaafdd8fab11`.
**Producción:** `master`, baseline `5d10b19963183de6670a6c2c53ac14ece14192ad`.
**Método:** inventario a partir de documentación y commits del repositorio, no auditoría estática exhaustiva de todo el runtime ni prueba live completa.
**Criterio de precedencia:** cada fuente primaria funcional/backend/UX citada conserva su autoridad. Esta lista solo indica estado/prioridad de seguimiento; ningún pendiente histórico se convierte por sí solo en requisito vigente.

## 1. Estado cerrado — no reabrir por inercia

| Bloque | Estado / autoridad |
|---|---|
| O1 — Ciclo horario Cajero Full V3 | **CERRADO**, con riesgos excepcionales aceptados; `SOLOG_Integracion_Cajero_Ciclo_Horario_O1_Cierre_Formal_V1.md` |
| R1–R5 — Contexto original y UX de reconteos | **CERRADO** por aprobación humana y contrastación de cinco reconteos reales; `SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_Cierre_Formal_V1.md` |
| Navegación continua de Revisar | **IMPLEMENTADA Y VALIDADA** en R5; delta `SOLOG_UX_Cajero_Revisar_Navegacion_Continua_V1.md` |
| KPIs/Cobertura Full Cajero — P1–P6 | **CERRADO CON EVIDENCIA DELIMITADA**, sección 10 de `SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_P6_Revision_Global_V1.md` |
| Admin — implementación general Fase 12 | **CERRADA**, `SOLOG_UI_Admin_Fase12_Cierre_Global_V1.md`; no extiende automáticamente el cierre al nuevo Dashboard V2 posterior |
| Admin Dialogs/Modals/Drawers | **CERRADO**, `SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md` |
| Detalles — Transición a Cajero | **CERRADO**, `SOLOG_UX_Detalles_Transicion_Cajero_V1.md` |
| Refactor de arquitectura CSS global | **CERRADO**, `SOLOG_Refactor_CSS_Plan_Implementacion_V1.md` |

## 2. Pendientes confirmados por documentación vigente

| ID | Prioridad sugerida | Trabajo | Evidencia documental | Acción siguiente |
|---|---|---|---|---|
| P1 | Alta, inmediato | **Dashboard Admin V2 — Fase 7: smoke humano real**. Confirmar cinco sedes, KPI/Riesgo/Rondas/Episodios/Actividad, Drawer de fecha, responsive, Control/exportación e invocación HTTP real `metrics_dashboard_v1` con cuenta autorizada. | `SOLOG_UI_Dashboard_Fase6_Validacion_Tecnica_Reporte_V1.md`: F6 aprobada, F7 pendiente. | Verificar versión en Preview, ejecutar checklist y registrar aprobación/correcciones/cierre; no cambiar backend para montar la prueba. |
| P2 | Media | **Cajero + Detalles — Bloque A A1–A4**, congelado en 2026-10-09 pero documentado como implementación pendiente: reloj relativo/obsolescencia en Detalles, foco modal Historial, invalidación selectiva de caché Historial Cajero, etiqueta Cobertura de turno pendiente. | `SOLOG_Correccion_Cajero_Detalles_BloqueA_Frontend_V1.md`. | Preflight contra runtime Full actual y cambios posteriores; determinar qué ya existe antes de implementar o cerrar. No asumir que el estado documental antiguo describe perfectamente el código actual. |
| P3 | Alta para release, no ejecutar automáticamente | **Integración final y promoción controlada `admin-work` → `master`.** Hay cambios aún no promovidos; validar Preview, baseline, CI, integración, smoketests de rutas críticas, protección de producción y preparar merge únicamente por aprobación expresa. | Comparación GitHub previa al cierre: `admin-work` 17 commits adelantada, 0 detrás de `master`. Sin PR abierto. | Definir checklist y ventana de release; la auditoría documental no autoriza merge ni despliegue. |
| P4 | Media, documental | **Reconciliación documental de runtimes y planes históricos.** `README.md` aún describe principalmente Cajero V2 pese al uso actual de Full V6/V7; fuentes UX Post-Motor conservan estados «sin implementar» aun cuando hay deltas e integraciones posteriores. | `README.md`; `SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`; `SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`; cierres Full posteriores. | Auditar fuentes vigentes vs históricas antes de editar; actualizar índices/README sin reescribir contratos ni declarar cerrados bloques sin evidencia. |

## 3. Backlog por explorar o reconciliar — NO aprobado automáticamente

| ID | Tema | Estado y límite |
|---|---|---|
| B1 | Revisión transversal UX/UI Cajero Post-Motor — arquitectura Inicio, Historial, calculadora, filtros, transición de diferencias, terminología y CSS | Plan histórico `SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md` contiene Bloque 2. Muchos aspectos fueron cubiertos por deltas posteriores y Full; **reconciliar primero**. No iniciar implementación global desde ese plan obsoleto. |
| B2 | Estado visual/contrato `Inválido` en Detalles | Expresamente **fuera del alcance** de Bloque A, sin definición funcional aprobada. Requiere exploración nueva y preflight, no implementación inmediata. |
| B3 | Optimización adicional de refrescos y egress V6 del Cajero | `SOLOG_Optimizacion_Cajero_Refrescos_V6_Preflight_Delta_V2.md` es **propuesta no congelada**; algunas hipótesis fueron mitigadas por instancia única y después por O1. Necesita nueva medición real, comparación con O1 y aprobación antes de cambiar. |
| B4 | Home/Login, detalles visuales y eventuales oportunidades de bundle | `SOLOG_Refactor_CSS_Plan_Implementacion_V1.md`, §18–19: refinamientos **opcionales, fuera del cierre CSS**; no constituyen defectos confirmados. |
| B5 | Cobertura manual responsive/accesibilidad más amplia para Cajero Full | Riesgo residual R7 aceptado en el cierre O1. Puede agendarse como auditoría independiente, sin reabrir O1. |
| B6 | Deuda de migraciones históricas no versionadas | Límite indicado en el cierre de KPIs/Cobertura Full P6. Requiere inventario y comparación con migraciones desplegadas antes de planificar corrección; no desplegar migraciones retroactivas a ciegas. |

## 4. Riesgos aceptados, vigilancia y limpieza condicionada

- **O1 R1–R5:** pérdida de respuesta/replay V7; concurrencia B4; rechazo B5 real; fallback natural; recovery real con fallos de red. Todos son **riesgos de E2E real no acreditados y aceptados**, no bloqueadores ni tareas inmediatas por defecto. Se revisan ante incidente o ventana segura. Véase `SOLOG_Integracion_Cajero_Ciclo_Horario_O1_Cierre_Formal_V1.md`.
- **Datos sintéticos de Cutervo:** los 406 registros de cobertura aprobados para habilitar el smoke son datos **sintéticos, no auditoría física real**; `SOLOG_Datos_Cutervo_Cobertura_Sintetica_Reconteos_V1.md`. Cualquier reconciliación/limpieza futura requiere un preflight de referencias, métricas, disparadores y efectos colaterales más aprobación explícita. **No borrar ahora.**
- **Sesiones / estado final:** R5 contrastó los grupos y las observaciones persistidas. No se certificó una lectura nueva del estado terminal de la sesión `03f74718-30c9-4c53-b4f9-dfa6e72ec55c` después del smoke. No convertir esa ausencia de evidencia en un fallo demostrado ni en un cierre automático supuesto.
- **GitHub:** no hay GitHub Issues ni PR abiertos a la fecha de esta auditoría. La ausencia de tickets **no prueba** ausencia de backlog; prevalece la documentación específica.
- **Preview/producción:** verificar el SHA realmente desplegado antes del próximo smoke. GitHub Actions verde no implica despliegue de Cloudflare.

## 5. Orden de ejecución propuesto

1. **P1 Dashboard Admin V2 — F7, smoke real y cierre formal**, sin rediseñar F0–F6.
2. **P2 Auditoría dirigida Cajero/Detalles Bloque A** para decidir implementación mínima o cierre si ya está cubierto.
3. **P4 Higiene documental** en paralelo sin cambios funcionales.
4. **P3 Release global** una vez cerradas las pruebas y bloqueos de producto seleccionados por el usuario.
5. **B1–B6** únicamente según prioridad aprobada; no abrir seis bloques automáticamente.

Este orden es una **recomendación** y no congela una hoja de ruta nueva. El usuario determina prioridad, alcance y aprobación de cada bloque.

---

## 6. Actualización operativa — 2026-11-23

- **Dashboard Admin V2 F7:** pospuesto por decisión expresa del usuario; sigue pendiente, **no iniciado ni cerrado**.
- **Bloque A Cajero/Detalles:** auditoría dirigida realizada. A1/A2/A4 constan implementadas en el runtime inspeccionado; no se repitió smoke específico. A3 **continúa pendiente en Full**; propuesta no congelada en `SOLOG_Optimizacion_Cajero_Full_Cache_Historial_A3_Diseno_V1.md`.
- **Nuevo delta de acceso Cajero condicionado por dispositivo:** `SOLOG_UX_Acceso_Cajero_Redireccion_Dispositivo_V1.md`, **implementado y validado técnicamente** en `admin-work`. CI `336516d8`: [run 45264684682](https://github.com/Jack-Mnt/SOLOG/actions/runs/45264684682), success. **Pendiente smoke humano real** con dispositivo autorizado/no autorizado.
- **Siguiente secuencia recomendada:** smoke de acceso Cajero → aprobar o ajustar propuesta A3 → implementar A3 mediante fase independiente → tests/smoke → retomar resto del backlog según prioridad del usuario.

Esta adenda prevalece solo para el **estado actual de seguimiento** frente a las prioridades sugeridas en la sección 5; no convierte la propuesta A3 en una decisión aprobada.
