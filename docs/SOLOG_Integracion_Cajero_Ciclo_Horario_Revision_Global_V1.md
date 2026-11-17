# SOLOG — Integración Cajero — Ciclo horario V3 — Revisión global V1

**Estado:** FASE 5 FRONTEND VALIDADA TÉCNICAMENTE. **O1 NO CERRADO / NO-GO PARA REAPERTURA** hasta E2E operativo y smoke humano.
**Fecha:** 2026-11-17.
**Clasificación:** revisión global de implementación frontend Nivel B dentro de O1 Nivel C.
**Rama de implementación:** `admin-work` (no fusionar con `master` automáticamente).
**Baseline anterior:** `11a10a4de3eb304f7524a1978a1f973b7fbce928`.
**HEAD de código validado:** `84f2c4d1c7502ab949e4f57051e02894b14c815a`.
**CI verificado:** https://github.com/Jack-Mnt/SOLOG/actions/runs/44196074189

## 1. Documentos y precedencia

- **Fuente funcional primaria congelada:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
- **Delta posterior de activación que prevalece solo para el orden de política:** `docs/SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md`: `legacy → required` directamente. `dual` quedó histórico/no aplicar.
- **Contrato remoto desplegado y congelado:** `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`.
- **Evidencia fases previas:** `docs/SOLOG_UI_Cajero_Ciclo_Horario_Fase3_Validacion_V1.md` y `docs/SOLOG_UI_Cajero_Conflictos_B5_Fase4_Validacion_V1.md`.
- Este documento registra evidencia y estado, **no sustituye decisiones funcionales ni modifica el backend**. Las menciones «no implementado» y «legacy» del encabezado original primario se conservan como instantánea histórica de la congelación, no describen el estado vigente.

## 2. Auditoría de integración por responsabilidades

| Contrato o flujo | Estado | Evidencia |
|---|---|---|
| V6 `start_offer`, generación y selección explícita | Implementado | Contrato tipado y parser, tests y navegador V3 |
| V7 `start` con UUID/payload V3 persistente | Implementado | Runtime, tests de selección y replay exacto |
| `new` sin modal; `fallback` con consentimiento humano | Implementado | Chromium, escenarios separados |
| Espera voluntaria de 30 s sin V7 automático | Implementado | Chromium con reloj controlado |
| Guardia HH:57 y mínimo de 180 s | Implementado | Guardia UI, revalidación tras V6, test de cruce horario |
| Nuevo ciclo HH:00 y refresco puntual | Implementado | Guardia y tests horarios; sin polling previo de 8 s |
| Replays/UUID y batches máximos de 500 | Preservado | Tests de journal, reintento, lotes y Chromium |
| Caducidad, entrega +2 h y recovery | Preservado en pruebas simuladas | Tests de expiración, finish/recount y múltiples sesiones |
| B5: rechazo definitivo sin escritura parcial | Implementado | Tests de receipt, `field_path` y Chromium |
| B5: archivo local y separación humana, sin reenviar automáticamente | Implementado | Tests de persistencia, exclusiones y Chromium |
| Teclado, foco y Escape de modal fallback/B5 | Implementado | Smoke Chromium y revisión de accesibilidad |
| E2E V6/V7 positivo con snapshot fresco real | **NO VALIDADO** | No existe captura vigente |
| Concurrencia real ConeXion/snapshot/recuperación en Supabase | **NO VALIDADO E2E** | Solo pruebas sintéticas y de contrato |
| Deployment Preview del HEAD de código y smoke humano | **NO VERIFICADO** | Requiere publicación/control manual posterior |

## 3. Correcciones concretas introducidas durante Fase 5

1. `src/features/solog/cajero/full.runtime.ts`: reevaluación de `cashierStartGate` después de refrescar V6 y **antes de persistir un nuevo `start`**. Impide preparar V7 cuando el refresco cruzó HH:57 o invalidó el ciclo. V7 continúa siendo la autoridad final.
2. `tests/cajero-full-runtime-inicio-v3.test.ts`: caso de HH:57 con oferta del mismo ciclo y 180 s exactos; se demuestra ausencia de RPC V7 y ausencia de operación nueva en el journal.
3. `src/features/solog/cajero/full.conflict-dialog.tsx` (nuevo) y `full.app.tsx`: la confirmación humana B5 tiene nombre/descripcion accesibles, foco inicial, contención de Tab, Escape y devolución de foco al disparador. No cambia persistencia, acciones ni semántica de conflictos.
4. `tests/cajero-full.browser.mjs`: verifica foco, Tab/Shift+Tab, Escape sin envío ni archivo y retorno al disparador.
5. Workflow GitHub Actions: incluye el nuevo diálogo B5 en la ruta de validación.

