# SOLOG — UI Cajero — KPIs y cobertura Full — Reporte P5 V1

**Estado:** IMPLEMENTADO EN `admin-work` — VALIDACIÓN LOCAL Y SMOKE VISUAL PENDIENTES. No cerrar P5 ni P6 hasta obtener evidencia.
**Fecha:** 2026-10-28 (America/Lima).
**Fuente primaria única:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.
**Contrato backend vigente:** `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_Full_Contrato_V1.md`.
**Plan subordinado:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_Plan_Frontend_V1.md`.
**Baseline P5:** `c7ad68851f863d96832e2d0edd6e1fd05ee05a63` (P4 validada localmente por usuario).
**Método:** GitHub directo, sin Codex, sin escritura Supabase.

## P5.1 — Inicio A1/A2/B/C

Se creó `src/features/solog/cajero/full.home.tsx`, exclusivamente visual:
- `FullCoverageCard`: geometría existente de cobertura horizontal con anillo derecho, segmento confirmado en `--color-primary` y provisional en `--color-warning`. El texto identifica las dos magnitudes; el centro del anillo presenta avance visible.
- `FullCoverageComplete`: aviso compacto **solo** con cobertura oficialmente completa y total positivo.
- `FullHomeMetric`: tarjeta original y tonos warning/danger para Stock 0/negativo, navegación únicamente cuando corresponde a prioridad Full activa.
- `FullOperationalFlow`: información Conteo → Revisar → Diario, interactivo sin mutaciones ni navegación. **Se muestra en A1 y A2 siempre que el V6 esté vigente**, de acuerdo con el delta aprobado.
- `full.app.tsx`: sustituye el placeholder `Continuar trabajo habilitado` por tarjetas definidas, conserva Inventario/Inicio/Finalizar/Pendientes de registro/Apariencia, errores, sesiones y recovery.
- KPI de Revisar/Diario A2 son **informativos**, en C se habilitan solo si la ruta y prioridad de la sesión lo permiten; Stock 0/negativo únicamente en B.
- Estado vacío (`total=0`): `Sin grupos para esta ronda`, sin simular cobertura completada.
- Estado vencido o invalidado: superficie de sincronización con reintento explícito, nunca KPI previo como vigente.

## P5.2 — Cola actual, categorías, modal, URL

- `stock_theoretical` congelado de `data.groups[]` V6, intersectado con la cola Full `actionable` de cobertura: contadores Stock 0 y Stock negativo **sin reconteos ni grupos no disponibles**.
- Se agregó `n/N contados` a tarjetas de categorías con borradores locales de la **cola actualmente disponible**, evitando construir un histórico acumulado.
- El modal ya ofrecía `n/N contados` y barra de progreso derivados de `groups` y `draftFor`; se preservaron sin nueva lógica de motor ni cambios en calculadora/observaciones.
- Los accesos de Stock 0/negativo navegan a `/cajero/conteo?stock=zero|negative` solo si la ruta Full está habilitada.
- Se sincroniza filtro con `solog:navigation` y `popstate`. Navegar a Conteo sin query reinicia la selección por defecto `positive`; cambiar el filtro actualiza URL.

## P5.3 — CSS, responsive y accesibilidad

- `full.css` añade únicamente estilos locales para segundo arco provisional, desglose visible y estado sin sincronizar; todos los colores y superficies derivan de tokens del Design System.
- Se reutilizan las clases existentes `cajero-coverage-card`, `cajero-progress-ring`, `cajero-home-metric`, `cajero-home-flow`, `cajero-period-complete`.
- Se mantiene la barra inferior y estilos responsivos existentes (móvil, tablet, escritorio), controles accesibles con botones/labels, descripción del anillo y `role=status` en superficies pertinentes.
- No se modificaron `operational.css`, `cajero.css` ni componentes compartidos globales.

## Pruebas preparadas, NO ejecutadas en esta conexión

`tests/cajero-full.browser.mjs`:
- Fixtures V6 de A1/A2/B/C (la variante A2 también comprueba Flujo Operativo).
- Composición cobertura completa/incompleta, tarjetas stock, registro pendiente y tarjetas de operaciones.
- Verificación de desborde horizontal en 390/768/1280 px.
- Verificación de `?stock=zero|negative|positive` en navegación contextual y retorno Inicio.
- Verificación de borrador provisional (aún no completado oficialmente).
- Actualización de los cuatro selectores de categorías de `grupos disponibles` a `n/N contados`.

Se conservan las pruebas P4 de contrato, prioridades, idempotencia y recuperación, que deben pasar sin regresión.

## Validación requerida

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
bun test tests/cajero-full-kpis-cobertura.test.ts tests/cajero-full-registro-autocierre.test.ts tests/cajero-full-inicio-snapshot-horario.test.ts tests/cajero-full-presentacion-regresion.test.ts
bun test --reporter=dot
bun run lint
bun run build
git diff --check
node tests/cajero-full.browser.mjs
```

Si no está instalado Playwright o su navegador, reportar el bloqueo en vez de declarar browser aprobado. Inspeccionar manualmente en Preview los cuatro estados, estados de error, colores del anillo y transiciones. No activar Cloudflare automatic deployments ni ejecutar smoke con datos de producción sin autorización.

## Riesgos / límites

- **Validaciones no ejecutadas:** GitHub confirma el diff pero no ejecuta tests ni build de la copia local. Ninguna prueba browser, responsive o visual se considera completada en este reporte.
- El header Full existente conserva logo/indicador/salida, pero **no trae nombre de sede**; el antiguo V4 sí lo mostraba. El contrato `CASHIER_STATE` actual no incluye un nombre de sede. Esta limitación de la UI preexistente no bloquea KPIs; documentar para backlog/decisión futura, no inventar datos ni añadir consulta backend en P5.
- Los escenarios de concurrencia real V6/V7 y prueba E2E autenticada también siguen fuera de la evidencia comprobada.

**Siguiente:** confirmar pruebas técnicas, revisar/corregir incidentes si los hubiera y realizar smoke humano para cerrar P5 e iniciar P6 global.
