# SOLOG — UI Dashboard — Reporte de Fase 1: Capa de datos RPC V1

**Estado:** IMPLEMENTADA EN REPOSITORIO, **SIN VALIDACIÓN TÉCNICA FORMAL** (aplazada a Fase 6 por decisión del usuario).
**Rama:** `admin-work`. `master` fuera de alcance.
**Fuente primaria UI:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md` — aprobada y congelada.
**Contrato:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` — congelado; ningún cambio a Supabase.
**Referencia visual:** `docs/prototipos/SOLOG_UI_Dashboard_Prototipo_Final_V1.html` — datos ficticios solo ilustrativos.
**Fase anterior:** 0 completada (baseline + fuentes versionadas). Referencia del baseline previo a cambios: `4cb3e9f4b63cc7c2de681ef70b8fa7d1bed47944`.

## 1. Archivos nuevos

| Archivo | Contenido |
|---|---|
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.types.ts` | Tipos explícitos del Envelope V1, siete payloads, siete respuestas, calidad, valores nullable y cursores |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.contract.ts` | Validación runtime por acción, campos, scopes y formatos, límites de páginas, fechas Lima, rangos y partición de precisión |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.rpc.ts` | Llamada exclusiva `supabase.rpc('metrics_dashboard_v1',{p_action,p_payload})`, error legible, separación de `adminRpc` V2 |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.store.ts` | Caché aislada por usuario/rol/acción/parámetros/sede, deduplicación concurrente, caducidad, descarte lógico tras invalidación/cambio de contexto y disposición |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.hooks.ts` | Hook React de carga lazy, reintento, states y supresión de respuestas anteriores a sede/filtro activos |

## 2. Decisiones de integración

- La nueva capa **no importa** `Envelope`, `AdminPayloads`, `adminRpc` ni `AdminStore` para interpretar `contract_version:1`.
- Permanecen intactos `admin.v2.ts`, `admin.v2.store.ts`, `admin.v2.app.tsx`, `admin.css`, `foundations.css`, demás módulos Admin y componentes compartidos.
- Ninguna función inventa datos, transforma `N/D` a cero ni recalcula diferencias/riesgo. Los validadadores distinguen expresamente tipos numéricos nulos, `quality` y `movement_quality`.
- No se aplica polling automático. La página futura decidirá cargar `overview` al abrir y vistas de detalle al expandir, aprovechando caché y deduplicación.
- Los cursores se transportan opacos sin decodificar su semántica en el cliente; el servidor valida el vencimiento de 30 minutos. La caché de páginas con cursor tiene vida más corta para evitar reusar páginas antiguas.
- El store invalida por acción/payload sin cancelar consultas ajenas; refresh general invalida todas y descarta promesas viejas. Al destruirse la página, se debe llamar `dispose()`.

## 3. Situación y pendientes

**Sin cambios visuales en /admin todavía.** Esta fase solo incorpora infraestructura para las fases 2–5; el Dashboard anterior continúa funcionando sin conectar los archivos nuevos. La referencia visual no es código ni CSS listo para producción.

**Validación aplazada:** no se ejecutaron `bun test`, lint, typecheck, build ni browser; se harán conjuntamente en Fase 6, después de las fases funcionales, conforme al plan aprobado. La inspección de existencia en rama remota no equivale a aprobación técnica.

### Para Fase 2

1. Conectar `AdminDashboardV2` a la capa nueva y desmontar la implementación antigua solo en ese componente.
2. Conservar el Shell sin cambios y reutilizar `admin-v2-card`, tokens existentes en `foundations.css`, primitivas compartidas y clases `admin-main-table`.
3. Renderizar cinco sedes con KPI `round/accuracy/risk/surplus/shortage`, expansión accesible y estados `null/N/D` explícitos.
4. No trasladar variables CSS o datos ficticios embebidos en HTML a producción.
5. No eliminar todavía clases compartidas ni tests legacy; limpieza dirigida tras fase 5.

## 4. Delimitación

**Fase 1: lista para integración**, pero no validada formalmente. No se modificó la base remota, ni `master`, ni permisos, ni Contrato V1. La próxima etapa del plan aprobado es **Fase 2 — Tarjetas y composición principal**.
