# SOLOG — UI Dashboard — Baseline e inventario de dependencias Fase 0 V1

**Estado:** FASE 0 PREPARADA, SIN VALIDACIÓN TÉCNICA FORMAL.
**Fuente primaria UI:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md` — aprobada/congelada 15-10-2026.
**Contrato API:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` — congelado.
**Referencia visual:** `docs/prototipos/SOLOG_UI_Dashboard_Prototipo_Final_V1.html` — solo ilustrativa, sus datos, CSS aislado y JS mock NO se transportan a producción.
**Baseline remoto ANTES de cambios:** rama `admin-work`, HEAD `4cb3e9f4b63cc7c2de681ef70b8fa7d1bed47944`.
**Visibilidad:** inspección remota por API GitHub; **working tree local, cambios no enviados y resultados locales no accesibles**, por lo que no se declara baseline local verificado.

## 1. Componentes y archivos

| Archivo | Función previa | Cambio permitido |
|---|---|---|
| `src/features/solog/admin/dashboard/admin.dashboard.v2.tsx` | Página Dashboard anterior con `SiteCard`, `Grid`, `DailyDrawer` | Reemplazo integral de contenido; conservar export `AdminDashboardV2` o adaptar su import sin tocar router general |
| `src/features/solog/admin/admin.css` | CSS global compartido con grupos, tablas y drawers; reglas `.admin-dashboard*` heredadas | Retirar únicamente selectores **exclusivos** del Dashboard anterior tras revisar consumidores; estilos nuevos limitados a módulo, reutilizando tokens |
| `src/features/solog/admin/admin.v2.ts` | Contrato V2 con `dashboard_cards`, `shift_grid`, `daily_detail_*`, Control y export | **Preservar la API V2 para otros usos**. La nueva RPC V1 tendrá cliente y validador exclusivos |
| `src/features/solog/admin/admin.v2.store.ts` | Caché V2, bootstrap, revisiones e invalidaciones del Admin | Mantenerla intacta; no mezclar `contract_version: 1` con `Envelope v2` |
| `src/features/solog/admin/admin.v2.context.tsx` | Contexto principal y hook `useAdminQuery` V2 | Reutilizar acceso/identidad únicamente; Dashboard nueva con caché independiente |
| `src/features/solog/admin/admin.v2.app.tsx` | Shell Admin, lazy import del Dashboard, Header, Sidebar, SiteContext | Preservar completamente layout, responsive y navegación; mantener import funcional del nuevo Dashboard |
| `src/features/solog/admin/admin.dialog.tsx` | Overlay accesible compartido | Reutilizar para Drawer nuevo, **no modificar** focus trap, scroll lock, stack, transiciones |
| `src/features/solog/admin/admin.primitives.tsx` | IconButton, filtros y tablas reutilizables | Consumir primitivas, no rediseñarlas |
| `src/features/solog/admin/admin.v2.presentation.tsx` | Estado de carga/error y formato de valores | Reutilizar cuando convenga sin acoplarlo a validador V2 |
| `src/foundations.css` | Tokens principales de marca y paletas, fuentes, superficies, bordes, radios y sombra | No modificar. Preferir `--color-primary`, `--color-surface`, `--color-surface-secondary`, `--color-border`, `--color-text-secondary`, `--color-success`, `--color-warning`, `--color-danger`, `--shadow-default`, `--radius-panel` y `--transition-fast` |
| `tests/admin-dashboard-v3.test.ts` | Asserts frágiles de llamadas legacy `dashboard_cards`, `shift_grid` y totales antiguos | Sustituirlos **solo en Fase 5**, para reconocer contrato Dashboard V1 y funcionalidad nueva; no eliminar tests de Control |
| `tests/admin-dashboard-v3.browser.mjs` | Entry de harness de navegador Admin V2 | Revisar compatibilidad de harness en Fase 6 |

## 2. Contratos y diseño

- `metrics_dashboard_v1`: siete acciones `overview`, `rounds`, `risk`, `episodes`, `activity`, `day`, `day_observations`, `contract_version: 1`, ninguna propiedad `revisions`.
- V2 anterior: `contract_version: 2`; AdminStore V2 valida revisiones operacionales y de catálogo; **no introducir RPC Dashboard V1 en ese store**.
- Dashboard se limita al contenido de `/admin`. Sin Snapshot ni `Por recontar` ni botón Exportar en esta pantalla; el módulo Control conserva sus operaciones.
- Diseño: `admin-v2-card`, `admin-main-table`, `admin-auxiliary-table`, `admin-state-views`, `icon-button`, `admin-dialog`, `notice`, paletas de `foundations.css`.
- Responsive congelado `>=1024` Desktop / `768-1023` Tablet / `<768` Mobile, Header 64 px, Sidebar 200/64/Drawer.
- El HTML de prototipo **no** es código para insertar tal cual, especialmente sus valores ficticios y sus variables CSS locales. La apariencia se implementará con los tokens existentes.

## 3. Riesgos y límites

1. GitHub remoto puede no incluir cambios locales del usuario. Antes de cada escritura leer HEAD y blob SHA, preservar todos los cambios remotos sobrevenidos; nunca forzar historial.
2. Los componentes retirados tienen tests legacy basados en texto de implementación; revisarlos al completar el reemplazo, sin alterar otros tests funcionales.
3. No eliminar rutas RPC/Admin V2, `AdminExportDialog` ni funciones usadas por Control aunque el Dashboard deje de importarlas.
4. Si la forma RPC V1 difiere de la fuente congelada se detiene la parte dependiente y se propone delta backend a aprobación; Codex no participa y Supabase no se modifica en este bloque.
5. **Batería técnica formal después de Fase 5**, smoke humano solo después de aprobación de Fase 6. Fase 0 y siguientes no declaran pruebas que no se ejecutaron.

## 4. Estado

**Fase 0:** fuente primaria UI congelada y repositorio provisto de prototipo visual; baseline remoto inventariado. Próxima Fase 1 — capa RPC V1 independiente.
