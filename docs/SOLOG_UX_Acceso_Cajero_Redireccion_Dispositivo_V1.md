# SOLOG — UX — Acceso Cajero por autorización de dispositivo V1

**Estado:** APROBADO Y CONGELADO para implementación — 2026-11-23 (America/Lima).
**Clasificación:** Nivel B (navegación funcional de acceso; frontend, sin cambios backend).
**Rama:** `admin-work`; `master` fuera de alcance.

## 1. Alcance y fuente primaria

**Fuente primaria única de este delta:** `docs/SOLOG_UX_Acceso_Cajero_Redireccion_Dispositivo_V1.md`.

Prevalece exclusivamente sobre la **ruta de destino de Cajero después del login y en entradas directas/compatibles**. No sustituye:
- `docs/SOLOG_UX_Detalles_Transicion_Cajero_V1.md`: solicitud, consulta y botón «Ir a Cajero» desde Detalles.
- `docs/SOLOG_Backend_Contratos_Runtime_Actual_V2.md`: contrato de lectura `rpc_solog_details_v2`, acción `summary`.
- `docs/SOLOG_Integracion_Cajero_Ciclo_Horario_O1_Cierre_Formal_V1.md`: ciclo, recuperación y riesgos aceptados.
- `docs/SOLOG_UX_Cajero_Instancia_Unica_Tablet_V1.md`: una única instancia Cajero y su tenencia.
- `docs/SOLOG_Correccion_Cajero_Detalles_BloqueA_Frontend_V1.md`: alcance independiente A1–A4.

## 2. Decisión funcional

El usuario aprobó dirigir una identidad con rol `cajero` según autorización **efectiva del dispositivo del navegador para su propia sede**:

| Condición reportada por backend | Destino |
|---|---|
| `current_device_state='autorizado'` **y** `current_device_matches_site=true` | `/cajero` |
| Sin token, sin solicitud, pendiente, revocado, dispositivo de otra sede o sede con otro dispositivo autorizado | `/detalles` |
| Fallo de red, respuesta inválida, error de autenticación/contrato | No inferir denegación: mostrar estado de error y `Reintentar`/`Cerrar sesión`; no entrar a Cajero |

Para rol `admin` o `moderador`, conservar `/admin` según `rpc_solog_route_v2`.

- La RPC `rpc_solog_route_v2` conserva su contrato y decisión por **rol**, sin incluir device token ni cambiar el backend.
- Para las rutas Cajero se usa exclusivamente `rpc_solog_details_v2` `summary` con el token existente, y los campos `access.current_device_state` y `access.current_device_matches_site` autoritativos.
- Aplicar también en entrada autenticada **directa** a `/cajero`, subrutas y alias de compatibilidad `/count` y `/cajero/seguimiento`. Una sesión Auth válida no debe montar `FullRuntime` mientras la autorización no haya sido confirmada.
- Evitar bucles: `/detalles` sigue accesible sin autorización para ver la sede y solicitar/consultar acceso. Si se autoriza desde Detalles, el botón existente «Ir a Cajero» regresa por el guard a Cajero. La navegación interna entre subrutas Cajero no repite el guard cada vez.
- **Instancia única y recovery:** la comprobación solo **lee** un token local válido; no genera token, no obtiene la tenencia del Cajero, no abre ni borra `solog.full2`, no intenta `finish` ni altera drafts/replays. Si falta token o el storage es inaccesible, destino `/detalles`, que ya dispone de su ciclo propio de token/solicitud. Una revocación no elimina ni confirma operaciones locales pendientes.
- El bootstrap V6 y las mutaciones V7 de Cajero conservan las validaciones de dispositivo del servidor (el guard es UX, no un nuevo permiso).
- Se rechazan resultados asíncronos de intentos, identidades y componentes desmontados; los reintentos son explícitos. No persistir en caché la autorización como credencial.

## 3. Alcance de implementación

Cambio acotado a:
- `src/features/solog/device.ts`: lectura pura de token existente, sin generación.
- `src/features/solog/cashier-access.ts`: cálculo tipado del destino mediante `detailsRpc('summary', ...)`.
- `src/protected-app.tsx`: guard de ruta Cajero que verifica autorización antes de montar `CajeroApp`. El login sigue obteniendo rol mediante V2.
- `tests/cajero-access-routing.test.ts`: matriz, errores, no token y assertions del wiring.
- Workflow de CI de Cajero: incorporar nuevas rutas y prueba dirigida.

