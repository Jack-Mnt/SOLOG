# SOLOG — Corrección Cajero — Restauración parcial de interfaz con Full V6/V7 — V1

**Estado:** IMPLEMENTADO en `admin-work`, NO VALIDADO técnicamente ni cerrado.
**Tipo:** Nivel C por frontera frontend/runtime, sin modificación backend.
**Solicitud aprobada:** restaurar comportamiento y composición anterior sin tocar el Motor; definir posteriormente tres dependencias: KPI autoritativos, contexto de reconteos y borradores/registro agrupado.
**Baseline de la regresión:** `4fd74da9e6d68fa3b1da9b8089be39238d222799`.
**Fuente primaria del comportamiento restaurable:** `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`. Para tarjeta y observaciones, prevalece exclusivamente en su alcance `docs/SOLOG_UX_Cajero_Tarjeta_Productos_Observaciones_Delta_V1.md`, pero sus A1/A2 permanecen pendientes de implementación. D.1.4 se rige por `docs/SOLOG_UX_Cajero_Proteccion_Captura_Sin_Guardar_V1.md`. Fuente de datos y mutaciones remotos: contrato V6/V7 desplegado, no V4/V5.

## Cambios concretos

- Se conserva `cajero.app.tsx` con `FullRuntime`: no se vuelve a conectar `CashierV4Runtime` ni las RPC bloqueadas.
- `full.app.tsx` deja de utilizar el Shell plano y reutiliza `cajero-shell`, `cajero-header`, `cajero-nav`, `cajero-module`, `cajero-capture-modal`, `cajero-capture-detail`, `cajero-capture-summary`, `cajero-calculator`, `cajero-review-list`, `cajero-stock-card` y clases históricas.
- Se recuperan navegación Inicio/operación/Historial, stock positivo/0/negativo, selección por categoría, lista de grupos, calculadora como mecanismo principal, cuatro magnitudes de captura, navegación Anterior/Regresar/Continuar, diálogo V5 de observaciones y confirmación D.1.4 de salidas sin guardar.
- Se conservan señales de operación V7 y recovery: iniciar, enviar mediante `FullRuntime.observe`, finalizar, reintentar, vigencia por reloj autoritativo, operaciones pendientes/rechazadas y sesión recovery.
- `full.css` ya no define una identidad CSS paralela con valores hexadecimales hardcodeados: su composición usa tokens del Design System.
- `full.presentation.ts` aísla una transformación exclusivamente presentacional de `FullGroup`: filtra grupos con `action` distinto de `none` y consume `priority_class` sin calcular decisiones de Motor. Test de clasificación en `tests/cajero-full-presentacion-regresion.test.ts`.

## Fronteras aún no resueltas (NO interpretar placeholders como contrato nuevo)

1. **KPIs, cobertura y progreso**: `FullState` no trae los KPI autoritativos anteriores ni puede derivarse cobertura completa de `groups[]`. Se muestra el número de grupos actualmente habilitados, no un KPI de cobertura. En el modal, el progreso permanece explícitamente no disponible (`—`), nunca 0/N ficticio.
2. **Contexto de reconteo**: `FullGroup` no trae diferencia inicial, motivo original ni nota previa. La nueva presentación no inventa esos datos ni bloquea un motivo inexistente; conserva temporalmente el comportamiento de captura V7 a la espera de definición del contrato de lectura.
3. **Borradores locales y registro agrupado**: sigue funcionando `FullRuntime.observe` con envío inmediato y outbox idempotente. `Continuar` no equivale todavía al borrador V4 y no debe presentarse como registro local diferido. El flujo y las garantías finales se definirán posteriormente. No se transfieren, borran ni migran registros `solog.cashier-v5.session.v1` ni `solog.full2`.

Estas tres diferencias se registran como **deuda de compatibilidad pendiente de definición**, no como decisiones funcionales nuevas ni solucionadas.

## Riesgos y validación pendiente

- La UI se ha restaurado sobre el runtime actual, pero requiere ejecutar en entorno local la suite Bun, lint, typecheck, build, `git diff --check` y recorrido de navegador con contrato V6/V7 simulado o con entorno seguro.
- Como los grupos se actualizan después del envío, validar que cambiar de grupo, errores del servidor, sesión vencida y outbox pendiente no provoquen saltos de selección o pérdida de información visible.
- Validar especialmente Tab/Escape, D.1.4, obligatorio ≥12, reconteo coincidente `Resuelto`, roles, reintento y logout. El nuevo contrato puede rechazar reconteos con motivo original desconocido; no presentar su UI como restauración funcional completa.
- El CSS histórico requiere smoke visual tablet y escritorio. La tarjeta compacta, popup de productos y refinamiento de observaciones pendientes A1/A2 **no fueron adelantados**.
- No se creó ningún snapshot, se modificó Supabase ni se cambió `master`.

## Comandos recomendados

```powershell
git switch admin-work
git pull
bun test tests/cajero-full-presentacion-regresion.test.ts
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

**Siguiente bloque:** congelar/validar contratos de las tres dependencias y después completar la restauración operativa sin rediseñar la UI.
