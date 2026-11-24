# SOLOG — Integración Cajero — Historial condicional A3 V1

**Estado:** CERRADO — backend V3 desplegado, frontend validado técnicamente y smoke humano aceptado por el usuario (2026-11-24).
**Fecha:** 2026-11-23 (America/Lima).
**Clasificación:** Nivel C para el bloque completo, Nivel B frontend consumidor.
**Rama:** `admin-work`; producción `master` fuera de alcance.
**Fuente primaria funcional y de implementación frontend de este delta A3:** este documento.
**Contrato backend específico prevalente:** `docs/SOLOG_Backend_Cajero_Historial_Condicional_RPC_V3_V1.md`. En discrepancias de payload, respuesta, semántica de ETag, ACL o errores, **prevalece exclusivamente el contrato backend congelado y validado**.

## 1. Estado de decisiones y fuentes

**Decisión funcional APROBADA:** consulta condicional **en cada apertura** del Historial; backend responde `not_modified` sin registros si todo continúa igual, o `full` con historial completo si cambió; el frontend reemplaza (no combina deltas) el contenido tras `full`.

El diseño histórico `docs/SOLOG_Optimizacion_Cajero_Full_Cache_Historial_A3_Diseno_V1.md` con TTL de 120 segundos queda **reemplazado** por esta propuesta específica. Se conserva como antecedente, no como requisito.

El bloque `docs/SOLOG_Correccion_Cajero_Detalles_BloqueA_Frontend_V1.md` permanece vigente para A1/A2/A4 y objetivo general de A3. Para A3, la aprobación posterior sustituye **solo** sus restricciones de «sin RPC nuevas» y «sin cambios backend» y la implementación V4 original. No reabrir los demás módulos.

**NO ESTÁ APROBADO** implantar frontend contra un contrato V3 aún no desplegado. El backend lo desarrolla y valida ChatGPT; Codex solo se encarga del frontend después del contrato congelado.

## 2. Preflight del repositorio y dependencias

- `src/features/solog/cajero/cajero.app.tsx` monta `FullRuntime` en el propietario exclusivo y actualmente pasa `fetchCashierHistory` V2 como dependencia.
- `src/features/solog/cajero/full.app.tsx` crea controlador con `getCachedHistory: () => null` y `cacheRevision: view.revision`; no retiene el historial al salir de la ruta.
- `src/features/solog/cajero/cajero.historial.tsx` tiene selección `today/yesterday`, estado de loading/error y protección básica `requestVersion`; su `loadHistory` hoy retorna directamente la caché sin revalidar.
- `src/features/solog/cajero/cajero.history.ts` define `CashierHistoryItem`, parser V2, `CashierHistoryCache` (herencia V4) y la RPC V2. La nueva estrategia no debe modificar semánticas usadas por V4 ni usar `view.revision` como revisión operacional.
- `rpc_solog_cashier_history_v2` devuelve el **Historial del cajero autenticado en la sede asignada**, filtrando `Inválido` y por `contado_at` (fecha Lima); no usar fecha de reconteo para decidir `today/yesterday`.
- La sincronización condicional propuesta requiere `rpc_solog_cashier_history_v3` **desplegada y validada primero**.

## 3. Diseño del cliente

### 3.1. Una caché por propietario y por período

Proponer un `CashierFullHistorySync` o servicio equivalente **solo en memoria** por propietario Full, que sobreviva al desmontaje de la pantalla Historial pero se destruya al perder la tenencia del Cajero, cambiar de usuario o cerrar sesión.

La entrada contiene como mínimo:

```ts
type HistoryCacheEntry = {
  period: 'today' | 'yesterday'
  date: string           // fecha Lima devuelta por servidor
  etag: string           // huella V3 calculada por backend
  generated_at: string
  revisions: { operational: number } // información; NO identidad de caché
  items: CashierHistoryItem[]
}
// Clave de ámbito del servicio: userId + deviceToken + sedeId del bootstrap
```

Solo dos entradas: `today` y `yesterday`. **No** persistir en `localStorage` ni tocar journal V7, `solog.full2`, lock de navegador o memoria entre usuarios/dispositivos.

### 3.2. Sincronizar en cada apertura / cambio de período

