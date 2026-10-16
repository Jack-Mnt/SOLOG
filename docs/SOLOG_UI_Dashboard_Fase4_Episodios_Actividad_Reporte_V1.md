# SOLOG — UI Dashboard — Fase 4: Episodios y Actividad — Reporte V1

**Estado:** IMPLEMENTADO Y VERSIONADO EN `admin-work`, **NO VALIDADO TÉCNICAMENTE**. La batería completa sigue aplazada a la Fase 6 por decisión expresa del usuario.  
**Fecha:** 2026-10-16 (America/Lima).  
**Nivel:** B, frontend funcional acotado a Dashboard.  
**Fuente primaria UI:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md` — congelada.  
**Contrato de datos:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` — congelado.  
**Referencia visual:** `docs/prototipos/SOLOG_UI_Dashboard_Prototipo_Final_V1.html` — no productiva, sin datos mock integrados.  
**Baseline remoto inicial de esta fase:** `2be21aa496a5f54afedd5d6efc7b9a416598c201`.  
**Rama:** `admin-work`. No se tocó `master` ni backend.

## 1. Archivos y cambios

| Archivo | Acción | Contenido |
|---|---|---|
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.episodes.tsx` | Creado | Vista de Episodios, switch de ámbito abierto/cerrado, sort del servidor, paginación cursor 25 por lote, duración y recurrencias físicas |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.activity.tsx` | Creado | Actividad transpuesta: fechas como columnas, turnos como filas, fechas de negocio Lima y ventana acumulativa 5→10→15→20 días |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.activity-episodes.css` | Creado | CSS local de ambas vistas, scrolling horizontal confinado a la matriz, tokens del Design System |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.cards.tsx` | Actualizado | Conecta tabs Episodios/Actividad, selecciona una fecha completa y deja explícito el Drawer de Fase 5; retira metadatos temporales de fase |
| `src/features/solog/admin/dashboard/admin.dashboard.v2.tsx` | Actualizado | Importa hoja CSS modular de las dos vistas nuevas |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.css` | Ajuste dirigido | Permite overflow visible de tarjeta para no recortar el menú existente `AdminSort` al expandirse |

## 2. Episodios

- Consume únicamente la RPC congelada `metrics_dashboard_v1('episodes')`.
- Dos ámbitos excluyentes: `open` y `closed`, mediante `AdminBinarySwitch` existente.
- Ordenaciones `importance|recurrence|persistence` solo en abiertos, mediante `AdminSort` existente. Cerrados utiliza exclusivamente `sort='recent'`; su consulta física es de los últimos 45 días, según contrato backend.
- Cambio de ámbito/orden reinicia lista y cursor mediante instancia `key` distinta. Una página tiene máximo 25 resultados; “Mostrar 25 más” consume `next_cursor` opaco sin modificarlo. Se evitan duplicados por `episode_id` durante el append best-effort; no se promete consistencia MVCC entre lecturas.
- Columnas: grupo, apertura, cierre para episodios cerrados, recurrencias 45d, persistencia, riesgo y estado de riesgo. Duración de episodios abiertos **sin tope artificial de 45 días**.
- `risk_status='pending_confirmation'|'not_available'` se presenta como pendiente/N/D, no como un nivel inferido. Calidad parcial expuesta.
- Error de paginación muestra opción para reiniciar la lista y no declara los datos anteriores como actualizados.

## 3. Actividad

- Consulta `metrics_dashboard_v1('activity')` con `date_from,date_to` dentro del límite backend de 31 fechas inclusivas; los rangos usados son exactamente 5, 10, 15 y 20 días.
- Fecha actual calculada desde `Intl.DateTimeFormat('en-US',{timeZone:'America/Lima'})` por partes, no desde la zona local del navegador. Sumas/restas `YYYY-MM-DD` por UTC para evitar saltos locales; presentación de fechas en Lima.
- **Columnas = fechas** ordenadas de más antigua a la fecha actual, dejando hoy a la derecha; **filas = Madrugada/Día/Noche**. Al pulsar “Cargar 5 días anteriores” se amplía el rango hacia atrás y se conserva la fecha de hoy.
- Valores de celda: `completed/required` y porcentaje devueltos por servidor, sin recalcular avance. `status: in_progress|closed|no_tasks|no_data` y `quality` claramente diferenciados; `no_tasks` = Sin tareas, `no_data` = N/D. Cuando el backend no aporta comparables no se inventan ceros.
- El encabezado de fecha y cada celda seleccionan **la fecha completa** (no turno) mediante callback `onSelectDate`; la sede preserva el UUID de contexto. **Fase 4 solo registra la selección y presenta un aviso transitorio identificando la fecha; el Drawer real y las acciones `day/day_observations` se implementarán en Fase 5.**
- Superficie `admin-main-table` con `overflow-x:auto` propia y primera columna sticky, sin scrolling horizontal de la página completa.

## 4. Diseño, protección de alcance y estado

- Reutiliza `AdminBinarySwitch`, `AdminSort`, `QueryState`, `admin-main-table`, botones `button--secondary` y colores `var(--color-*)`, radios y superficies CSS ya existentes.
- No se cambiaron `foundations.css`, `admin.css`, el Shell, Header, Sidebar, SiteContext, rutas, Control, Cajero, RPC, migraciones o Supabase.
- La pequeña corrección `overflow:visible` de la tarjeta permite al menú absoluto `admin-sort__menu` funcionar sin quedar recortado; se limita al Dashboard.
- No se instalaron dependencias ni se incorporaron datos ficticios. Los siete contratos RPC siguen congelados.
- La visibilidad de GitHub permite establecer HEAD remoto y blobs SHA; no equivale a visibilidad de los cambios locales no subidos.

## 5. Validación y fase siguiente

**Inspección remota estructural solamente:** presencia de archivos, imports y conexión de los componentes; no equivale a tests, lint, TS, build o verificación browser.

**Pendiente por decisión del usuario:** `bun test`, `bun run lint`, `tsc -b`, `bun run build`, `git diff --check`, responsive, accesibilidad y smoke. La **Fase 6** reunirá las validaciones y correcciones; la **Fase 7** será el smoke humano.

**Siguiente:** **Fase 5 — Drawer de día único, `day` + `day_observations`, paginación de 25 observaciones y consolidación/limpieza de código exclusivo del Dashboard antiguo**. En esa fase se retirará el aviso provisional de fecha seleccionada para abrir el Drawer real y se revisará el test legado `tests/admin-dashboard-v3.test.ts`.
