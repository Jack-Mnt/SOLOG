# SOLOG — Integración Cajero — Historial condicional A3: validación frontend V1

**Estado:** VALIDACIÓN TÉCNICA APROBADA — SMOKE HUMANO ACEPTADO; BLOQUE A3 CERRADO.
**Rama:** `admin-work`. **Fecha:** 2026-11-24 (America/Lima).
**Fuente primaria:** `docs/SOLOG_Integracion_Cajero_Historial_Condicional_A3_V1.md`.
**Contrato desplegado:** `docs/SOLOG_Backend_Cajero_Historial_Condicional_RPC_V3_V1.md`.
**Migración existente:** `20261124025038_solog_cajero_historial_condicional_rpc_v3`.
**Baseline previo al cambio:** `dce247cbdb2d2ea2e5534acd6d1d23ef6fb0026b`.
**Commit de código verificado por CI:** `991b4975e171406a0cbfc48a05465482255f8d6d`.

## 1. Implementación entregada

| Archivo | Alcance |
|---|---|
| `src/features/solog/cajero/cajero.full-history.ts` (nuevo) | Transporte V3, contrato/parser estricto, caché efímera Hoy/Ayer, validación `full`/`not_modified`, deduplicación in-flight, protección de respuestas tardías, aislamiento por propietario/usuario/dispositivo/sede y recuperación ante `not_modified` sin caché |
| `src/features/solog/cajero/cajero.app.tsx` | Crea `CashierFullHistorySync` solo tras adquirir tenencia del propietario Full, acopla ámbito al `site.id` autoritativo de V6 y limpia al perder tenencia |
| `src/features/solog/cajero/full.app.tsx` | Conecta la caché real, deja de usar `getCachedHistory:()=>null` y de invalidar por `view.revision` |
| `src/features/solog/cajero/cajero.historial.tsx` | Revalida al abrir/reabrir y cambiar Hoy/Ayer, mantiene datos previos durante la consulta, indicador compacto «Comprobando cambios…», retry y aviso de datos no verificados ante error; reemplazo completo y eliminación de expansiones de IDs desaparecidos |
| `tests/cajero-full-history-v3.test.ts` (nuevo) | Casos de contrato, ETag, fecha, primera consulta, revalidación, cambio completo, vacío, concurrencia, error, aislamiento y fallback |
| `tests/cajero-full.browser.mjs` | Escenarios Chromium adicionales con RPC V3 simulada sin conexión real a Supabase |
| `.github/workflows/solog-cajero-full-v3-contracts.yml` | Incluye archivos modificados y nuevo test dirigido en CI |

**No modificado:** `rpc_solog_cashier_history_v2`, `rpc_solog_cashier_history_v3` backend, `FullRuntime` V6/V7, Motor, journal, recovery, flujo login/guard de dispositivos, Admin, `master`.

## 2. Evidencia GitHub Actions

**Ejecución:** https://github.com/Jack-Mnt/SOLOG/actions/runs/45334661719

| Validación en commit `991b4975` | Resultado |
|---|---|
| Pruebas dirigidas Full + A3 | **86 aprobadas / 0 fallidas** (9 archivos) |
| `bun run lint` | **success** |
| `bun run build` (incluye typecheck) | **success** |
| Chromium navegador Full | **success** |
| `git diff --check` | **success** |
| `bun test` global | **893 aprobadas / 0 fallidas** (99 archivos) |

La misma ejecución reportó explícitamente estos escenarios nuevos:

1. **PASS** — Historial A3: primera carga, reabrir sin cambios y reemplazar al actualizar.
2. **PASS** — Historial A3: alternar Hoy/Ayer siempre revalida cada período.
3. **PASS** — Historial A3: error mantiene caché anterior y ofrece reintento.

El harness Chromium simula V3, V6/V7, identidad y autorización; **no llama a Supabase real**. Por eso acredita integración del cliente, no el comportamiento de un dispositivo autenticado en producción.

## 3. Evaluación y riesgos residuales

- La identidad de caché incorpora usuario, token, sede V6 y período; al perder propietario se elimina y las respuestas anteriores dejan de ser aplicables.
- No se persiste historial en `localStorage`; `solog.full2` permanece reservado al journal operativo; no hay nueva política TTL ni polling.
- `revisions.operational` es solo diagnóstico y no determina si `items` cambiaron. La RPC V3 ya desplegada calcula el ETag del contenido real y maneja `not_modified`.
- El cliente devuelve un `CashierHistory` compatible con el render actual tras validar V3; no reinterpreta diferencias ni observa `Inválido` como nuevo estado.
- Errores de transporte no se convierten en «sin cambios» y una respuesta `not_modified` sin caché comprobable desencadena una lectura `full`.
- La CI, sus navegadores simulados y el test SQL backend no sustituyen un smoke real con filas de hoy/ayer no vacías.

## 4. Smoke humano pendiente A3-F3

Desde un navegador ya autorizado y el Preview del SHA actualizado:

1. Abrir **Cajero → Historial → Hoy**: revisar lista y fecha; confirmar primera respuesta `full` de `rpc_solog_cashier_history_v3` (DevTools/Network).
2. Salir a Inicio, volver a Historial: observar `not_modified` y `items:null` en respuesta RPC; confirmar que mantiene los registros.
3. Cambiar a **Ayer**, volver a Hoy y comprobar que cada período usa fecha y ETag de su caché respectiva.
4. Registrar un conteo o reconteo permitido, volver a Historial y confirmar `full` con diferencia/observaciones actualizadas; verificar que no desaparezcan registros ajenos.
5. En un entorno seguro, simular error temporal de red: comprobar aviso, tabla anterior marcada como no verificada y **Reintentar**.
6. Verificar que navegación Historial no crea operaciones V7 ni borra registros pendientes. Confirmar Preview SHA y ausencia de errores Console.

Para la comprobación `full` con filas no vacías reales, usar datos operativos legítimos; **no generar/borrar registros sintéticos en Supabase sin aprobación explícita**.

**Cierre funcional A3:** pendiente de aprobación expresa del smoke humano por el usuario. Las fallas previas del guard de redirección Cajero/Detalles y Dashboard F7 siguen pospuestas conforme a las decisiones del usuario.

---

## 5. Adenda de smoke y cierre — 2026-11-24

El usuario informó haber realizado el smoke correspondiente y que el comportamiento «aparentemente [está] en orden», solicitando continuar con el trabajo pendiente. **A3 se considera aceptado y cerrado** con esta evidencia humana más CI verde. No se adjuntaron logs de Network, medidas reales de egress o detalle por caso del smoke; los límites de comprobación documentados arriba permanecen y no se presentan como comprobaciones nuevas.

Prevalece el cierre en el §10 de `docs/SOLOG_Integracion_Cajero_Historial_Condicional_A3_V1.md` sobre el estado histórico «smoke pendiente». No reabrir el Historial por defecto; el siguiente trabajo independiente son las incidencias de redirección Cajero/Detalles.
