# SOLOG — Corrección Cajero — Inicio horario y confirmación tardía — Delta V1

**Estado:** corrección implementada en `admin-work`; tests locales y smoke humano pendientes.
**Clasificación:** Nivel A — corrección contractual de presentación/guardia frontend.
**Fuente primaria vigente:** `docs/SOLOG_UX_Cajero_Proteccion_Inicio_Snapshot_Horario_V1.md`.
**Este delta reemplaza solamente** el criterio de reconocimiento de snapshot nuevo; conserva íntegros los horarios, tiempos, autorizaciones y restantes decisiones de la fuente primaria.

## Hallazgo

La guardia implementada reconocía un snapshot como nuevo cuando `snapshot_confirmed_at >= HH:59:00`. Sin verificar `snapshot_captured_at`, una confirmación tardía de un snapshot **capturado en un ciclo anterior** podía levantar la espera antes de `HH+1:02:00`.

La base permite separaciones entre captura y confirmación. Un snapshot confirmado durante el ciclo actual no necesariamente fue capturado dentro de ese ciclo.

## Criterio corregido

Entre `HH+1:00:00` y `HH+1:01:59.999`, permitir inicio únicamente si:

- `ServerClock` está sincronizado;
- `snapshot_captured_at >= HH:59:00` del ciclo actual;
- `snapshot_confirmed_at >= snapshot_captured_at`, y no está en el futuro;
- V6 además autoriza el inicio y el stock está vigente.

`HH:59:00–HH:59:59.999` sigue **totalmente bloqueado**.
A partir de `HH+1:02:00`, la guardia finaliza y V6 puede autorizar el snapshot anterior como respaldo si sigue vigente.
La comprobación también se ejecuta tras el bootstrap remoto en `FullRuntime.start()`.

## Alcance

- `src/features/solog/cajero/full.start-gate.ts`: comprobación de captura y confirmación.
- `src/features/solog/cajero/full.app.tsx`: entrega ambas marcas temporales.
- `src/features/solog/cajero/full.runtime.ts`: segunda guardia post-bootstrap.
- `tests/cajero-full-inicio-snapshot-horario.test.ts`: caso específico de confirmación tardía de stock anterior.

No modifica Supabase, RPC, Motor, cron, turnos, sesiones existentes, reintentos, recovery, borradores ni otras decisiones UI.

## Validación pendiente

```powershell
git pull
bun test tests/cajero-full-inicio-snapshot-horario.test.ts
bun run lint
bun run build
git diff --check
```

Después, smoke de inicio durante minuto 59, desbloqueo anticipado solo con snapshot nuevo y respaldo exactamente a `HH+1:02:00`.
