# SOLOG — UX Cajero — Tiempos restantes — Delta V1

**Estado:** APROBADO E IMPLEMENTADO EN `admin-work`; pruebas locales y smoke visual posteriores PENDIENTES.
**Fecha:** 2026-10-28.
**Clasificación:** Nivel B acotado (composición de Inicio y presentación temporal, sin cambios de Motor o backend).
**Fuente primaria vigente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md` para toda la funcionalidad Full. **Este delta prevalece únicamente en la presentación temporal de Inicio y del popover**, reemplazando el texto temporal anterior, sin reabrir otras decisiones.
**Referencia adicional vigente:** `docs/SOLOG_UX_Cajero_Header_Estados_Delta_V1.md` para header, terminología y diagnósticos. Este delta no modifica sus decisiones.

## Decisiones aprobadas

1. Conservar **una sola fecha/hora exacta** en Inicio: `Inventario cargado` (o `Inventario desactualizado`), línea `Última actualización: HH:MM a. m./p. m. [DD/MM]`, timezone `America/Lima`. Ejemplo `04:38 a. m. [28/10]`.
2. Si hay sesión activa, segunda línea de Inventario: **`N min restantes para capturar`**, calculados desde `session_expires_at`.
3. Sin sesión activa, segunda línea de Inventario: **`N min restantes de vigencia`**, calculados desde `stock_expires_at`. Mantener guardias de inicio por snapshot horario y mensajes de bloqueo.
4. En el popover del indicador de inventario: **estado vigente/desactualizado** y **`N min restantes de vigencia`**. Eliminar `Actualizado`, `Vigencia hasta` y `Sesión hasta` (fechas/horas exactas).
5. **Eliminar íntegramente la tarjeta `Sesión activa`** de Inicio. Se conserva el botón operativo `Finalizar conteo`, el header, las tarjetas KPI y las acciones de registro.
6. La advertencia excepcional de recovery también muestra **`N min restantes para entregar`** en vez de una fecha/hora exacta. Las ventanas operativas, permisos y reintentos no cambian.

## Fuente de tiempo y límites

- **Reloj:** `FullRuntime.clock.now()`, sincronizado con `server_now`. No utilizar hora local del navegador para decidir minutos ni modificar los deadlines.
- Minutos enteros `max(0, ceil((fin-servidorAhora)/60000))`. Fin exacto o vencido = 0 y mensaje de plazo agotado. La cifra visual no concede permiso de captura/entrega.
- Reloj no confiable, inicial sin sincronizar, timestamp ausente o inválido: `Tiempo restante no disponible`, sin cifras inventadas.
- Se conserva el countdown especial HH:59–HH+1:02 del guardia original, con sus textos operativos; no es una fecha/hora exacta.
- No añadir RPC, alterar V6/V7, stock, sesión, `finish`, colas, drafts, reglas de captura/recovery ni estado persistente.

## Implementación

- `src/features/solog/cajero/full.temporal.ts` (nuevo): formatter Lima de fecha compacta y helper de minutos con guardas.
- `src/features/solog/cajero/full.app.tsx`: consumos de helper en Inventario, popover y aviso de recovery; eliminación de card Sesión activa y formatter antiguo de fecha larga.
- `src/features/solog/cajero/full.css`: retirada de regla huérfana `.full-session-time`.
- `tests/cajero-full-temporal.test.ts` (nuevo): formatos AM/PM, medianoche/mediodía, reloj no confiable, cero, redondeo y deadlines distintos.
- `tests/cajero-full.browser.mjs`: escenarios A1/A2/B/C validan fecha única, tiempos distintos, popover sin fecha y ausencia de Sesión activa.

## Validación exigida

```powershell
bun test tests/cajero-full-temporal.test.ts
bun test
bun run lint
bun run build
git diff --check
node tests/cajero-full.browser.mjs
```

Validaciones Bun/lint/build/browser **no ejecutadas en el workspace Windows desde esta conexión**. Requerir confirmación del usuario y smoke visual con stock fresco, sesión activa, sesión sin comenzar y transición de vencimiento. No declarar delta validado ni cerrar P6 hasta contar con evidencia.