**Fuera de alcance:** modificar `rpc_solog_route_v2`, `rpc_solog_details_v2`, `rpc_solog_cashier_bootstrap_v6`, V7, Motor, horarios, permisos/RLS, storage/journal, login visual, Detalles UI, A3, Admin y `master`.

## 4. Validación y cierre

Pruebas dirigidas del destino autorizado/no autorizado y errores, chequeo de que el guard envuelve todas las rutas compatibles, lint, typecheck/build, suite Bun, browser de regresión Full, `git diff --check`, CI y smoke humano en navegador con dispositivo autorizado y no autorizado. La CI nunca sustituye una prueba real de rol/dispositivo en Supabase.

**Estado de implementación:** pendiente en el momento de congelación. Registrar commits, resultados reales y límites posteriores en un apartado aditivo, sin reescribir estas decisiones.

---

## 5. Ejecución y evidencia posterior — 2026-11-23

**Estado de implementación: COMPLETADA Y VALIDADA TÉCNICAMENTE; smoke humano con dispositivos reales PENDIENTE.** Esta sección sustituye únicamente el estado «pendiente» de la sección 4, sin modificar el contrato funcional congelado.

- `src/features/solog/device.ts`: `getStoredDeviceToken()` de solo lectura; la creación sigue reservada a `getOrCreateDeviceToken()`.
- `src/features/solog/cashier-access.ts`: resolución `/cajero` o `/detalles` con `rpc_solog_details_v2` `summary`; error de red no se convierte en denegación.
- `src/protected-app.tsx`: `CashierDeviceGuard` protege las cinco rutas Cajero y los dos alias, después de resolver rol; **no monta `CajeroApp` antes de autorización**. La navegación interna autorizada no reinstancia el guard. Se preservan `/admin` y `/detalles`.
- `tests/cajero-access-routing.test.ts`: matriz, token ausente, lectura sin escritura, errores y cobertura del guard.
- `tests/cajero-full.browser.mjs`: RPC de acceso y rol simuladas, acceso desde login, redirección no autorizado, alias pendiente y recuperación tras fallo de red. Seguimiento de tenencia conserva su invariantes V6/V7.
- `.github/workflows/solog-cajero-full-v3-contracts.yml`: archivos y test añadidos a activación y batería dirigida.

