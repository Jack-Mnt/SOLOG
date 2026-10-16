# SOLOG — UI Dashboard — Reporte Fase 2, tarjetas y composición principal V1

**Estado:** IMPLEMENTACIÓN FRONTEND REGISTRADA EN `admin-work`; **NO VALIDADA TÉCNICAMENTE** (pruebas consolidadas aplazadas a Fase 6).
**Fuente primaria UI:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md` — APROBADA/CONGELADA.
**Contrato de transporte:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` — CONGELADO.
**Referencia visual:** `docs/prototipos/SOLOG_UI_Dashboard_Prototipo_Final_V1.html`, **ilustrativa**, no se traslada su CSS/JS mock.
**Rama:** `admin-work`; ningún cambio en `master` ni en Supabase.

## 1. Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/features/solog/admin/dashboard/admin.dashboard.v2.tsx` | Reemplazo integral de componente heredado (635 líneas) por Dashboard `overview` con cinco sedes activas del backend, orden operativo, expandir/contraer, actualización manual y estado de error/carga. Mantiene el export `AdminDashboardV2` del Shell existente. |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.cards.tsx` | Nuevo componente `DashboardSiteCard`; KPI cobertura con `progress`, precisión verde/amarillo/rojo + exentos 0/0/sin evidencia, riesgo alto/muy alto y Sobrantes/Faltantes sin neteo; `DashboardSiteDetail` con pestañas accesibles preparadas. |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.css` | CSS local para la composición, utilizando **solo tokens existentes** y `admin-v2-card`, sin nueva paleta ni breakpoints generales. Adaptación fluida de KPI y regla móvil existente a 767 px. |

## 2. Comportamiento incorporado

- `overview` se solicita mediante el cliente V1 creado en Fase 1. **Una llamada para las sedes**, no una solicitud por tarjeta.
- Sedes ordenadas Cutervo/Huaca/Divino/Unidad/Casuarinas según `orderedAdminSites`; Cutervo se expande de manera predeterminada cuando el backend la devuelve. Solo una sede abierta, todas pueden colapsarse.
- Identificación de cada sede por UUID, nunca se usa el nombre como clave de estado o caché.
- Cabecera con cantidad de sedes, instante `generated_at` formateado en `America/Lima` y botón de actualización explícita.
- Cobertura: `counted/required/percent` y barra lineal, si el backend aporta denominador válido. `null` mantiene `N/D`; `0` verificable se presenta como `0`.
- Precisión: proporciones del backend en barra segmentada y leyenda; amarillo, rojo, exentos 0/0 y sin evidencia visibles. **No** se divide ni recalcula el denominador por cuenta propia.
- Riesgo: conteos alto/muy alto, con `quality=no_data` presentado como `N/D`, y `partial` distinguido de valores completamente medidos.
- Valorizados: montos con **signo tal como el backend los devuelve**, visibles separadamente para sobrantes y faltantes; `null` como `N/D`, sin neteo ni estimación.
- Tabs Riesgo/Rondas/Episodios/Actividad: accesibles por tecla izquierda/derecha/Home/End, con `role=tablist/tab/tabpanel`, `aria-selected`, control de foco y destinos `aria-controls` estables.
- Contenido de esas pestañas está expresamente marcado como **pendiente de Fase 3 o 4**; no se presentan datos inventados.
- No se implementan el nuevo Drawer ni las observaciones físicas todavía: alcance reservado a Fase 5.

## 3. Reutilización del Design System

- Estructura de superficie: `admin-v2-card`, mismos radios/bordes/sombras semánticos.
- Tokens de `src/foundations.css`: `--color-surface`, `--color-surface-secondary`, `--color-border`, `--color-border-strong`, `--color-text-primary`, `--color-text-secondary`, `--color-primary`, `--color-primary-subtle`, `--color-success`, `--color-warning`, `--color-danger`, `--shadow-default`, `--shadow-elevated`, `--radius-small`, `--radius-control`, `--radius-panel`, `--transition-fast`.
- Botón de actualización reutiliza `button button--secondary`; carga y error reutilizan `QueryState` y `PanelLoader` existentes.
- Shell, Sidebar, Header, SiteContext y CSS globales **no cambiados**. La antigua hoja global `.admin-dashboard*` queda intacta para inventario/limpieza dirigida de Fase 5; la nueva vista usa namespace `.solog-dash*` y no hereda clases exclusivas antiguas.
- La cuadrícula usa `repeat(auto-fit, minmax(min(100%, 230px), 1fr))`; no se añadió breakpoint global intermedio.

## 4. Integridad y límites

- No hay dependencias nuevas, datos mock, mutaciones en backend ni cambios en `admin.v2.ts`, `admin.v2.store.ts` o módulos Control/Cajero.
- El Dashboard anterior desaparece únicamente del módulo; `AdminExportDialog` permanece disponible para Control y no se ha eliminado.
- Tests legacy `tests/admin-dashboard-v3.test.ts` siguen esperando componentes/acciones antiguas. Se actualizarán en Fase 5 y verificarán en Fase 6, **no se falsea la validación presente**.
- No se ejecutaron `bun test`, lint, build, typecheck ni comprobaciones visuales/browser en esta fase por decisión del usuario.
- Working tree local fuera del repositorio remoto no es visible; las escrituras se hicieron con SHA del archivo en la rama `admin-work`.

## 5. Siguiente fase

**Fase 3:** incorporar componentes reales de `risk` y `rounds` en los paneles preparados: ranking 6 inicial y cursores/ordenación, hitos con duración desde `round_from`, gráfico histórico con hasta seis cortes reales sin inventar datos y aportes por turno.

**Situación de la fase:** código registrado y conectado; **validación técnica aplazada** hasta Fase 6, smoke humano tras aprobación del reporte final.
