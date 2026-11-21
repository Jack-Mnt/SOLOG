# SOLOG — Integración Cajero — Contexto original de reconteos: cierre formal V1

**Estado:** CERRADO — aprobación humana explícita del usuario, 2026-11-21 (America/Lima).
**Clasificación:** Nivel A — cierre documental de un bloque Nivel C ya implementado.
**Rama:** `admin-work`. Sin modificaciones funcionales, migraciones adicionales ni cambios de `master`.

## 1. Decisión y precedencia

El usuario validó R5.1, R5.2 y R5.3, solicitó comprobar reconteos operativos reales directamente en Supabase y, tras revisar los resultados, confirmó: «Todo está en orden» y «He revisado y todo se ve en orden». Con esa aprobación se **cierra R5 y el bloque de restitución del contexto original de reconteos**.

- **Fuente primaria funcional vigente:** `docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_V1.md`.
- **Delta UX vigente y prevalente solo en navegación de Revisar:** `docs/SOLOG_UX_Cajero_Revisar_Navegacion_Continua_V1.md`.
- **Evidencia R2:** `docs/SOLOG_Backend_Cajero_Contexto_Original_Reconteos_Validacion_V1.md`.
- **Evidencia R3–R4:** `docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_Validacion_Frontend_V1.md`.
- **Este archivo prevalece exclusivamente para el estado de cierre R5 y la aceptación humana posterior**. No sustituye contratos, semántica del Motor ni el contenido histórico de informes anteriores.
- **O1:** `docs/SOLOG_Integracion_Cajero_Ciclo_Horario_O1_Cierre_Formal_V1.md` permanece cerrado de forma independiente. Su referencia histórica a R6 «pendiente» queda superada únicamente para el bloque de contexto original ahora concluido.

## 2. Evidencia técnica

R1 congeló la especificación; R2 desplegó y validó la migración `20261120213428_solog_cajero_full_recount_origin_v1.sql` en Supabase; R3 integró el frontend; R4 completó la CI del commit `0ac47f2e3e27c1240357b1ce0dcf0b25fb08668c` ([run 44823925719](https://github.com/Jack-Mnt/SOLOG/actions/runs/44823925719)): 73/73 pruebas dirigidas, 880/880 Bun globales, 37/37 Chromium, lint, typecheck/build y `git diff --check` aprobados.

La navegación continua aprobada se integró posteriormente en `3d79255f` y sus expectativas Chromium se actualizaron en `119ea42b8b4855ded85a89846482eaafdd8fab11`. La CI del **HEAD de código `119ea42`** concluyó **success** ([run 44832246122](https://github.com/Jack-Mnt/SOLOG/actions/runs/44832246122)), incluyendo pruebas dirigidas, lint, typecheck/build, Chromium, `git diff --check` y suite global. Los contadores de R4 anteriores no se atribuyen indebidamente a esta nueva ejecución.

## 3. R5 — Smoke humano y lectura real

| Control | Dictamen | Evidencia |
|---|---|---|
| R5.1 — Tabla Revisar | APROBADO | Usuario confirmó columnas, diferencias, filtros +/- y prioridades |
| R5.2 — Tarjeta y observaciones | APROBADO | Captura de tarjeta de Lucky x un, diferencia inicial `−30`, stock de sesión y aprobación expresa del diálogo de motivo/nota |
| R5.3 — Navegación continua | APROBADO | Usuario confirmó Anterior/Siguiente entre grupos, Regresar directo a Revisar y ausencia de resumen intermedio |
| R5.4 — Reconteo real | APROBADO | Lectura de Supabase `PuertoRicoOnline` / `inventario` y aceptación humana posterior |

**Reconteos contrastados:** cinco grupos reales de Cutervo vinculados a la sesión `03f74718-30c9-4c53-b4f9-dfa6e72ec55c`, con registros de `recount_save_batch` en `inventario.full_count_evidence` y datos en `inventario.conteo_detalle`. Valores visibles y persistidos concordantes:

| Grupo | Diferencia inicial (histórica) | Teórico de reconteo | Físico de reconteo | Diferencia actual | Estado actual |
|---|---:|---:|---:|---:|---|
| Four Loko 473ml | +1 | 126 | 127 | +1 | Confirmada |
| Sporade 500ml | +1 | 88 | 100 | +12 | Confirmada |
| COCA 2.25 L DES | +1 | -6 | 0 | +6 | Confirmada |
| HEINEKEN LATA 310 ML | -24 | 205 | 300 | +95 | Inconsistente |
| Pilsen personal | +6 | 792 | 700 | -92 | Inconsistente |

En el runtime consultado, los cinco grupos figuraban con `accion='none'` después de persistir los reconteos.

**Aclaraciones aprobadas por el usuario:**
1. Las diferencias inicial y actual pueden variar por ventas, movimientos, hallazgos y fechas diferentes.
2. `inventario.conteo_detalle.diferencia` representa **solo el resultado actualizado**; el contexto original se reconstruye desde el conteo físico y teórico originales en la proyección autorizada, no desde ese campo mutable.
3. El stock teórico **puede ser negativo**; no debe tratarse automáticamente como error. Ejemplos operativos: digitación POS o mercadería aún no incorporada.

**Límite de evidencia:** la lectura directa comprobó persistencia, cálculos, estados y ausencia de nueva acción de reconteo en esos grupos; la sesión constaba `activo` cuando fue consultada, por lo que no existe en esta evidencia una comprobación independiente posterior de su estado terminal o del cierre horario. La aprobación humana de R5 no convierte esa comprobación no realizada en un test aprobado. El ciclo horario O1 ya se había cerrado por separado con riesgos residuales aceptados.

## 4. Dictamen de cierre

**R1–R5: CERRADAS.** Sin defectos funcionales abiertos derivados de los cinco grupos revisados. No se ordenan cambios de `diferencia`, tratamiento de teóricos negativos, V6/V7, Motor, prioridad, journal, Supabase ni frontend.

**Fuera de este cierre:** promoción `admin-work` → `master`, smoke integral del Dashboard Admin, revisión global de releases y riesgos residuales E2E de O1 aceptados formalmente. Cualquier defecto posterior debe abrirse como incidencia o delta explícito, no mediante reinterpretación de la fuente congelada.