**HEAD de código validado:** `336516d8f8d132bfb7e1d1691b2642fe7089062d`.
**CI:** [GitHub Actions #45264684682](https://github.com/Jack-Mnt/SOLOG/actions/runs/45264684682), **conclusion=success**. Pasaron: pruebas dirigidas, lint, typecheck/build, Chromium Full con simulación, `git diff --check` y suite global Bun. No hubo consultas remotas de Supabase desde los escenarios de navegador.

**Pendiente humano para cierre:** desde un navegador/dispositivo previamente autorizado, entrar por Login y acceder a `/cajero`; desde otro sin autorización, entrar por Login y terminar en `/detalles`, ver su dispositivo y solicitar/consultar permiso; comprobar que tras autorizar desde Detalles «Ir a Cajero» funciona; comprobar entrada directa sin autorización y fallo de conexión sin falsa denegación. No se debe forzar revocación de un dispositivo operativo para probar. Los estados post-entrada autorizada siguen validados por el backend V6/V7.

**No se modifica Supabase, V6/V7, motor, journal, recovery ni `master`.**

---

## 6. Incidencias del smoke humano — pendientes

**Estado vigente: VALIDACIÓN HUMANA NO SUPERADA; el usuario identificó fallas reales en redirección de acceso.** No hay diagnóstico concreto ni capturas todavía, por lo que no se atribuye causa ni se considera corregido.

Por decisión explícita del usuario, la investigación y corrección de estas incidencias se **pospone hasta finalizar el bloque A3 — Historial condicional** (`docs/SOLOG_Integracion_Cajero_Historial_Condicional_A3_V1.md`). No intervenir el guard, `rpc_solog_details_v2`, login ni V6/V7 como parte de A3.

La CI previa continúa válida como evidencia **técnica simulada**, no como evidencia de que el flujo real aprobado haya superado su smoke. Cuando se retome el incidente, revisar capturas, baseline actual y causas reales antes de ampliar el alcance.

---

## 7. Reanudación de diagnóstico — 2026-11-24

**Estado vigente: INCIDENCIA ABIERTA; PRE-FLIGHT DIRIGIDO EN CURSO; SIN NUEVA IMPLEMENTACIÓN.** El usuario completó el smoke de A3 Historial y solicitó continuar con este pendiente. Ya no está pospuesto por A3.

**Inspección estática en `admin-work`:**

1. En `src/protected-app.tsx`, `LoginRouteResolver` invoca `rpc_solog_route_v2`, que decide `/cajero` por rol; **luego** `CashierDeviceGuard` evalúa el dispositivo antes de montar Full. Esto supone **dos saltos lógicos** para Cajero. Que el salto intermedio sea la causa del fallo real **no está demostrado**.
2. `CashierDeviceGuard` usa `getStoredDeviceToken()` de solo lectura y `rpc_solog_details_v2('summary',{device_token})`; únicamente permite `/cajero` cuando `current_device_state === 'autorizado'` y `current_device_matches_site === true`. Ante ausencia de token envía a `/detalles`; en fallos de red muestra reintento.
3. `/detalles` utiliza `getOrCreateDeviceToken()` para iniciar o gestionar solicitud, vuelve a leer `summary` y expone «Ir a Cajero» cuando el dispositivo está autorizado. Esto implica segunda consulta de resumen después del guard en un flujo no autorizado.
4. **Supabase inspeccionado en solo lectura:** `public.rpc_solog_details_v2` valida `auth.uid()`, usuario activo de rol `cajero`, sede activa; busca dispositivo por SHA-256 del token y determina `current_device_state`, `current_device_matches_site`, `authorized_device_id` y `can_request`. El contrato de frontend `DetailsSummary` es coherente en campos, pero **no se ha comprobado una respuesta HTTP real del caso fallido**.
5. GitHub Actions `45264684682` validó casos **simulados** de acceso permitido, no autorizado, solicitud pendiente y error de red. Es evidencia de regresión técnica, no certificación del smoke humano.
6. Como Cloudflare Pages puede no desplegar automáticamente pushes de `admin-work`, para reproducir el problema se debe comprobar **qué SHA está activo en Preview**, y registrar ruta inicial/final, tipo de dispositivo, mensaje en pantalla, RPC HTTP y si el token existe, **sin compartir token ni credenciales**.

**Necesidad de evidencia:** el usuario anunció capturas de los fallos reales, pero aún no las ha adjuntado a este bloque. Esperarlas para identificar el caso concreto y proponer corrección mínima; no inferir que el problema procede del backend o del navegador sin reproducción.

**Límites vigentes:** no cambiar rutas, permisos, RLS, RPC V2, bootstrap Full V6/V7, journal ni recuperación sin causa confirmada y delta aprobado. A3 continúa cerrado e independiente.

---

## 8. Hallazgo por capturas y verificación Supabase — 2026-11-24

**Estado: CAUSA DEL BLOQUEO OBSERVADO IDENTIFICADA EN LA CAPA DE CUENTA; NO SE HA DEMOSTRADO DEFECTO EN REDIRECCIÓN DE DISPOSITIVO; SIN CAMBIOS DE SEGURIDAD.**

**Capturas aportadas por el usuario:** `localhost:5173/login`, `/detalles`, `/cajero`. En las tres se muestra literalmente «Este usuario está deshabilitado», con títulos contextuales «No se pudo resolver tu acceso», «No se pudo cargar la información de la sede» y «No se pudo comprobar el dispositivo».

**Preflight SQL remoto en el proyecto PuertoRicoOnline, solo lecturas:**

- En `public.usuarios` existen **5 identidades de rol cajero**, de las cuales **3 tienen `activo=false`** y 2 `activo=true`. Sus cuentas de Auth existen y las sedes asignadas están activas.
- `public.rpc_solog_route_v2` devuelve `SOLOG_USER_DISABLED` si el usuario autenticado no aparece en `public.usuarios` **o** `activo=false`. No llega a evaluar el rol/ruta cuando ocurre esto.
- `public.rpc_solog_details_v2` también rechaza identidad ausente/deshabilitada con `SOLOG_USER_DISABLED` **antes** de la detección del dispositivo. El guard de `/cajero` consulta esa misma RPC `summary`; correctamente no convierte un error de cuenta en `/detalles`.
- Una lectura en transacción `BEGIN/ROLLBACK` simulando rol Cajero **activo** con un token nuevo (64 hex) obtuvo `summary.access.current_device_state='sin_solicitud'` y `current_device_matches_site=true`. En la sede inspeccionada había otro dispositivo autorizado, por lo que `can_request=false`: ese escenario es un bloqueo por capacidad de sede, no por login. Sin cambios de datos.
- **No se identificó la cuenta exacta de las capturas:** hay tres cajeros inactivos y ninguna de las imágenes muestra qué correo/identidad Auth se utilizó. No atribuir una cuenta específica sin dato adicional y no habilitar cuentas en masa.

**Diagnóstico:** el fallo reproducido sucede en la **autorización de cuenta**, previa a la autorización del dispositivo. Ningún Cajero inactivo debe acceder a Detalles ni crear solicitudes para sortear el control de cuenta. La redirección `/cajero → /detalles` aplica únicamente cuando **la cuenta está activa** y el dispositivo no está autorizado; un error `SOLOG_USER_DISABLED` debe permanecer como error de acceso.

**Acción pendiente acotada:** identificar qué cuenta se utilizó y confirmar expresamente si debería estar activa. Solo si el usuario aprueba la reactivación de **esa identidad concreta**, verificar y ajustar su `public.usuarios.activo` en backend, con validación posterior. No cambiar RLS, roles, tablas ni RPC para eludir cuentas deshabilitadas. Después repetir smoke en un dispositivo nuevo y verificar el caso específico de sede con dispositivo previamente autorizado.

**UX de doble salto:** actualmente `LoginRouteResolver` dirige a `/cajero` por rol y `CashierDeviceGuard` puede reemplazar por `/detalles`. Es una mejora independiente posible para evitar la navegación intermedia, pero **no se ha probado que sea causante de las capturas**. Cualquier refactor de ruta debe ser un delta aprobado y no sustituye resolver el estado activo de la cuenta.

---

## 9. Cierre de incidencia por cuenta deshabilitada — 2026-11-24

**Estado actual de la incidencia observada: RESUELTA Y CONFIRMADA POR EL USUARIO.** El diagnóstico y las capturas de §§7–8 son históricos y no representan un bloqueo vigente.

- **Causa comprobada:** las RPC `rpc_solog_route_v2` y `rpc_solog_details_v2` rechazaban una identidad con `public.usuarios.activo=false`, antes de verificar autorización de dispositivo. El error visible era `SOLOG_USER_DISABLED` («Este usuario está deshabilitado») en `/login`, `/detalles` y `/cajero`.
- **Corrección backend autorizada:** a petición expresa del usuario se actualizaron únicamente los tres registros inicialmente inactivos de `public.usuarios` a `activo=true`; no se cambiaron roles, sedes, dispositivos, tokens, RLS ni funciones. Verificación posterior en Supabase: **7/7 usuarios activos**, **5/5 cajeros activos**, **0 inactivos**.
- **Smoke humano:** el usuario repitió la prueba y comunicó explícitamente «se solucionó». Se registra como **aprobación de la incidencia de acceso observada**. No hay capturas ni mediciones HTTP de todos los escenarios de la matriz de acceso posteriores a la corrección; no se declara acreditada exhaustivamente toda la matriz.
- **Implementación frontend:** sin cambios en el guard ni en el doble salto por rol; la corrección de la incidencia fue de **datos/estado de cuenta**, no de lógica de redirección. La observación técnica sobre el salto `/login → /cajero → /detalles` queda como **oportunidad UX opcional, no como fallo activo**. Solo implementar con delta y aprobación si se prioriza.
- **Rama:** `admin-work`; sin fusión a `master` ni nuevos commits de código para esta resolución.

**Cierre:** no abrir otra corrección de redirección por esta incidencia sin nueva evidencia reproducible. El bloque A3 permanece cerrado por separado.
