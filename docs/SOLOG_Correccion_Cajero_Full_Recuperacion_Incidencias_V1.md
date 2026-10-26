# SOLOG — Corrección Cajero Full: recuperación, incidencias y carga V1

**Estado:** IMPLEMENTADO EN `admin-work` — **tests dirigidos, lint y build validados localmente por el usuario**; smoke del nuevo flujo y E2E de recovery pendientes.
**Fecha:** 2026-10-26. **Clasificación:** Nivel C (recuperación y persistencia) con ajustes puntuales Nivel A/B.
**Fuente primaria funcional vigente:** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`, aprobada y congelada. Este archivo es un **delta técnico**: solo reemplaza los comportamientos defectuosos identificados abajo.
**Contrato backend vigente y ya desplegado:** `docs/SOLOG_Backend_Cajero_Full_Recovery_Finish_V1.md`. No se realizaron cambios en Supabase.
**Reporte previo:** `docs/SOLOG_Integracion_Cajero_Borradores_Registro_Autocierre_Full_V1.md`. Sigue vigente en lo no modificado por este delta. V4/V5 solo referencia histórica; `master` fuera de alcance.

## 1. Evidencia de partida

Baseline reportado y confirmado: `admin-work` en `41bae6a633aa003c2823d6d30f5cd14ee82a1f8c`, árbol limpio.
Codex ejecutó antes de esta corrección: 20/20 tests dirigidos, 408 correctos y 3 fallidos en suite ampliada, lint correcto, build fallido (3 TS2304 por `Send`), `git diff --check` correcto. **No trasladar esos resultados a la revisión posterior.**

Preflight en código: `full.app.tsx` no importaba `Send`; autocierre dependía exclusivamente de `session/recovery_sessions` del bootstrap y de ventana activa, aunque `finish` confirmado sin respuesta puede desaparecer de esa lectura; exportación diagnóstica de `inspectPending()` incluía `exactPayload.device_token`; no existía gestión segura de incidencias; los tests de loader todavía verificaban el entry V4.

## 2. Correcciones implementadas

### 2.1 Desbloqueo de compilación
`full.app.tsx` importa el icono `Send` usado en Inicio, Conteo y Conteo diario. **Build validado localmente por el usuario tras la corrección.**

### 2.2 Reanudación idempotente desde journal
`FullRuntime.resumePrepared()` inspecciona operaciones `pending` **persistidas**, incluso `start` sin sesión asignada y `finish` de una sesión ya ausente de bootstrap. Procesa scopes serializados bajo el lock de Full; para cada scope transmite el mismo `operation_id` y `exactPayload`, reconcilia receipts y vuelve a consultar V6. Los rechazados conocidos no se reintentan ni bloquean automáticamente el procesamiento de un scope diferente.

El panel activa esta reconciliación después del bootstrap inicial, al recuperar conectividad, al volver el foco, al mostrar la pestaña y ante actualizaciones pertinentes de almacenamiento compartido. Los reintentos automáticos de operaciones preparadas están limitados a un intento por 30 segundos y cuentan con una comprobación periódica cada 30 segundos mientras la pestaña permanece abierta. El autocierre ordinario y el gate horario conservan su flujo. Un `finish` preparado puede recuperarse después de `pending_delivery_until` **solo mediante el replay del mismo UUID**; jamás se genera un `finish` nuevo fuera de plazo ni una captura retroactiva. Un rechazo del servidor o error ambiguo conserva el journal y se muestra como incidencia.

### 2.3 Diagnóstico sin secretos y descarte delimitado
`exportDiagnostics()` produce operaciones sanitizadas, borradores locales y receipts por sesión. El `device_token` se elimina del payload exportado **sin modificar** el journal original, su token ni las operaciones inmutables. No se incluyen credenciales en el diagnóstico.

El panel muestra resumen de hasta 12 incidencias y total adicional, con botón de descarte condicionado. Se exige confirmación explícita. `discardDraft` solo elimina un borrador no incluido en operación preparada/pendiente/rechazada y no confirmado. `discardRejectedOperation` admite únicamente códigos backend conocidos y atómicamente no aplicados: `PRIORITY_CONFLICT`, `SESSION_CAPTURE_CLOSED`, `SESSION_DELIVERY_CLOSED`, `MANIFEST_NOT_CONFIRMED`. Mantiene intactos los borradores asociados, que deben resolverse por separado. UUID inciertos, conflictos de idempotencia, autorizaciones y receipts no reconciliados **no pueden descartarse**. La exportación diagnóstica es la alternativa para conservar evidencia antes de un descarte confirmado.

**Limitación aceptada dentro del alcance:** el diagnóstico es archivo local, no un canal de soporte automatizado. No se añade operación backend ni se modifica el Motor.

### 2.4 Loading y pruebas históricas
`FullCashierPanel` usa `PanelLoader variant="contained"` durante el bootstrap inicial, preservando el Shell/cabecera/navegación en las actualizaciones posteriores. Las aserciones de loading de las fases 3/4 pasan a verificar el entry Full vigente, sin reactivar V4. Los tests unitarios V4 no se eliminan indiscriminadamente: `tests/cajero-post-cutover-v4.test.ts` conserva aserciones de runtime histórico, pero deja de renderizar `CajeroV4` y de verificar CTA de una UI ya sustituida. Las garantías vigentes de Shell, loading y navegación se validan con Full. Cualquier fallo restante debe diagnosticarse con su salida exacta.

## 3. Pruebas añadidas / actualizadas

Se ampliaron las pruebas `tests/cajero-full-registro-autocierre.test.ts` para cubrir:
- timeout después de **aplicación remota** para `start` y `save_batch`, replay exacto y conservación del UUID;
- `finish` aceptado cuya respuesta se perdió y ya no aparece en bootstrap;
- cambio de prioridad con refresh entre lotes;
- lote de 501 dividido 500+1;
- fallo incierto en el segundo lote sin duplicación del primero;
- diagnóstico sin `device_token`, con borradores y operaciones;
- descarte protegido por operación preparada y descarte de rechazo permitido;
- migración de journal V1 que conserva `pending`, `panels` y `confirmed`.

Se actualizaron `tests/global-loading-cajero-phase3.test.ts` y `tests/global-loading-cajero-phase4.test.ts` para leer el punto de montaje Full.

## 4. Validación y pendientes

**Comprobado mediante lectura remota:** las modificaciones y las nuevas aserciones existen en `admin-work`; el backend no fue modificado. **Resultado reportado por el usuario (2026-10-26):** tras ajustar la expectativa de `retry()` del test de rechazos definitivos (commit `640e197fc052aa98cbaf505f6efa3fcf1c5196ca`), las tres validaciones solicitadas quedaron **en verde**: `bun test tests/cajero-full-registro-autocierre.test.ts`, `bun run lint` y `bun run build`. El usuario no aportó salida detallada; no se atribuye esta evidencia a la suite global, a browser/Playwright ni a E2E autenticado. Tampoco se ha acreditado una nueva ejecución de `git diff --check` después de estos commits.

Validaciones complementarias y repetición cuando corresponda:

```powershell
git switch admin-work
git pull --ff-only origin admin-work
bun test tests/cajero-full-registro-autocierre.test.ts tests/cajero-full-inicio-snapshot-horario.test.ts tests/cajero-full-presentacion-regresion.test.ts tests/global-loading-cajero-phase3.test.ts tests/global-loading-cajero-phase4.test.ts
bun run lint
bun run build
git diff --check
```

Luego repetir suite ampliada de Cajero y loading, identificar exactamente cualquier test histórico V4 fallido, revisar visualmente el loader y la gestión de incidencias, y realizar smoke humano del **nuevo** flujo: borradores/edición sin RPC, dos grupos en batch, refresh, cierre manual/autocierre, pérdida de respuesta, recuperación tras vencer ventana, bloqueo de rechazos y exportación sin tokens. E2E autenticado con dispositivo real en un entorno de prueba; no usar datos operativos.

**No se cierra esta fase** ni se habilitan conteos operativos hasta confirmar esas evidencias. Los pendientes de KPI, cobertura y contexto original de reconteo pertenecen a bloques independientes y siguen congelados donde corresponda.
