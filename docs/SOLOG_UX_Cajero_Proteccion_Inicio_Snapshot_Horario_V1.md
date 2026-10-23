# SOLOG — UX Cajero — Protección de inicio por snapshot horario — V1

**Estado:** APROBADO Y CONGELADO para implementación frontend; validaciones y smoke pendientes.
**Clasificación:** Nivel B — cambio funcional acotado en el inicio de sesiones.
**Rama:** `admin-work`; `master` fuera de alcance.
**Fuente primaria del delta:** este archivo. Prevalece **solo** en el control temporal de inicio. Se conservan sin cambios la restauración parcial documentada en `SOLOG_Correccion_Cajero_Restauracion_Interfaz_Full_Parcial_V1.md`, los contratos vigentes V6/V7 y el Motor.

## Operación acordada

- La captura de nuevos snapshots se automatiza cada hora a partir de `HH:59`, con una ventana operativa aproximada de un minuto.
- El bloqueo de inicio frontend **comienza en `HH:59:00` y termina en `HH+1:02:00`** (tres minutos exactos, no desde el comienzo de la nueva hora).
- Durante `HH:59:00–HH:59:59.999`, bloquear **todo** inicio, aun si el snapshot nuevo ya fue confirmado.
- Durante `HH+1:00:00–HH+1:01:59.999`, permitir iniciar únicamente si V6 expone un snapshot recién confirmado **en el ciclo iniciado a `HH:59:00`**, vigente y elegible según `capabilities.can_start_session`.
- Desde `HH+1:02:00`, finalizar la espera: si no llegó el nuevo snapshot, permitir el anterior como respaldo **solo** si está dentro de sus dos horas de vigencia y V6 confirma que la sesión puede iniciarse.
- Si el snapshot nuevo llega tarde, utilizar el más reciente que devuelva V6. La sesión abierta congela su referencia y **no** cambia automáticamente al llegar un snapshot posterior.
- Fuera de la ventana no se impone espera adicional. Ninguna restricción de turno, stock, dispositivo o sesión activa se relaja.

## Criterios del preflight

- Punto de entrada: `src/features/solog/cajero/full.app.tsx`; RPCs `rpc_solog_cashier_bootstrap_v6` y `rpc_solog_cashier_mutate_v7` permanecen intactas.
- `FullRuntime.start()` hace refresh del servidor antes de iniciar y V6 es la autoridad de la elegibilidad. La guardia frontend no sustituye esa verificación.
- El contrato de stock incluye `snapshot_confirmed_at`, `snapshot_captured_at`, `stock_expires_at`, `is_fresh` y `snapshot_id`.
- Para reconocer una actualización **de este ciclo**, comparar `snapshot_confirmed_at` con el comienzo horario `HH:59:00`, utilizando reloj confiable de `ServerClock` (zona `America/Lima`), no el reloj no sincronizado de la máquina. Las fechas son timestamps absolutos. V6 continúa validando vigencia por `snapshot_captured_at`.
- Mientras se espera el nuevo snapshot, refrescar V6 periódicamente de forma limitada, sin polling permanente ni cambios de backend. No hacer RPC durante cada tick visual.
- Deshabilitar el botón durante el bloqueo y mostrar causa. Revalidar la guardia dentro del callback de inicio para evitar un clic en el límite de minuto.
- Si no existe reloj confiable, la guardia no debe declarar disponible la sesión.

## Casos límite

- Confirmación a `HH:59:22` → inicio solo desde `HH+1:00:00`.
- Confirmación a `HH+1:00:22` → inicio al detectar la confirmación, sin esperar `HH+1:02`.
- Ausencia hasta `HH+1:02:00` → respaldo elegible.
- Respaldo expirado, sesión activa en sede, error V6, dispositivo no autorizado → inicio impedido por el contrato actual.
- Rollover `23:59` a día siguiente; cortes de turno `07:59` y `15:59`; tab en segundo plano y reanudación.
- Una sesión previamente iniciada no queda bloqueada por este control: solo se protege el evento **start**, no la captura, el envío ni el cierre.

## Exclusiones

Sin cambios en Supabase, RPCs, políticas, cron, motor, prioridades, turnos, snapshot automático, recuperación, historial, borradores locales o envío agrupado. Este delta no resuelve los tres pendientes funcionales ya documentados ni los demás casos de sesiones cortas previos a un cambio de turno.

## Validación y cierre

Tests dirigidos para cada borde temporal; lint, typecheck, build, `git diff --check`; smoke humano justo antes/durante/después del minuto de actualización y sin nuevo snapshot. No declarar comprobado lo que no se ejecute.
