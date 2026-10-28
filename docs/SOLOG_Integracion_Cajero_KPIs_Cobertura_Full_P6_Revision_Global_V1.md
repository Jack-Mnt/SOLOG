# SOLOG — Integración Cajero — KPIs y cobertura Full — Revisión global P6 V1

**Estado:** P6 REVISIÓN GLOBAL REMOTA COMPLETADA PARCIALMENTE; **CIERRE BLOQUEADO POR BROWSER TEST SIN RESULTADO Y SMOKE HUMANO PENDIENTE**. No declarar bloque cerrado.
**Fecha:** 2026-10-28, zona de proyecto America/Lima.
**Clasificación:** cierre Nivel C/backend + B/frontend.
**Rama:** `admin-work`; `master` fuera de alcance.
**Fuente primaria funcional prevalente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.
**Contrato backend efectivo:** `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_Full_Contrato_V1.md`.
**Reportes subordinados:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_P4_Reporte_V1.md` y `docs/SOLOG_UI_Cajero_KPIs_Cobertura_Full_P5_Reporte_V1.md`.

## 1. Baseline y alcance revisado

- Baseline P5: `c7ad68851f863d96832e2d0edd6e1fd05ee05a63`; baseline de primera revisión P6: `0c82f301139199f37f0e8a140de1939e21d3ea3d`.
- Delta P6: exclusivamente `tests/cajero-full.browser.mjs`, sin modificar componentes productivos ni Supabase.
- Comparación remota desde baseline P5: siete archivos; solo `src/features/solog/cajero/`, pruebas Full y documentación del bloque. Sin refactors generales, Admin ni migraciones backend nuevas.
- Inspección de líneas añadidas de diff GitHub: cero marcadores de conflicto y cero espacios finales detectados. **No reemplaza `git diff --check`**.

## 2. Contrato y backend

- P2: función `inventario.full_cashier_kpi_projection_v1`, adaptación de `full_cashier_state_v2` y migración `20261028034458_solog_cajero_full_kpis_cobertura_v1` desplegadas.
- P6 read-only: existen V6/V7, dispatcher, motor de acciones y proyección; V6/V7 autenticadas ejecutables y `anon` sin permiso; proyección privada sin `EXECUTE` para `anon` o `authenticated`.
- Hashes de funciones leídos P6: `rpc_solog_cashier_bootstrap_v6=dd700c0b963f602d1ab0394281db5371`, `rpc_solog_cashier_mutate_v7=700e7f813f376ab78509ba696a1b3c6c`, `full_cashier_dispatch_v2=f09dd9ad88123b990b5fd4a7110c8c9e`, `full_group_actions_v1=0bde849cf8e31d1abd87321f1d145ea0`, `full_cashier_kpi_projection_v1=6d55768f70d1e927b9822eb5d11c176e`. Sin despliegues P6.
- Cinco sedes activas comprobadas: 5/5 con `coverage_total=counted+pending`, 5/5 con instante dentro de `[round_starts_at,round_ends_at)`, 5/5 grupos vacíos sin sesión. Ronda reportada `2` en la prueba. No se escribieron datos operativos.
- Falta E2E autenticado con dispositivo real y carrera V6/V7 con dos transacciones; **no considerarlas validadas**.

## 3. Frontend — auditoría de contratos y estados

- `full.contract.ts` diferencia `CASHIER_STATE` con KPI y banderas de grupo frente a `affected_groups` V7 sin esos campos.
- `full.coverage.ts` exige reloj confiable, ronda vigente, resumen fresco y sesión activa o ausente (nunca recovery transitorio como A1/A2); mezcla visual solamente con borradores vigentes únicos, sin completar oficialmente la ronda desde drafts.
- `full.runtime.ts` invalida KPIs en mutaciones V7 confirmadas y los restaura con V6 nuevo; no altera identidad/idempotencia del outbox.
- `full.app.tsx` muestra Inventario, cobertura horizontal o compacta, flujo A1/A2, stock warning/danger solo B, Revisar/Diario en A2/C y Pendientes de registro solo con sesión. Navegación solo cuando la cola del Motor autoriza; `?stock` responde a navegación SPA/popstate.
- `full.home.tsx` reutiliza clases y tokens de `operational.css` y `cajero.css`; `full.css` únicamente amplía el segmento ámbar y los estados de sincronización.
- Modal de captura conserva contador y barra `n/N contados` de cola actual; categorías muestran `n/N` y no denominador histórico.
- A2 con Flujo Operativo se mantiene como delta aprobado; no se reabre el diseño.

## 4. Hallazgo P6 y corrección de test

En `tests/cajero-full.browser.mjs`, los escenarios sintéticos A2 y C simulaban cobertura global 100 % pero dejaban acciones de captura `coverage`. Esa fixture contradice la prioridad Full y no era una prueba fiel. Se corrigió **solo la fixture**:
- Dos grupos ya cubiertos oficialmente; uno con prioridad `review_regular` y otro `shift_coverage`.
- `next_action='review'`, con KPIs informativos en A2 y navegación a Revisar solamente en C, al existir sesión activa.
- Se añadieron aserciones que rechazan cualquier botón operativo de Revisar/Diario en A2 y exigen un único botón habilitado en C cuando la prioridad es review.

**Estado de esta corrección:** enviada al repositorio; **browser test aún no ejecutado** después del cambio.

## 5. Evidencia técnica disponible y pendiente

| Verificación | Estado | Evidencia |
|---|---|---|
| `bun test` | Aprobado por usuario antes de delta test P6 | Confirmación explícita en chat |
| `bun run lint` | Aprobado por usuario antes de delta test P6 | Confirmación explícita |
| `bun run build` | Aprobado por usuario antes de delta test P6 | Confirmación explícita |
| `git diff --check` | Aprobado por usuario antes de delta test P6 | Confirmación explícita |
| Auditoría remota de archivos/diff | Completada | Comparación GitHub `admin-work` |
| Validación SQL read-only | Completada | Cinco sedes, invariantes y permisos |
| `node tests/cajero-full.browser.mjs` | **Pendiente** | Última ejecución falló antes de iniciar browser: faltaba Chromium headless de Playwright |
| Smoke visual humano | **Pendiente** | No se ha confirmado revisión de Inicio/Preview |
| Concurrencia real V6/V7 | No acreditada | Fuera de pruebas disponibles |

## 6. Comandos de verificación final

En `C:\Dev\GitHub\SOLOG`, con `admin-work` sincronizado **sin perder cambios locales**:

```powershell
bunx playwright install chromium
node tests/cajero-full.browser.mjs
git diff --check
```

Solo reinstalar Chromium si continúa faltando. Si el navegador arroja fallos de escenarios, enviar título exacto y stack para corrección dirigida. No es necesario volver a ejecutar toda la suite, lint y build si no cambia código fuente tras los resultados verdes; si se corrige código productivo, repetir las validaciones afectadas.

## 7. Smoke humano dirigido / criterios de cierre

1. **A1:** sin sesión, cobertura incompleta y Flujo Operativo visible. No hay rutas de captura sin inicio.
2. **A2:** sin sesión, cobertura completa compacta, Flujo Operativo visible, KPIs Revisar/Diario informativos no navegables.
3. **B:** sesión activa, anillo y contados/pending correctos, Stock 0 y negativo desde cola Full, borrador ámbar diferenciable, Revisar y Pendientes de registro.
4. **C:** sesión activa, cobertura oficialmente completa compacta, KPIs Revisar/Diario y Pendientes de registro; navegación solo si prioridad Full.
5. Responsive móvil/tablet/escritorio: sin overflow ni superposición de bottom nav, card, contador y modal. Paleta actual y foco/teclado accesibles.
6. Registro/finish/recuperación: no se duplican envíos; confirmaciones V7 actualizan KPI solo tras V6. No ejecutar escritura real en producción solo para probar este bloque: preferir browser mocks y staging autorizado.
7. Fallo de V6 o cambio de ronda: estado de sincronización y reintento sin progreso obsoleto.

**Regla de cierre:** no declarar P6 ni el bloque global cerrado hasta que el usuario confirme browser test y smoke visual humano o se documenten explícitamente las excepciones aceptadas. Nuevos cambios ajenos a KPIs van a backlog.


## 8. Delta P6 — browser Chrome: dos escenarios inicialmente fallidos (2026-10-28)

**Evidencia recibida del usuario:** ejecución real con Google Chrome instalado como `SOLOG_TEST_BROWSER`. 21 escenarios aprobados y 2 fallidos, con ejecución del browser efectiva. Se descartó el bloqueo previo de navegador ausente.

- **Bootstrap con error transitorio**: el test simulaba un único fallo V6; en React StrictMode más de una lectura inicial puede eliminar el error antes de la aserción. La fixture ahora mantiene `FULL_TEMP_UNAVAILABLE` hasta pulsar realmente `Reintentar`. Verifica pantalla de error, ausencia de mutaciones V7 y una nueva lectura V6 que vuelve a Inicio.
- **Popup de SKU y calculadora**: la comparación de coordenadas absolutas no distinguía la barra de navegación `position: sticky` frente al contenido desplazable. Se conserva la comprobación de navegación junto al borde inferior, se comprueba que la calculadora precede a la navegación en el DOM y que los controles de ambos elementos son operables mediante comprobaciones Playwright `click({trial:true})` que incluyen el scroll necesario y verifican que no están interceptados.
- **Archivos modificados por este delta:** únicamente `tests/cajero-full.browser.mjs`. Ni CSS ni frontend productivo, ni backend, ni demás tests.
- **Estado:** corrección enviada al repositorio; **nuevo browser test aún por ejecutar en Chrome local**. Si la prueba de operabilidad falla, tratar como incidencia real de layout, no ocultarla rebajando aserciones.

### Comando dirigido en PowerShell

```powershell
$env:SOLOG_TEST_BROWSER = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
node tests/cajero-full.browser.mjs
```

Mantener P6 abierto hasta resultado real y smoke visual humano.
