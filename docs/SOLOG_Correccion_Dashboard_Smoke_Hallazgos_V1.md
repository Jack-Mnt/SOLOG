# SOLOG — Corrección — Dashboard — Hallazgos smoke Fase 7 — Delta V1

**Estado:** DELTA FUNCIONAL APROBADO mediante los tres hallazgos explícitos del usuario durante el smoke humano; pendiente de validación de correcciones.
**Fuente primaria vigente:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md`. Este delta solo sustituye las reglas citadas; lo demás conserva vigencia.
**Contrato RPC prevalente:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md`. No se modificará el backend ni se relajará el esquema general.
**Rama:** `admin-work`. `master` fuera de alcance.
**Baseline remoto antes del delta:** `bdb43d7b2a5d51b6b4c4a70179134fd2b4de56c4`.
**Clasificación:** Nivel B, corrección funcional/presentación acotada a Dashboard y pruebas relacionadas.

## Evidencia y decisiones

### D1 — Rondas: rechazo de respuesta real
- El usuario detectó “Respuesta del Dashboard incompatible con el contrato V1” en Cutervo/Rondas.
- Preflight con lectura no destructiva en Supabase del helper desplegado `inventario.metrics_dashboard_rounds_v1` constató que `history[]` con `quality:'no_data'` retorna `shift_contributions:{}`, aunque el validador frontend requería `early`, `day` y `night` (nullable) en todos los ítems.
- **Corrección frontend limitada:** aceptar el objeto vacío **solo si el RoundItem completo tiene quality=no_data**. Para calidad `complete` o `partial`, siguen siendo obligatorias las tres claves tipadas. Un objeto `{early:null,day:null,night:null}` sigue válido. La vista trata las claves ausentes del corte sin datos como `N/D`; **no asignar 0**.
- Se conserva registro de la irregularidad del serializador desplegado, sin alterar backend ni declarar que la respuesta cumple estrictamente el shape documental. La normalización del backend se pospone a una decisión separada, si resulta necesaria.
- Pruebas: acepta ejemplo real no_data; rechaza vacío con calidad complete/partial; rechaza ausencia total del campo; permite que el panel de Rondas se renderice con historia no_data.

### D2 — Actividad: fecha sin evidencia
- Para cada fecha, evaluar las **tres** celdas recibidas: si las tres están `status=no_data` o `quality=no_data`, deshabilitar tanto el botón del encabezado como sus tres celdas.
- Si al menos un turno tiene evidencia real, la fecha queda habilitada completa, incluso al pulsar una celda individual con estado N/D. El Drawer sigue siendo por fecha, no por turno.
- `no_tasks` no equivale a `no_data`: es evidencia verificable, no se deshabilita automáticamente.
- Controles `disabled` nativos, títulos/nombres accesibles que no prometen apertura para el día inactivo y sin hover/cursor activo.
- No llamar `day` para fechas deshabilitadas.

### D3 — KPI principales sin datos
- En los cuatro KPI principales, sustituir la visualización prominente `N/D` por `[Info] Sin datos` cuando el valor central no esté disponible.
- No reemplazar ni ocultar ceros válidos: `0 %`, contadores 0 y montos 0 verificables siguen numéricos.
- No fingir porcentajes ni importes; mantener los indicadores de calidad parcial y el resto del contenido real.
- Reutilizar `lucide-react` y tokens existentes del Design System, sin crear variantes globales.

## Validaciones del delta
1. Tests de contrato `rounds`, estados `no_data`/partial/complete.
2. Browser mock: histórico `shift_contributions:{}` (Rondas visible); fecha enteramente no_data deshabilitada y fecha mixta habilitada; KPI sin N/D en valores prominentes, cero visible.
3. `bun test --reporter=dot`, lint, build/typecheck, `git diff --check`, regresión de navegador Dashboard y Control mediante GitHub Actions puntuales.
4. Solo si todo pasa, repetir smoke de los tres casos con los datos reales de Preview.

## Límites
No alterar `metrics_dashboard_v1`, privilegios, RLS, otras páginas Admin, Shell, `master` o pruebas no relacionadas. No declarar smoke cerrado hasta confirmación humana.
