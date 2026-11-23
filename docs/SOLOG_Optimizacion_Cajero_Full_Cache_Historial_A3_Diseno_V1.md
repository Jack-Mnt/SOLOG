# SOLOG — Optimización Cajero Full — Caché selectiva de Historial A3 — Diseño V1

**Estado:** PROPUESTA DE DISEÑO / PREFLIGHT COMPLETADO. **NO APROBADO NI CONGELADO PARA IMPLEMENTACIÓN.**
**Fecha:** 2026-11-23 (America/Lima).
**Clasificación:** Nivel B, frontend con consistencia operacional; cambios backend no autorizados.
**Rama:** `admin-work`; el cambio de acceso Cajero es un delta independiente.
**Fuente primaria funcional del Bloque A:** `docs/SOLOG_Correccion_Cajero_Detalles_BloqueA_Frontend_V1.md`. Este documento solo prepara cómo adaptar **A3 al runtime Full vigente**. Si se aprueba, establecer el delta definitivo de implementación y sus pruebas sin reinterpretar A1/A2/A4.

## 1. Preflight: hallazgos verificables

- El consumidor real es `src/features/solog/cajero/full.app.tsx` mediante `CajeroHistorial`. El controlador pasa `getCachedHistory: () => null`, `cacheRevision: view.revision` y `loadHistory: fetchCashierHistory`. Se vuelve a consultar al remontar Historial, y un cambio local de revisión no es necesariamente un cambio remoto.
- `src/features/solog/cajero/cajero.v4.runtime.ts` ya contiene la estrategia anterior de `CashierHistoryCache` con `clear` por identidad y `invalidate` por revisión operacional, pero **V4 no es el runtime vigente**.
- `src/features/solog/cajero/cajero.history.ts` implementa caché Hoy/Ayer en memoria, deduplicación de requests, fechas `America/Lima`, validación de revisión de respuesta y protección contra resultados tardíos. Es reutilizable de forma acotada.
- El runtime Full publica `view.revision` ante cambios locales, journal y lecturas V6; **no es `revisions.operational`**.
- El Full `CASHIER_STATE` V6 actualmente carece de campo `revisions.operational`, y la mutación V7 tampoco entrega esa revisión. En contraste, `rpc_solog_cashier_history_v2` sí devuelve `revisions.operational`. Por ello **no se puede prometer detección instantánea de cambios externos con solo comparar V6**.
- La ruta Full no debe volver a utilizar la antigua store V4, crear persistencia del historial en `localStorage` ni añadir polling.

## 2. Diseño propuesto — contrato y límites

1. La caché queda **en memoria por propietario Full**, asociada a usuario/dispositivo/sede y descartada al desmontar la instancia. No escribir `solog.full2` ni cambiar la tenencia de instancia única.
2. Crear adaptador de historial Full o reutilizar `CashierHistoryCache` mediante un wrapper: `getCachedHistory(period)`, `loadHistory(period)`, `invalidateHistory(reason)`, `clearHistory()`, con `historyRevision` **independiente de `view.revision`** y actualización React solo cuando cambia realmente la validez de historial.
3. Cachear por `today`/`yesterday`, fecha Lima de respuesta, revisión operacional de la RPC de Historial y edad de lectura. Compartir solicitudes in-flight por período; rechazar respuestas tardías cuando cambia día, identidad o se invalida el contenido.
4. Invalidación inmediata ante **cualquier envío V7 de conteo/reconteo potencialmente aplicado**; hacerlo conservadoramente incluso si se pierde el receipt y se mantiene operación pendiente, ya que la base pudo haber confirmado. Tras replay/reconciliación continuar sin reconstruir el payload ni alterar UUID/contado_at.
5. Invalidación por cambios de identidad, dispositivo o sede; cambio de día Lima; desmontaje/cambio de propietario; y al recibir una nueva revisión operacional desde la propia RPC Historial. Cambios de reloj/UI/loading/error/filtrado local **no** deben invalidar.
6. Para cambios externos no visibles en V6, proponer una **vigencia máxima controlada en memoria de 120 segundos** antes de reconsultar al reabrir Historial; no hacer requests mientras está cerrado ni establecer sondeos periódicos. Este TTL es una **propuesta, no una decisión congelada**. Otra opción es añadir CTA «Actualizar» para forzar validación manual o, en bloque posterior, exponer revisión operativa por V6 con despliegue backend previo.
7. Si el reloj servidor no es confiable, evitar considerar fresca una entrada solo con hora local dudosa; preferir nueva lectura de Historial, que incluye `generated_at` y fecha autoritativa.
8. No reabrir Historial/Detalle V4, O1, auth, backend, V6/V7, Motor o contratos históricos.

## 3. Matriz mínima de validación

| Caso | Resultado exigido |
|---|---|
| Abrir Historial, salir y volver sin cambios dentro de TTL | Usar misma respuesta; **0 nuevas RPC** |
| Navegar Hoy ↔ Ayer y volver | Una lectura por período y reutilización por fecha |
| Evento local UI o `view.revision` sin cambio operativo | No reconsultar |
| Confirmación V7 `save_batch` o `recount_save_batch` | Invalidar de inmediato; siguiente lectura nueva |
| V7 con respuesta perdida o en retry | Invalidar de forma conservadora, mantener journal intacto |
| `finish` con efectos terminales y estado definitivo | Revalidar si puede afectar estados del historial |
| Nueva revisión desde Historial | Descartar cachés incompatibles; sin aceptar respuestas antiguas |
| Cruce de medianoche Lima | `today`/`yesterday` se renuevan; sin fecha del navegador como verdad |
| Logout/usuario/sede/dispositivo/tenencia distintos | Aislamiento y limpieza en memoria |
| Reingreso después del TTL | Consulta nueva; sin polling en segundo plano |
| Error de red en lectura | Mostrar retry sin marcar caché obsoleta como confirmada |

Ejecutar tests Bun dirigidos, browser con RPC simulada, suite global, lint, typecheck/build, `git diff --check` y smoke humano Hoy/Ayer tras operación real autorizada. El navegador simulado **no acredita refresco externo real de Supabase**.

## 4. Etapas propuestas si el usuario aprueba

1. **A3.1 — Plan y contrato interno:** confirmar tratamiento del TTL y la invalidez por receipt incierto; congelar un delta de implementación acotado.
2. **A3.2 — Caché Full:** adaptador en memoria, reutilizar `CashierHistoryCache` sin modificar sus invariantes V4; conectar controlador Full e invalidaciones en puntos de mutación.
3. **A3.3 — Tests y revisión:** cubrir matriz, verificar ausencia de reconsultas redundantes, regresión O1 y navegación y respetar cambios preexistentes.
4. **A3.4 — Smoke humano y cierre:** validar Historial Hoy/Ayer y resultado tras conteo real; documentar evidencia.

**No iniciar A3 automáticamente:** este documento es una propuesta técnica, no permiso de implementación. Se requiere aprobación del usuario de sus políticas de frescura/TTL y del delta específico.