1. La entrada visual al Historial solicita `syncHistory(period)` **una vez**; cambiar Hoy/Ayer dispara también una consulta condicional del período elegido. Volver a un período realiza nueva comprobación (no ignorarla por tener caché).
2. Si hay caché del período y contexto actual: enviarla al servidor mediante `{period,if_date,if_etag}`. Sin caché: enviar solo `{period}`.
3. Mostrar datos cacheados mientras se valida con estado **«Comprobando cambios…»**, diferenciados de información confirmada en la nueva apertura. No borrar la tabla antes de verificar.
4. Ante `not_modified`: comprobar coherencia de período, fecha, etag, usuario/dispositivo/sede y generación de solicitud; mantener exactamente los `items` actuales, actualizar metadatos de validación y quitar el indicador.
5. Ante `full`: validar rigurosamente `items` con reglas del parser V2 y contexto V3; **reemplazar atómicamente** entrada y vista, aunque `items=[]`.
6. Si llega `not_modified` sin una entrada coincidente (p. ej., se limpió caché durante el vuelo), **forzar una sola solicitud `full` sin ETag**. Nunca afirmar éxito con datos vacíos falsos.
7. En error de conexión o contrato: mantener datos previos solo como **no verificados**, con aviso y botón `Reintentar`; no tratarlos como actualizados ni transformar un error en «sin cambios».
8. Al desmontar el propietario o cambiar identidad, sede o dispositivo: limpiar caché/in-flight y rechazar respuestas tardías. Cambios de ruta o de pestaña dentro del mismo propietario no destruyen la caché.

### 3.3. Invariantes y concurrencia

- Revalidación por **evento de apertura/selección**, no por cada render, `view.revision`, `focus`, timer o evento `storage`.
- Dedupe de llamadas duplicadas para **el mismo evento**, sin suprimir la nueva validación de una apertura posterior. Los resultados se aplican solo si la generación/identidad/período siguen vigentes.
- Una respuesta tardía de una lectura anterior **no** puede sobreescribir un `full` más reciente; bajo logout o cambio de propietario no puede repoblar caché.
- El contrato V3 del backend es autoridad de fecha Lima; si fecha cambió al pasar medianoche, el servidor entrega `full` con fecha nueva y se reemplaza la caché. `today` y `yesterday` no se suman ni se reetiquetan localmente.
- No asumir que `revisions.operational` equivale a ETag, ni invalidar toda la caché solo porque otra operación de la sede cambió esa revisión. La propia comparación del digest en servidor detecta el contenido.
- No agregar por `detalle_id` ni fusionar filas en el cliente. El `full` autoritativo ya contiene eliminaciones lógicas, cambios de estados, stock posterior y valores actuales.
- Si V7 confirma o queda incierta una operación mientras Historial está abierto, marcar la vista pendiente de validación para el próximo evento relevante y evitar etiquetarla como comprobada posteriormente a esa mutación. No alterar replays, idempotencia, lotes, finish ni recovery.

### 3.4. Superficie de UI

Mantener la estructura de Historial, filtros y composición existentes. La consulta `not_modified` **no necesita un toast**; conservar la tabla sin saltos. Mensaje compacto solo durante validación o error. Si la respuesta es `full` y cambia el conjunto, preservar filtros válidos, o resetear categoría que deje de existir según patrón vigente; preservar expansión solo de IDs que todavía existan.

No incluir botón de Actualización manual nuevo salvo que sea estrictamente necesario para el retry tras error; la apertura y el selector ya disparan las verificaciones.

## 4. Archivos previstos (orientativos, sujetos a baseline Codex)

- `src/features/solog/cajero/cajero.history.ts` o nuevo archivo acotado de sync: tipos RPC V3, parser y cliente, aislando compatibilidad V2.
- `src/features/solog/cajero/cajero.app.tsx`: ciclo de vida del servicio por propietario `FullRuntime`, sin cambiar su journal ni lock.
- `src/features/solog/cajero/full.app.tsx`: conectar el controlador real y dejar de usar `getCachedHistory:()=>null`/`view.revision` como invalidación.
- `src/features/solog/cajero/cajero.historial.tsx`: sincronizar en apertura/selección y manejar `full`, `not_modified`, pending y error.
- Tests Bun dirigidos y escenarios Chromium de Historial.

Las rutas de login y guard de acceso de dispositivo **no se modifican**: su smoke real reportó fallas aún **pendientes de analizar** mediante imágenes después de terminar A3. No reabrir esas fallas por anticipado ni modificar `master`.

