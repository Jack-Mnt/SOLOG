# G1 — Contratos, revisiones, aislamiento y respuestas tardías

Estado: **IMPLEMENTADA Y VALIDADA AUTOMÁTICAMENTE — PENDIENTE DE REVISIÓN**

## Alcance y baseline

- Fecha: 2026-09-04.
- Branch: `master`; commit inicial: `9df147a772050a926697f85d4afcb781cf8cd5d5`.
- Working tree inicial limpio; no había cambios preexistentes que reemplazar.
- Fuentes: decisiones funcionales congeladas, contrato frontend/backend V6 y fase G1 del plan aprobado. Las RPC mantienen `contract_version = 2`; publicación mantiene su respuesta específica de Edge v4, no un envelope SQL inventado.
- Solo integración frontend y pruebas simuladas. Sin cambios ni mutaciones en Supabase, sin nuevas RPC, sin acceso directo a inventario, sin despliegue ni commit. No se ejecutaron G2, G3 ni S10.

## Correcciones y trazabilidad

| Propietario original | Evidencia encontrada | Corrección G1 |
|---|---|---|
| I1 / Auth | getSession pendiente podía sobrescribir un evento Auth posterior | El primer evento de Auth invalida la restauración inicial pendiente; cleanup conserva la barrera de montaje |
| I1 / routing | Promise global de route podía compartirse entre usuarios | Dedupe dentro de cada instancia del resolver; se comprueba identity.id contra el usuario solicitado; misma RPC/payload vacío |
| C1–C3 | Una actualización pendiente podía terminar después de start; una revisión inferior podía sustituir bootstrap | Se serializa la mutación respecto del refresh; bootstrap rechaza operational/devices inferiores dentro de la misma sede, sin comparar revisiones entre sedes |
| D1–D3 | Summary invalidado o devices inferior podía sobrescribir contexto; errores tardíos podían borrar el contexto nuevo | Identidad de solicitud, revisión devices y epoch de caché protegen respuestas y errores |
| A1–A3 | Bootstrap obsoleto publicaba identidad antes de validar; error invalidado podía reintroducir una entrada o revocar el contexto nuevo | Validación previa de revisiones; los errores solo actúan si su entrada sigue vigente |
| A4–A6 | Una mutación/publicación pendiente podía publicar resultado después de cambiar el acceso | Epoch de acceso; limpieza de resultados/intenciones al cambiar rol/sedes; errores de lecturas invalidadas no afectan acceso nuevo |

No se recalculan KPI, cobertura, denominadores, familias ni totales. Un replay sigue siendo un éxito confirmado de la misma intención; no produce incremento local. La recuperación de publicación conserva el mismo operation_id, incluso si su respuesta se descarta por cambio de acceso. No se generan timestamps, hashes ni artefactos en frontend.

## Evidencia automática

- `bun test`: **211 pass, 0 fail, 794 assertions, 26 archivos**.
- `tests/global-g1.test.ts`: 15 casos / 53 assertions. Añade carreras refresh/mutación, cinco acciones Cajero con retry/replay, monotonicidad operational/devices, cambio de sede, errores tardíos, bootstrap Admin obsoleto y mutación tras cambio de acceso.
- `bun run lint`: correcto, sin warnings.
- `bunx tsc -b`: correcto.
- `bun run build`: correcto.
- `git diff --check`: correcto.

### Matriz de validación G1

| Garantía | Evidencia |
|---|---|
| Usuario, logout y restauración Auth tardía | Nuevo global-g1.browser; pruebas existentes de disposal en los tres stores |
| Dos pestañas e intenciones de routing independientes | global-g1.browser: tres usuarios simulados, identidad incorrecta, retry y logout con RPC pendiente; cero solicitudes externas |
| Sedes y revisiones aisladas | global-g1, admin-v2-isolation, admin-management-isolation y details-phase3 |
| Dispositivo/revocación/reemplazo y borradores | cajero-v4, cajero-c4, admin-management; se conservan validaciones backend y limpieza de memoria |
| Sesión congelada y expiración durante intención pendiente | cajero-c4: retry de commit al expirar, reloj de replay no retrocede; cierre/temporización simulados en browser Cajero |
| Cada mutación idempotente | global-g1 cubre cinco acciones Cajero; admin-management cubre las once acciones maestras/incidencias/dispositivos y publicación; details-phase2 cubre request_access |
| Contrato 2 y formas específicas | Adaptadores route, Cajero, historial, Detalles, Admin y maestro mantienen validación de versión; suites de contrato prueban rechazo de versiones/wrappers incompatibles |
| Invalidación selectiva / respuestas tardías | Pruebas dirigidas nuevas más suites originales: historial por fecha/origen, detalle por caso, caché por sede y dominio, groups/catalog globales |
| Sin refetch por foco ni N+1 | Regresiones browser Cajero/Detalles/Admin y pruebas de caché existentes |

### Navegador simulado

Todas las pruebas usan transportes o respuestas falsas y bloquean tráfico productivo.

- `global-g1.browser.mjs`: PASS, carreras Auth y dos tabs; cero solicitudes externas.
- `index-phase1.browser.mjs`: PASS, portada con cero llamadas Supabase.
- `cajero-v4.browser.mjs`: PASS, C1–C4, historial/cache, replay, suspensión/expiración/cierre simulado.
- `details-v2.browser.mjs`: PASS, D1–D3, paginación/cursor, cache, replay acceso y exportaciones.
- `admin-v2.browser.mjs`: PASS, A1–A3, 16 llamadas simuladas, 0 productivas.
- `admin-management.browser.mjs`: PASS, A4–A6, 65 llamadas simuladas, 0 productivas; errores/replays/mutaciones e invalidación.

El primer intento del harness nuevo utilizó un selector de Login incorrecto; se corrigió a “Ingresar”, se esperó la suscripción Auth y la ejecución posterior pasó. No fue una regresión funcional.

## Límites y pendientes

- No se detectó una nueva incompatibilidad contractual backend. Los cambios Cajero/Detalles son correcciones concretas de integración y no reabren sus funcionalidades.
- Esta evidencia valida al cliente frente a escenarios simulados; no certifica permisos, concurrencia SQL, locks o flujos reales contra producción.
- Cajero conserva **IMPLEMENTACIÓN TÉCNICA COMPLETADA — VALIDACIÓN HUMANA PENDIENTE**.
- Gate real: **PENDIENTE — smoke test humano por dispositivo autorizado**. No ejecutado ni simulado como si fuera una validación productiva.
- El smoke humano sigue siendo obligatorio antes del cierre definitivo de G3, cierre global y S10 relacionado. No impide revisar G1 ni autorizar después G2.
- G2/G3/S10 permanecen sin ejecutar. Esperar revisión del usuario.