**Alcance conservado:** no hubo cambios a Supabase, RPC, RLS, Motor, Admin, política `required`, lógica de prioridad, contratos congelados ni `master`. El diff de Fase 5 contiene seis archivos: runtime, app, modal B5, test de runtime, smoke navegador y workflow.

## 4. Evidencia ejecutable de Fase 5

**Ejecución GH Actions:** [#44196074189](https://github.com/Jack-Mnt/SOLOG/actions/runs/44196074189) — `success`, SHA de código `84f2c4d1c7502ab949e4f57051e02894b14c815a`.

| Verificación | Resultado |
|---|---|
| Bun, pruebas dirigidas Full | **70 PASS / 0 FAIL**, 7 archivos |
| Bun, suite completa del repositorio | **877 PASS / 0 FAIL**, 97 archivos |
| Chromium, smoke simulado Full | **35 PASS / 0 FAIL**; 0 solicitudes externas |
| Lint | **PASS** |
| Typecheck y build Vite | **PASS** |
| `git diff --check` contra merge-base | **PASS** |

El fallo temporal previo de `tests/admin-control-v3.test.ts` fue corregido en el baseline anterior: rango custom dinámico en Lima, conservando la ventana funcional de 45 días.

## 5. Verificación backend no destructiva (lectura real)

Proyecto Supabase `fvtohxvcvsflzmftgfzs`:
- Política horaria actual: **`required`**; configuración global `full_settings.policy_version = 2` preservada.
- Ventanas Full históricas: **16 V2**, **0 V3**; **0** inconsistencias de expiración y **0** inconsistencias de plazo de entrega.
- **0** sesiones Full activas o recovery y **0** reservas de reconteo existentes.
- **0** snapshots confirmados frescos en el intervalo de dos horas consultado.
- Estado V3 calculado con Cajero existente: `start_offer.status='unavailable'`, `block_reason='STOCK_EXPIRED'`, `can_start=false`.
- La función SQL desplegada `inventario.full_window_v3` superó cinco casos deterministas de solo lectura: snapshot nuevo 12:00, respaldo 12:30, HH:56:59.999, HH:57:00 y respaldo con TTL restante inferior a 180 s.

**No** se insertaron ni modificaron sesiones, snapshots, reconteos, conteos ni datos de dispositivos. Estas comprobaciones no sustituyen ensayos reales transaccionales con snapshot fresco.

## 6. Go / no-go y smoke humano pendiente

**GO técnico del frontend Fase 5:** aprobado por suite global, revisión de código, casos límite y Chromium simulado.

**NO-GO para reapertura pública de SOLOG / cierre O1** hasta completar como mínimo:

1. Confirmar despliegue Preview del HEAD de `admin-work` validado, sin fusionar `master` inadvertidamente y sin reabrir acceso general.
2. Ejecutar una actualización real de snapshot mediante ConeXion y comprobar en Supabase la captura/confirmación, compatibilidad de estructura y vigencia de dos horas.
3. Con un cajero/dispositivo autorizado, comprobar inicio V3 exitoso con `new` y, cuando exista respaldo válido y generación nueva pendiente, `fallback` explícito / espera de 30 s.
4. Validar un conteo de prueba **autorizado y controlado**: draft, `save_batch`, V6 autoritativo y `finish` sin duplicados ni pérdidas; comparar estado Admin/Motor. No crear conteos ficticios persistentes sin autorización operativa.
5. Verificar reintento de respuesta incierta, vencimiento y recuperación del flujo `pending_delivery_until`; las carreras ConeXion/V7 y reservas B4 requieren escenario controlado o entorno aislado.
6. Confirmar que HH:57 impide iniciar y HH:00 no extiende sesiones anteriores; revalidar contra reloj servidor.
7. Realizar smoke humano de teclado y responsive (390 px, tablet y escritorio), y certificar manualmente la decisión de reapertura.
8. Solo tras evidencia y aprobación: plan de publicación/merge a `master`, verificar despliegue Cloudflare y comunicar apertura.

**Bloqueo actual:** ninguna sede tiene snapshot fresco. Para desbloquear E2E primero se requiere una captura real y un ensayo operativo autorizado; no cambiar la política a `dual` ni `legacy` como sustituto.

## 7. Dictamen final

**Fase 5 técnicamente concluida.** Las Fases 1–5 del frontend están implementadas y verificadas por pruebas automatizadas; la fase de integración operativa / smoke humano y el cierre explícito O1 siguen **pendientes**. Los errores hallados en Fase 5 fueron corregidos y las pruebas completas repitieron en verde.

No declarar «reapertura validada» ni «Motor V3 probado E2E» basándose solo en esta evidencia.
