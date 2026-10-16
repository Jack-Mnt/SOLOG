# SOLOG — UI Dashboard — Fase 3: Riesgo y Rondas — Reporte V1

**Estado:** IMPLEMENTADA EN `admin-work`; **VALIDACIÓN TÉCNICA FORMAL PENDIENTE (FASE 6)**.
**Fecha:** 2026-10-16 — America/Lima.
**Clasificación:** Nivel B, frontend acotado.
**Fuente primaria UI:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md` — APROBADA/CONGELADA.
**Contrato RPC:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` — CONGELADO.
**Design System:** `src/foundations.css`, primitivas, tablas, tokens, estados y geometrías Admin existentes.
**Rama:** `admin-work`; `master` intacta.
**Baseline al inicio de esta fase:** `b15a339ed866c6623fc188aae01e71061ad4a74d`.

## 1. Cambios registrados

| Archivo | Modificación |
|---|---|
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.risk.tsx` | Nuevo ranking de Riesgo, 6 por página, ordenación `risk/value/difference` vía `AdminSort`, keyset `next_cursor`, acumulación sin duplicar por `group_id`, errores y reinicio |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.rounds.tsx` | Nueva vista Rondas: ronda vigente, selección entre rondas de período actual, cobertura, duración de hitos, aportes por turno, gráfico histórico hasta 6 cierres y tabla tabular accesible |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.views.css` | Reglas locales para tabla Riesgo, etiquetas de niveles/Movimiento, hitos, contribuciones y gráfico; usa `--color-*`, radios y controles comunes |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.cards.tsx` | Conecta tabs Riesgo/Rondas reales y transmite el `DashboardMetricsStore` existente; deja Episodios/Actividad como placeholders identificados |
| `src/features/solog/admin/dashboard/admin.dashboard.v2.tsx` | Pasa store por sede e importa CSS específico de las vistas analíticas |

## 2. Riesgo

- Usa solo `metrics_dashboard_v1('risk')` con `site_id`, `sort`, `limit:6` y `cursor` opaco.
- Cambiar orden restablece filas y cursor; una sola página activa se consulta cuando se pulsa “Mostrar 6 más”. El backend mantiene el orden y el total; el frontend no reordena ni calcula `C×D×V`.
- Filas: nombre, diferencia con signo, importe confirmado con signo o `N/D`, nivel (`bajo/medio_bajo/medio/medio_alto/alto/muy_alto`), calidad Movimiento (`complete/partial/insufficient`).
- `C24` insuficiente se identifica explícitamente como backend imputado `C=1`; no se presenta como medido. `null` no pasa a cero.
- El botón de reinicio actúa sobre el contexto de ranking si el cursor vence o queda inválido; se conservan las páginas anteriores mientras se reporta un error de una página posterior, sin presentarlas como actualización recién completada.
- El hook del Dashboard V1 impide publicar una respuesta de un cursor/sort/sede anterior en el contexto visible. El store es por instancia de Admin Dashboard, usuario y rol. No se ha introducido polling.

## 3. Rondas

- La RPC `rounds` por sede es la única fuente de hitos y cierres. Si no existe ronda vigente, aparece un estado explícito sin datos.
- Hitos de **50 %, 90 % y 100 %**: duración cronológica desde `round_from` hasta el timestamp `milestones[key]`, en **días, horas y minutos**; no se sustituye por “Completado”. Instante nulo se distingue como “Pendiente” en ronda en curso, “No alcanzado” en corte verificable, o `N/D` cuando la calidad no permite afirmar nada.
- Ronda seleccionada: período, inicio/cierre, cobertura n/N y porcentaje autoritativo, precisión binaria del corte congelado cuando existe, `cut_version` y aportes por madrugada/día/noche.
- Evolución histórica: `history` autoritativo, máximo 6 cortes cerrados, presentación en orden cronológico de izquierda a derecha con barras proporcionales verde/rojo y trazado del porcentaje verde retornado por backend. Los cortes con precisión `null`, denominador cero o calidad `no_data` quedan **N/D** y no se conectan mediante una línea ficticia.
- Acompaña al gráfico una tabla accesible con verde, rojo, exentos 0/0, sin evidencia, % verde y calidad por ronda.
- Las fechas/hitos se presentan en `America/Lima` con `Intl.DateTimeFormat`; el tiempo transcurrido usa timestamps UTC/offset reales, no diferencias entre fechas formateadas.
- **No se emplearon** datos ni porcentajes ficticios del HTML; no se modificaron cortes históricos.

## 4. Diseño y límites

- Reutiliza `AdminSort`, `QueryState`, `admin-main-table`, `admin-auxiliary-table`, `button button--secondary`, la barra de scroll local y los tokens CSS de SOLOG.
- Ningún cambio a `src/foundations.css`, `src/features/solog/admin/admin.css`, Shell, Header, Sidebar, otras vistas Admin, Cajero, backend o esquema.
- CSS con breakpoints Admin existentes `1024/768` (media queries `max-width:1023px` y `max-width:767px`); la tabla/gráfico pueden desplazarse horizontalmente **dentro de sus superficies**, sin introducir scroll a toda la página.
- Las pestañas 3–4 siguen pendientes: **Episodios y Actividad corresponden a Fase 4**; el Drawer diario a Fase 5.

## 5. Validación y siguiente etapa

**Inspección estática limitada:** comprobados HEAD remoto, presencia de los archivos, imports de los paneles y `tsconfig.app.json` con `ES2022` y `strict`; no equivale a build.

**No se ejecutaron** `bun test`, `bun run lint`, `tsc -b`, `bun run build`, `git diff --check`, pruebas de navegador ni smoke humano porque el plan aprobado reserva la validación técnica consolidada para **Fase 6**, después de completar todas las implementaciones, y el smoke para **Fase 7**. Errores de integración o TypeScript que pudieran aparecer siguen pendientes de comprobar y corregir entonces.

**Siguiente etapa:** Fase 4 — Episodios (abiertos/cerrados, sort contextual y cursor) y Actividad (matriz transpuesta de 5 a 20 días), reutilizando los mismos tipos/cliente/store V1 y Design System.
