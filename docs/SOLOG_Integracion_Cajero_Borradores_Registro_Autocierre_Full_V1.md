# SOLOG — Integración Cajero — Borradores, registro y autocierre Full V1

**Estado:** implementación frontend en `admin-work`; **tests dirigidos, lint y build en verde y smoke humano Full 8/8 validado (2026-10-26)**. Evidencia técnica y trazabilidad en `docs/SOLOG_Correccion_Cajero_Full_Recuperacion_Incidencias_V1.md`; E2E de recovery avanzado y suite global pendientes. Bloque integral aún abierto.
**Nivel:** C. **Fecha:** 2026-10-25.

## 1. Precedencia

1. **Fuente primaria funcional congelada:** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`. Este reporte **no redefine** sus decisiones.
2. **Contrato backend desplegado:** `docs/SOLOG_Backend_Cajero_Full_Recovery_Finish_V1.md`, migración `20261025201355_solog_cajero_full_recovery_finish_v1`. Las entradas públicas siguen siendo `bootstrap_v6` y `mutate_v7`.
3. La restauración UI se rige por `docs/SOLOG_Correccion_Cajero_Restauracion_Interfaz_Full_Parcial_V1.md` y los deltas de protección de captura/inicio. Este bloque conserva diseño y Motor.

Se conserva la compatibilidad de lectura del journal antiguo `solog.full2` y **no** se reactiva V4/V5. Se mantienen `master`, Supabase, prioridades y políticas de snapshot intactos.

## 2. Cambios efectuados

### Runtime `full.runtime.ts`
- Journal Full con `version: 2` y `drafts` aditivos; migra `version: 1` sin perder `pending`, `confirmed` ni `panels`.
- `observe()` guarda borrador local editable con identidad de sesión, snapshot congelado, revisión, instante original, cantidad, motivo y expresión. El mismo grupo se actualiza sin duplicados. No emite RPC.
- `sendPending()` prepara `save_batch` y `recount_save_batch` de **máximo 500** ítems, separado por sesión/acción/prioridad; reconsulta V6 tras cada confirmación; consume `recovery_delivery_states` para sesiones en recovery.
- Persiste payload inmutable y `operation_id` antes de V7. Reintenta operaciones ambiguas con IDs iguales. Si hay rechazo definitivo o error incierto, detiene la secuencia y conserva evidencia.
- `retry()` no transforma rechazos conocidos en pendientes. `finish()` registra primero los drafts autorizados, bloquea cierres con pendientes/rechazos y reutiliza un `finish` ya preparado sin regenerar manifiesto.
- `start()` preserva el replay de un inicio preparado y bloquea nueva sesión si hay trabajo viejo sin conciliar. Conserva la guardia HH:59–HH+1:02.

### Contrato `full.contract.ts`
- Lectura tipada y validada de `recovery_delivery_states` desplegado, aditiva respecto al estado V6 anterior.

### UI `full.app.tsx`
- `Continuar` guarda localmente. Recupera cantidad/expresión/motivo al regresar al grupo; D.1.4 compara la cantidad resultante y no trata expresiones equivalentes como cambios.
- Inicio, Conteo y Conteo diario recuperan `Registrar conteo`; Revisar mantiene el envío exclusivamente por cierre u orquestación global.
- Progreso local del modal `n/N` y diferencia de borrador. **No equivale al KPI de cobertura autoritativo**, que sigue pendiente en otro bloque.
- Efecto de autocierre al vencer `session_expires_at`: intento de entrega/conciliación/finish, reanudación con reconexión, y reintentos espaciados al menos 30 s. No declara cerrado sin confirmación.
- Logout primero intenta finalizar la sesión y no sale si queda trabajo pendiente.
- Conserva mensajes y exportación del outbox. No expone secretos nuevos.

## 3. Pruebas añadidas

`tests/cajero-full-registro-autocierre.test.ts`:
- edición y cantidad 0, sin mutación remota al capturar;
- dos borradores en un batch + manifiesto de cierre;
- timeout y replay con el mismo UUID/payload;
- rechazo definitivo sin reintento ni cierre falso;
- cierre tras vencimiento con envío de observaciones previas en recovery;
- migración de journal V1.

`tests/cajero-full-inicio-snapshot-horario.test.ts`: se ajusta una expectativa para reflejar fallo **explícito** de entrega incierta, preservando el outbox. No cambian sus restricciones de inicio.

## 4. Validaciones pendientes y bloqueos conocidos

- **Actualización de validación (2026-10-26):** el usuario ejecutó el test dirigido `cajero-full-registro-autocierre.test.ts`, lint y build, todos reportados en verde después de `640e197f`. Smoke humano del **nuevo flujo Full**: **8/8 aprobado**. Verificación remota solo lectura: 3 borradores identificados en exportación previa al envío, registrados en un único `save_batch`, 3 observaciones confirmadas, sesión finalizada con receipt de `finish` y 0 conflictos. Evidencia detallada en el delta técnico vigente. Permanecen pendientes la suite global y los E2E avanzados de recovery/concurrencia.
- El backend tiene smoke básico V6/V7 8/8 reportado previamente, pero **no** pruebas autenticadas completas de recovery + replay con lotes ni cierre ambiguo; estas siguen siendo condición para el cierre integral.
- Motivos originales/contexto de reconteos y KPIs autoritativos permanecen en sus bloques independientes. No inventar esos campos.
- Faltan pruebas de múltiples pestañas y recuperación con reconteos reales; revisar secuencia y estado en navegador.
- Un borrador no elegible después de cambio de prioridad se conserva y bloquea cierre; se necesita decidir y comprobar el procedimiento explícito de descarte seguro y atención al usuario antes de producción.
- No se deben realizar conteos operativos reales con esta rama hasta finalizar pruebas de persistencia/recuperación y smoke.

## 5. Validaciones locales solicitadas

```powershell
git switch admin-work
git pull
bun test tests/cajero-full-registro-autocierre.test.ts tests/cajero-full-inicio-snapshot-horario.test.ts tests/cajero-full-presentacion-regresion.test.ts
bun run lint
bun run build
git diff --check
```

Además, ejecutar suite completa de Cajero y comprobar manualmente Inicio → capturar 2 grupos → editar borrador → Registrar conteo → Finalizar; vencimiento con pendientes, refresh/reconexión y outbox incierto en entorno seguro.

**No cerrar el bloque sin evidencias de estas validaciones y smoke humano.**
