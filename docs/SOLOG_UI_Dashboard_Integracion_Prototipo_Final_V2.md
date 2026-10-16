# SOLOG — UI Dashboard — Integración del prototipo final V2

**Estado:** **APROBADO Y CONGELADO — FUENTE PRIMARIA UI DASHBOARD V2.** Implementación iniciada (Fase 0), no validada todavía.
**Nivel:** B — sustitución funcional y visual acotada al módulo Dashboard del Admin.
**Ejecutor:** ChatGPT, directamente en esta conversación, con las herramientas de acceso a GitHub y las verificaciones disponibles. **No se delegará en Codex.**
**Repositorio/rama:** `Jack-Mnt/SOLOG` / `admin-work`. `master` queda fuera de alcance.
**Baseline remoto referencial comprobado:** `4cb3e9f4b63cc7c2de681ef70b8fa7d1bed47944`. Se debe actualizar antes de comenzar; el working tree local del usuario **no es visible** desde esta conversación.
**Fuente primaria UI:** este archivo, **aprobado y congelado el 15-10-2026**. Cambios posteriores mediante delta explícito.
**Fuente primaria técnica de transporte RPC ya congelada:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md`.
**Fuentes funcionales vigentes:** `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` y delta `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` (prevalece exclusivamente en lo que sustituye).
**Referencias UI transversales vigentes:** `docs/SOLOG_UI_Admin_Responsive_Shell_Controles_V1.md`, Design System, primitivas, tablas y overlays compartidos.
**Referencia visual:** `SOLOG_UI_Dashboard_Prototipo_Final_V1.html`, creado en esta conversación, interpretado **sin** los KPI ni controles heredados del Dashboard anterior.
**Documento precedente:** `SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V1.md` — **REEMPLAZADO** para plan y ejecución. Se mantiene histórico.
**Precedencia:** reglas funcionales congeladas > contrato backend congelado para payloads y respuestas > esta V2 para presentación y ejecución > prototipo HTML ilustrativo > implementación UI anterior. Si surge incompatibilidad concreta, detener el tramo afectado y resolver mediante delta aprobado; no reinterpretar silenciosamente.

## 1. Decisiones aceptadas y alcance

El usuario aprobó **reemplazar por completo la implementación visual/funcional actual del Dashboard**, incluidos sus KPI, Grid de turnos, accesos Snapshot, «Por recontar», «Descargar ajuste» y Drawer operativo antiguo, sin obligación de compatibilidad UX. No se eliminarán por ello funciones o archivos que consuman otros módulos.

La implementación se efectuará **íntegramente desde este chat**, sin Codex; ChatGPT prepara, modifica, registra y reporta cada fase. La rama `master`, el backend y los demás módulos Admin no se modifican salvo nueva decisión expresa. Este cambio de ejecutor sustituye las etapas metodológicas que originalmente asignaban a Codex la inspección y la ejecución.

**Qué debe quedar:** cinco tarjetas independientes y expandibles, una sola expandida simultáneamente (Cutervo como default), orden Cutervo / Huaca / Divino / Unidad / Casuarinas; tarjetas con cuatro KPI: 1) Cobertura de ronda con barra lineal y n/N, 2) Precisión actual con verde/amarillo/rojo y exenciones, 3) Riesgo Alto/Muy Alto, 4) Sobrantes vs Faltantes con signo. Dentro de la expansión: pestañas Riesgo, Rondas, Episodios y Actividad. Desde Actividad se abre el nuevo Drawer de **fecha** única. Datos remotos únicamente en producto final; en prototipo permanecen ficticios.

**Qué se conserva fuera del Dashboard:** Shell actual, Header 64 px, Sidebar responsive, SiteContext y store de acceso Admin, Design System, `AdminDialog`/primitivas compartidas, módulos Control/Catálogo/Productos/Grupos/Incidencias, exportación Excel de Control, las RPC y validadores v2 utilizados por otros módulos, ConeXion y Cajero V5.

## 2. Preflight dirigido ya efectuado

La inspección remota detecta:

- Página antigua: `src/features/solog/admin/dashboard/admin.dashboard.v2.tsx`, con `AdminDashboardV2`, `SiteCard`, `Grid` y `DailyDrawer`; 635 líneas en el baseline. Punto de sustitución contenido en el módulo actual.
- API anterior: `src/features/solog/admin/admin.v2.ts`, `adminRpc`/`AdminResponses`, `contract_version: 2` y rutas `rpc_solog_operational_v2`, `rpc_solog_admin_control_v1`, etc. La RPC de métricas **no** debe pasar por ese validador porque devuelve `contract_version: 1`, `quality`, `data` y **no** `revisions`.
- Caché Admin anterior: `src/features/solog/admin/admin.v2.store.ts`, basada en `revisions`; no modificarla globalmente para incorporar una respuesta sin revisiones. Se propone un cliente/estado de consultas nuevo, **aislado y acotado al Dashboard**, compatible con autenticación y limpieza de sesión existentes.
- Shell: `src/features/solog/admin/admin.v2.app.tsx`, carga diferida del Dashboard, navegación y Header/Sidebar existentes. Conservar sin rediseñarlo.
- CSS: `src/features/solog/admin/admin.css`, reglas antiguas `.admin-dashboard*` y `.admin-dashboard-daily*` que requieren inventario de consumidores antes de eliminar. Reutilizar tokens y clases transversales; evitar CSS global incontrolado.
- Test legacy: `tests/admin-dashboard-v3.test.ts` afirma que se llama `dashboard_cards` y `shift_grid`; esas expectativas quedarán obsoletas al reemplazar el Dashboard y deberán actualizarse, sin cambiar tests de funciones vigentes de otros módulos.
- Contrato `public.metrics_dashboard_v1` implementado en Supabase, siete acciones y permisos. **No se requiere implementar backend nuevo**.
- Actualmente no existe Admin/Moderador activo para smoke remoto real; no activar usuarios sin aprobación.

**Limitación del baseline:** solo se conoce el estado **remoto** de `admin-work`. No se ven archivos no confirmados/no subidos de la máquina del usuario. Antes de editar, comprobar el SHA más reciente de rama y del archivo afectado, informar divergencias y preservar cualquier avance ajeno. Si surge conflicto con un cambio remoto concurrente, detener esa edición para reconciliar en vez de sobrescribir.

## 3. Requisitos funcionales de implementación

### 3.1. Tarjetas y datos

- Ejecutar `overview` una vez por carga/invalidez autorizada, asociar por `site_id` y no por el nombre de sede. `overview` puede incluir las cinco sedes en una llamada; no pedir por tarjeta al estar colapsada.
- Mantener solo una tarjeta expandida a la vez, abrir/cerrar por mouse/teclado y respetar estado de foco. Cambiar de sede invalida cursores, ordenaciones dependientes y profundidad de Activity de la sede anterior; se puede conservar la pestaña de análisis solo si no produce estado cruzado.
- No transformar `null` en cero. La calidad y sus variantes (`complete`, `partial`, `no_data`, `insufficient` de Movimiento) deben presentarse sin confundir datos imputados y medidos. Los porcentajes son los devueltos por backend o presentación derivada estricta, no nuevos KPI calculados.
- No reproducir el bloque legado de Snapshot, «Por recontar» ni «Descargar ajuste». Su eliminación se limita a esta página.

### 3.2. Riesgo

- Acción `risk` con `site_id`, `sort` remoto `risk|value|difference`, límite inicial 6 y paginación cursor hasta 100 por solicitud. Renderizar diferencia y valorizado confirmados con signo, nivel y calidad Movimiento. No calcular puntajes C×D×V en el cliente.
- Al cambiar sort/sede, reiniciar lista, cursor y estado de error; evitar mezclar resultados de consultas tardías con nueva selección.

### 3.3. Rondas

- Acción `rounds` por sede, mostrar ronda actual, períodos/hitos, cobertura actual e histórica, aporte por turno y gráfico de precisión histórica con hasta **seis rondas cerradas reales**.
- El KPI de cada hito expresa la **duración entre `round_from` y el timestamp de 50/90/100**, en días/horas/minutos. Un hito no alcanzado, `null` o sin respaldo histórico no es «Completado» ni cero: mostrar pendiente o `N/D` según calidad.
- `historical_accuracy.green/red/exempt/without_evidence` y porcentaje son autoritativos; no reconstruir cortes con estado actual ni convertir un corte `no_data` en barra vacía equivalente a 0 %. No traspasar los datos ficticios del HTML a producción.

### 3.4. Episodios

- Acción `episodes` por sede con `scope=open|closed`; sort válido dependiente del scope; límite inicial 25, «Ver más» con cursor. Mostrar duración, recurrencias, nivel de riesgo y estado de disponibilidad del riesgo. Los cerrados tienen ventana contractual de 45 días; no truncar la duración de los abiertos.

### 3.5. Actividad y Drawer

- Acción `activity` con fechas **America/Lima**. Matriz transpuesta: **columnas=fechas** y **filas=Madrugada/Día/Noche**. Mostrar últimos cinco días incluido hoy y permitir agregar 5+5+5 hasta **20**. Orden cronológico presentado según prototipo; en móvil, scroll horizontal confinado a la matriz, no a toda la página.
- Status `in_progress|closed|no_tasks|no_data` y `quality` explícitos; `0/0` verificable difiere de `N/D`. Los rangos acumulados nunca excederán los 31 días aceptados por backend.
- Seleccionar una celda abre el **detalle de toda la fecha**, no un Drawer de un turno específico. Acción `day` aporta actividad física, episodios y confirmaciones completas de la fecha; `day_observations` devuelve observaciones con cursor (25 iniciales). No inventar una paginación para `confirmed_differences`: la respuesta viene completa.
- Reutilizar overlay y mecanismos accesibles compartidos; no conservar Drawer diario antiguo dentro de Dashboard.

### 3.6. UX y estados

- Loading, error/reintento, vacío válido, sin datos, calidad parcial, sin autorización y caducidad de cursor. Error técnico no se presenta como «Sin tareas» o como cifra cero.
- Componentes interactivos con roles, nombre accesible, `aria-expanded`/`aria-selected` correctos, teclado (Enter/Espacio, Escape, foco gestionado), no scroll de fondo con Drawer, soporte reduced-motion cuando aplique.
- Responsive del Shell congelado: Desktop >=1024, Tablet 768–1023, Mobile <768. No rediseñar Header/Sidebar ni romper SiteContext.

## 4. Estrategia de integración y control de riesgos

- Nueva capa de contrato Dashboard V1: tipos explícitos, validación en runtime del envelope y del contenido relevante, normalización de errores SQL en mensajes legibles, `supabase.rpc('metrics_dashboard_v1', {p_action,p_payload})`. **Separada** de `adminRpc` V2.
- Caché y solicitudes del Dashboard **por identidad, sede, acción y parámetros relevantes**; deduplicación de peticiones simultáneas y descarte de respuestas obsoletas tras cambio de sede, filtro, usuario o refresh. No introducir polling automático sin decisión aprobada; carga lazy del detalle de sede expandida. Los cursores duran 30 minutos y no garantizan snapshot MVCC entre páginas; reiniciar al vencer o actualizar.
- Mantener la autorización de acceso existente del Admin; la RPC también vuelve a verificar `auth.uid()` y rol. No exponer tablas 0inventario0 directamente.
- Los cambios no relacionados que surjan se anotan en backlog. Si aparece una incompatibilidad de contrato real, **parar el tramo afectado** y pedir aprobación del delta mínimo antes de tocar Supabase o reinterpretar la UI.
- Cambios de repositorio desde esta conversación: usar la rama correcta, comprobar SHA de cada archivo y el HEAD actual, realizar commits pequeños por fase, informar enlaces/SHAs, no forzar actualizaciones y nunca tocar `master`.
- El entorno local de desarrollo del usuario no se ve desde las herramientas remotas. Para validación final, obtener checkout verificable de `admin-work` cuando sea técnicamente posible; si no es posible ejecutar pruebas aquí, no declararlas aprobadas y solicitar sus salidas, o utilizar CI existente con evidencia directa verificable.

## 5. Plan propuesto por fases — toda la ejecución en este chat

| Fase | Alcance de implementación | Resultado verificable / checkpoint |
|---|---|---|
| **0. Congelar y establecer baseline** | Tras aprobación del usuario: congelar este archivo, versionarlo en `docs/`, incorporar el HTML como referencia visual etiquetada *no ejecutable*, inspeccionar HEAD y consumidores directos, inventariar archivos/estilos/tests que se sustituirán. Sin frontend nuevo en esta fase. | Fuente UI única congelada; mapa de dependencias y baseline remoto registrados. |
| **1. Capa de datos V1** | Tipos TS, cliente RPC específico, validadores V1, manejo de errores y `null`, store/caché local del Dashboard, deduplicación/abort lógico y cursores; mantener validadores/store V2 para otros módulos. | Contrato exacto implementado a nivel de código, sin lógica de presentación adicional. |
| **2. Tarjetas y composición principal** | Reemplazar `AdminDashboardV2`, `SiteCard`, `Grid` y KPI antiguos con cinco tarjetas expandibles y los cuatro KPI nuevos; barra lineal, composición responsive y estados básicos. | Dashboard principal sobre `overview` y diseño visual del prototipo. |
| **3. Riesgo y Rondas** | Navegación por tabs dentro de tarjeta; ranking paginado/sort y Rondas con hitos duracionales, cobertura, contribuciones y gráfico histórico real N/D. | Dos vistas funcionales integradas con RPC desplegada. |
| **4. Episodios y Actividad** | Scope/sort/cursor de episodios y matriz de días transpuesta 5→20; estados por celda, fecha Lima, scroll contenido y selección de fecha. | Dos vistas funcionales sin datos falsos ni errores de estado cruzado. |
| **5. Drawer diario y consolidación frontend** | Nuevo Drawer `day` + `day_observations`; estados, paginación y accesibilidad; eliminar código CSS/JSX/tests obsoletos *solo* del Dashboard tras verificar consumidores; actualizar documentación de implementación. | Implementación frontend completa, **todavía no declarada validada**. |
| **6. Validación técnica CONSOLIDADA** | Tras terminar fases 1–5: `bun test --reporter=dot`, `bun run lint`, `bun run build` (incluye typecheck), `git diff --check`, pruebas de contrato, caché, cursores, N/D, estados, tabs, foco, Drawer, responsive, benchmark UI razonable, revisión de dependencias y regresión de Control/otros módulos Admin. Resolver fallos y repetir controles afectados. | Reporte con evidencia ejecutada y limitaciones concretas, aprobación técnica del usuario para pasar al smoke. |
| **7. Smoke humano y cierre** | El usuario recorre Preview/entorno autorizado: cinco sedes, expandir/colapsar, KPI, ranking, rondas, episodios, actividad 5→20, Drawer único, N/D, tablet/móvil y Control intacto; registrar incidencias y corregirlas. | Aceptación humana explícita; cerrar bloque y registrar HEAD de cierre. |

**Cadencia solicitada:** no ejecutar la batería formal de tests/lint/build ni certificar fases intermedias antes de completar la fase 5. En fases 1–5 se permite comprobar sintaxis o inspecciones mínimas necesarias para no propagar un bloqueo evidente, sin presentar esos controles como validación técnica aprobada. La validación formal se concentra en Fase 6 y el smoke humano se hace después.

## 6. Validación final y casos límite prioritarios

- Contrato V1 vs contrato V2: nunca validar respuesta nueva con `Envelope` antiguo ni asumir `revisions`.
- Cambiar de sede/pestaña/orden mientras hay request pendiente: no mostrar datos de otra sede ni aceptar páginas de un cursor viejo.
- Ronda actual sin cierre histórico, corte N/D, hitos null, precisión 0/0 exenta, sin física, diferencia confirmada todavía amarilla, C24 imputado.
- KPI con valores negativos y `null`; estados `partial` y `no_data`; sin división por cero, sin placeholders falsos.
- Activity en Lima si el navegador está en otra zona horaria, hoy+4 anteriores, carga hasta 20 y cambios de día; matriz responsiva sin overflow de la página.
- Drawer fecha única con recuento físico independiente de turnos, confirmaciones históricas completas, paginación de observaciones normales/reconteos y cierre de foco.
- Revisión de tests legacy que referencian `dashboard_cards`, `shift_grid` o `daily_detail`; no eliminar tests de Control ni funciones compartidas que sus componentes utilizan.
- Confirmar acceso admin real solo cuando exista usuario habilitado por decisión expresa. Nunca activar cuentas para probar sin autorización.

## 7. Aprobación y ejecución

**Aprobado explícitamente por el usuario el 15-10-2026.** Se autoriza ejecutar Fases 0–5 desde este chat, con implementación únicamente frontend en `admin-work`, reutilizando el Design System definido en CSS existentes. Las baterías técnicas integrales quedan concentradas en Fase 6; el smoke humano del Dashboard será Fase 7. No se amplía el alcance ni se tocan backend o `master` sin autorización.