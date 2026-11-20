# SOLOG — UX Cajero — Revisar: navegación continua de grupos V1

**Estado:** DELTA APROBADO POR EL USUARIO — 2026-11-20. Implementación ChatGPT, validación técnica y smoke humano dentro de R5.
**Clasificación:** Nivel B (navegación funcional acotada, solo frontend).
**Fuente primaria única de este delta:** `docs/SOLOG_UX_Cajero_Revisar_Navegacion_Continua_V1.md`.
**Precedencia:** este documento sustituye exclusivamente la navegación del modal de `Revisar` descrita en la fuente principal `docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_V1.md`. Todo lo demás sigue vigente, incluidas las prioridades autoritativas, motivos heredados, contratos V6/V7 y el cierre O1.

## 1. Problema observado en R5

El usuario validó visualmente la tabla Revisar con columnas Nombre, Diferencia inicial y Diferencia actual. Abrir un grupo muestra correctamente la calculadora. Sin embargo, el modal pasaba **un solo grupo** a `CaptureDialog`, por lo que `Regresar` abría un resumen innecesario de un solo grupo, y `Siguiente` terminaba en ese resumen en vez de continuar al siguiente producto.

## 2. Comportamiento aprobado

1. `Revisar` es una secuencia lineal de **grupos disponibles de la prioridad que devuelve el Motor**, sin agrupar ni navegar por categorías.
2. La secuencia conserva el **orden de los grupos** del estado V6 y **respeta los filtros +/- activados** en la tabla. Los grupos con contexto original ausente no pueden incluirse en la navegación, porque no son capturables.
3. Abrir cualquier fila ubica el modal directamente en ese grupo. `Anterior` y `Siguiente` navegan por el listado visible, **atravesando categorías**.
4. `Regresar` y la flecha superior del modal vuelven **directamente a la tabla Revisar**, sin el resumen intermedio `Grupos`.
5. Tras el último `Siguiente` (o `Continuar` con cantidad válida y guardada) se vuelve a Revisar; no se muestra un resumen de categoría.
6. Encabezado del modal: `Revisar`; progreso `borradores de grupos de la secuencia / total de grupos de la secuencia` y porcentaje. Si se aplica un filtro, el denominador corresponde a esa lista filtrada.
7. Se mantiene la confirmación ante **cambios verdaderos no guardados**. Un motivo original heredado por sí solo no es una modificación del usuario. Un borrador existente conserva su motivo efectivo, incluso si es `null` porque fue resuelto.
8. `Conteo` y `Conteo diario` mantienen intactos su navegación, resumen por categoría, progreso y lógica.
9. No se modifican Motor, backend, Supabase, V6/V7, journal, acciones de envío, autoría de conteos ni prioridad.

## 3. Alcance técnico y validación

- Cambio acotado a `src/features/solog/cajero/full.app.tsx`.
- Prueba navegador dirigida en `tests/cajero-full.browser.mjs` que abre dos grupos de distintas categorías, navega `Siguiente/Anterior/Regresar`, cuenta progreso, comprueba la transición del último grupo a tabla y respeta filtro +/- y drafts.
- Validación obligatoria: CI dirigida, lint, typecheck/build, Chromium, `git diff --check`, suite global; revisión y smoke humano local.
- No reabrir O1, no modificar `master`, no crear datos ficticios en Supabase ni publicar en Cloudflare para probar la UI local.