## 5. Matriz de validación

| Caso | Resultado exigido |
|---|---|
| Primera apertura Hoy/Ayer | Una RPC V3 `full` por período con lista completa o `[]` |
| Reabrir sin cambios | Una RPC V3 `not_modified`; **0 filas enviadas por backend**, conservar referencia y vista |
| Volver a alternar Hoy/Ayer | Nueva consulta condicional del seleccionado; no descargas completas si nada cambió |
| Nuevo conteo y reconteo actualizado | `full`; reemplazo correcto, diferencia y observaciones actuales |
| Snapshot posterior modifica histórico | `full` incluso con `revisions.operational` idéntica |
| Invalidez lógica `Inválido` / eliminación de fila | `full` y la fila desaparece de la lista |
| Estado `full` con `[]` | Vacío legítimo; nunca reusar datos antiguos |
| Cambio de día Lima | Respuesta `full` para nueva fecha; sin arrastrar listas anteriores |
| Usuario/sede/dispositivo distintos | Cachés aisladas y respuestas viejas descartadas |
| Respuesta `not_modified` sin caché local | Reconsulta `full` una vez, sin mostrar tabla falsa |
| Error/red lenta y respuestas fuera de orden | Sin sobrescritura tardía, con retry e indicador de antigüedad |
| Eventos `view.revision` locales | No generar solicitudes adicionales |
| Fin de sesión, logout, tenencia y recovery | No tocar operaciones, journal, rutas ni reglas horarias |

Validar `bun test` dirigidos, Chromium, suite completa, lint, typecheck/build, `git diff --check` y smoke humano autorizado con Hoy/Ayer y un registro actualizado. Medir tamaños reales en HTTP de `full` versus `not_modified`; no afirmar ahorro preciso sin medición.

## 6. Secuencia propuesta — obligatoria

| Fase | Responsable | Entregable / gate |
|---|---|---|
| A3-B0 — aprobación final del diseño y contrato | Usuario + ChatGPT | Congelar backend V3 y esta fuente; resolver cualquier ambigüedad técnica bloqueante |
| A3-B1 — backend | ChatGPT | Crear/desplegar V3 aditiva, ACL, consulta condicional, tests, contraste V2/V3, mediciones. **Contrato debe quedar DEPLOYED/VERIFIED** |
| A3-F0 — baseline / plan técnico | Codex | Inspeccionar exclusivamente consumidor Full, preservar worktree y plantear plan acotado; **sin implementar**. Esperar aprobación del usuario |
| A3-F1 — adaptación del cliente | Codex | Caché en memoria y parser V3, eventos, control de generaciones y manejo de errores |
| A3-F2 — pruebas y revisión de integración | Codex + ChatGPT | Bun/browser/lint/build/diff, revisión de contratos desplegados, ausencia de regresiones O1 |
| A3-F3 — smoke y cierre | Usuario + ChatGPT | Validación real Historial Hoy/Ayer, ahorro observado, cierre y registro de riesgos residuales |

**No enviar a Codex implementación dependiente hasta que A3-B1 esté desplegada y validada.** Si Codex detecta que requiere cambio backend adicional, se detiene y devuelve diagnóstico a ChatGPT.

## 7. Exclusiones y continuidad

- No integrar cambios de autorización del dispositivo ni corregir el acceso Cajero en este bloque. El problema de redirección se mantiene **abierto para cuando finalice A3**.
- No Dashboard F7 (pospuesto).
- No `rpc_solog_cashier_history_v2` ni funciones Full V6/V7, reglas de liquidación, Motor, tablas, cron, estado `Inválido`, ni cambios de frontend antes de backend.
- No polling, TTL de 120 s, cambio de modelo de datos, nuevos triggers/revisiones o protocolo de deltas en V1.

**Criterio de cierre:** backend V3 validado + cliente consume contrato desplegado + pruebas automatizadas + smoke humano; la aprobación conceptual de la estrategia no cierra la implementación.

---

## 8. Gate backend habilitado — 2026-11-23

El backend **A3-B1** fue desplegado y validado. Migración `20261124025038_solog_cajero_historial_condicional_rpc_v3`; documentación vinculante `SOLOG_Backend_Cajero_Historial_Condicional_RPC_V3_V1.md`; evidencia `SOLOG_Backend_Cajero_Historial_Condicional_RPC_V3_Validacion_V1.md`.

**Se levantó exclusivamente el bloqueo de contrato remoto.** Sigue pendiente iniciar A3-F0 con Codex: inspección baseline `admin-work`, identificación de cambios preexistentes, plan acotado de integración V3 sin implementar y aprobación del usuario antes de A3-F1. El proyecto **no ha cambiado frontend** como consecuencia de A3-B1.

La paridad RPC V2/V3 con filas no vacías del día real y la validación HTTP/JWT deben comprobarse durante el smoke integrado, sin fabricar historial productivo. No tocar incidencias pospuestas de login/redirección ni Dashboard F7.

---

## 9. Implementación directa en GitHub y validación CI — 2026-11-24

Por solicitud explícita del usuario, ChatGPT realizó **directamente en `admin-work`** la implementación frontend prevista para A3, sin pasar por Codex. Esta ejecución es una excepción operativa aprobada al reparto usual de responsabilidades, **no** una autorización general para modificar contratos, Motor o backend desde Codex.

- **Baseline:** `dce247cbdb2d2ea2e5534acd6d1d23ef6fb0026b`.
- **HEAD de código validado:** `991b4975e171406a0cbfc48a05465482255f8d6d`.
- **Informe de evidencia:** `docs/SOLOG_Integracion_Cajero_Historial_Condicional_A3_Validacion_Frontend_V1.md`.
- **CI:** https://github.com/Jack-Mnt/SOLOG/actions/runs/45334661719 — **success**: 86/86 tests dirigidos, lint, typecheck/build, Chromium con tres nuevos escenarios A3, `git diff --check`, y **893/893** tests globales.
- **Backend:** se reutilizó la RPC V3 ya desplegada; no se alteraron migraciones ni contratos. El guard de redirección reportado como defectuoso permanece fuera de este alcance.

**Estado:** A3-F0/F1/F2 ejecutadas con validación técnica; **A3-F3 pendiente de smoke humano con un dispositivo autorizado y datos reales**. La implementación está lista para probar en Preview, pero no se considera cerrada funcionalmente ni se fusiona automáticamente a `master`.

---

## 10. Cierre formal A3 — 2026-11-24

**Estado vigente: CERRADO**, por validación técnica comprobada y smoke humano informado por el usuario en el Preview correspondiente. El usuario indicó «realicé el smoke correspondiente y aparentemente en orden todo» y ordenó continuar con los pendientes. Se toma como aceptación operativa proporcional, no como evidencia de que cada caso límite haya sido medido por red.

- **CI de código validado:** `991b4975e171406a0cbfc48a05465482255f8d6d`, GitHub Actions [45334661719](https://github.com/Jack-Mnt/SOLOG/actions/runs/45334661719): pruebas dirigidas 86/86, globales 893/893, lint, typecheck/build, Chromium con escenarios A3 y `git diff --check`, todos correctos.
- **Backend desplegado:** `public.rpc_solog_cashier_history_v3`, migración `20261124025038_solog_cajero_historial_condicional_rpc_v3`; sigue en vigor la documentación de contrato y validación backend.
- **Smoke humano:** usuario comunica que las comprobaciones de Historial resultan aparentemente correctas. No se entregaron trazas HTTP ni una lista de comprobaciones concretas, por lo que **no se afirma medida real de egress, paridad de datos no vacíos o cobertura exhaustiva de reintentos/concurrencia reales**.
- **Fuentes:** esta especificación sigue siendo fuente primaria A3; `SOLOG_Backend_Cajero_Historial_Condicional_RPC_V3_V1.md` prevalece para contrato remoto, `SOLOG_Integracion_Cajero_Historial_Condicional_A3_Validacion_Frontend_V1.md` registra las pruebas y su alcance. Las menciones históricas anteriores a «smoke pendiente» quedan sustituidas exclusivamente por este cierre.
- **Sin promoción a producción:** `admin-work` sigue siendo la rama de trabajo; no se fusionó con `master`.
- **Siguiente bloque:** retomar diagnóstico de los fallos del smoke real de redirección Cajero/Detalles, reportados previamente. Es un bloque **independiente**, no reabre A3 ni altera V3.

Solo reabrir A3 mediante bug reproducible, incompatibilidad concreta o delta aprobado.
