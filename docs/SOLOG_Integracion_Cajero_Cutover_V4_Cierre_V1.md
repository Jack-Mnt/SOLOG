# SOLOG — Integración Cajero — Cierre Cutover V4 V1

**Estado:** CONGELADO — CIERRE FORMAL VALIDADO  
**Fecha:** 2 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — cierre de cutover / lifecycle / frontend-backend  
**Rama:** `admin-work`  
**Baseline frontend validado:** `1115e1e909be1d54414675aa6f83f4f13cc1a7a2`

---

## 1. Propósito

Este documento cierra formalmente la Fase 14 del cutover del Cajero V4.

No redefine lógica funcional ni contratos. Consolida la evidencia técnica, browser, humana y backend acumulada y declara el runtime Cajero V4 como implementación vigente del Cajero SOLOG.

---

## 2. Autoridad y precedencia

Continúan siendo fuentes primarias de comportamiento:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
3. `docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md`
4. `docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`
5. `docs/SOLOG_Integracion_Cajero_Recovery_Estado_Operacional_V1.md`
6. `docs/SOLOG_Correccion_Cajero_Runtime_V4_PostCutover_V1.md`
7. `docs/SOLOG_Correccion_Cajero_Smoke_Fase14_Autocierre_V1.md`

Este documento prevalece únicamente para el estado de cierre del cutover y la clasificación de su evidencia. Todo comportamiento no descrito aquí sigue regido por las fuentes anteriores.

---

## 3. Resultado del cutover

El Cajero V4 queda aceptado como runtime vigente.

Se consideran cerrados y validados:

- bootstrap y routing V4;
- start de sesión;
- snapshot congelado;
- cobertura por ronda;
- prioridad autoritativa `review → coverage → daily`;
- conteos normales;
- reconteos;
- Coincide / Confirmada / Inconsistente;
- gate por snapshot posterior;
- persistencia local de drafts;
- delivery tardío dentro de recovery;
- idempotencia por `operation_id`;
- finish explícito;
- logout seguro;
- confirmación de salida con sesión activa;
- autocierre al alcanzar `expira_at`;
- recovery transparente en UX;
- reload durante cierre;
- retry exacto ante resultado incierto;
- bloqueo de descarte ante ambigüedad;
- descarte seguro con autoridad suficiente;
- cleanup de runtime al finalizar.

No existe un bloqueo funcional pendiente conocido para el Cajero V4.

---

## 4. Evidencia técnica final — Fase 14.2

Baseline: `1115e1e909be1d54414675aa6f83f4f13cc1a7a2`

| Validación | Resultado |
|---|---|
| Tests dirigidos autocierre/recovery | **121 PASS**, 6 archivos, 548 assertions |
| Suite Cajero V4 | **326 PASS**, 14 archivos |
| Browser smoke V4 | **20 escenarios PASS** |
| Suite global | **730 PASS**, 80 archivos |
| Lint | exit 0 |
| Build | exit 0 |
| `git diff --check` | limpio |

Además:

- cero consumidores V3 activos en `src` y bundle;
- ningún polling backend añadido;
- ningún estado backend inventado;
- retries reutilizan la operación preparada;
- UX no expone `Recovery`;
- UX no usa `Sesión vencida` como estado operativo;
- `Stock vencido` permanece independiente del lifecycle.

---

## 5. Correcciones finales incorporadas

### 5.1. Ausencia en bootstrap no implica estado terminal

```text
sesión ausente en bootstrap
≠
finish confirmado
```

No se eliminan datos locales únicamente porque una sesión deje de aparecer en bootstrap.

### 5.2. Descarte exige autoridad suficiente

`Descartar conteos` solo puede ofrecerse cuando no existe operación incierta ni conflicto idempotente y el lifecycle vigente permite resolver el cierre de forma segura.

### 5.3. Estado de inventario separado del lifecycle

Después de `expira_at`, el header no presenta `Sesión vencida`.

`Stock vencido` puede mantenerse como estado del snapshot sin convertirse en estado de lifecycle.

---

## 6. Evidencia real — Supabase / Casuarinas

La validación real se concentró en Casuarinas.

Se comprobó:

- autorización y routing;
- bootstrap V4;
- creación/finalización de sesiones;
- prioridad Review;
- conteos normales;
- reconteos;
- Coincide / Confirmada / Inconsistente;
- snapshot posterior;
- transición a Revisar;
- agotamiento de Review;
- transición Review → Coverage;
- expiración real;
- recovery real;
- delivery tardío real;
- timestamps previos a `expira_at` preservados;
- logout seguro;
- cleanup runtime.

Estado final observado:

- sesiones abiertas: **0**;
- runtime residual Casuarinas: **0**;
- `review_actionable`: **0**;
- reconteos registrados: **22**;
- duplicados de `client_observation_id`: **0**.

Último snapshot usado:

`2ee949b2-7b75-4e17-a007-32edd31909f8`

- estado: confirmado;
- catálogo V8;
- 970 SKU válidos;
- 488/488 grupos sincronizados con el snapshot;
- `requiere_snapshot_completo = 0`.

---

## 7. Idempotencia

La auditoría `inventario.solog_operaciones` muestra operaciones V4 completadas para:

- `cashier_v4:start`;
- `cashier_v4:save_batch`;
- `cashier_v4:recount_save_batch`;
- `cashier_v4:finish`.

No se observaron duplicaciones materiales ni `operation_id` repetidos de forma anómala.

Timeout, `SOLOG_OPERATION_IN_PROGRESS`, `SOLOG_IDEMPOTENCY_CONFLICT`, replay y reload quedaron cubiertos de forma controlada en tests/browser.

---

## 8. Limitaciones de evidencia conocidas

No existen limitaciones funcionales conocidas que bloqueen V4.

Persisten únicamente estas limitaciones de cobertura/evidencia:

1. El autocierre final post-14.2 fue validado mediante tests/browser controlado; no se volvió a esperar un `expira_at` natural contra Supabase tras las últimas correcciones.
2. Timeout, in-progress, conflict y replay se simularon; no se indujeron deliberadamente fallos de red reales contra Supabase.
3. El smoke humano/backend completo se concentró en Casuarinas.
4. Drafts locales, prepared operations, recovery tras reload y restricciones de descarte viven parcialmente en frontend y su evidencia principal es técnica/browser.

Existe evidencia real previa de:

```text
active
→ expiry
→ recovery
→ delivery tardío
→ finish
```

Estas limitaciones no bloquean el cierre.

---

## 9. Deuda técnica no bloqueante

Antes del próximo cambio backend debe consolidarse el historial local de migraciones:

```bash
supabase db pull solog_motor_cajero_v4 --local --yes
supabase migration list
```

Después debe congelarse el nuevo baseline antes de continuar con backend.

Esta deuda no afecta el funcionamiento actual del Cajero V4.

---

## 10. Legacy

El frontend vigente del Cajero utiliza V4.

No existen consumidores V3 activos en `src` ni en el bundle según la validación final.

Los registros históricos V3 almacenados en datos/auditoría permanecen como histórico y no se reinterpretan ni eliminan por este cierre.

---

## 11. Decisión de cierre

**Fase 14 — CERRADA.**

```text
Backend V4 desplegado y congelado
+ Frontend Cajero V4 implementado
+ Legacy frontend retirado
+ Smoke real validado
+ Autocierre/recovery endurecido
+ Smoke controlado completo
+ Revisión post-smoke Supabase limpia
= CUTOVER CAJERO V4 CERRADO
```

Baseline de cierre frontend:

`1115e1e909be1d54414675aa6f83f4f13cc1a7a2`

Cualquier cambio posterior debe tratarse como delta explícito sobre las fuentes congeladas o como nuevo bloque funcional si modifica Motor, lifecycle o contratos.

---

## 12. Siguiente bloque

El cierre de Fase 14 no autoriza automáticamente cambios en SOLOG Admin ni un nuevo cambio backend.

El siguiente trabajo debe iniciarse desde su propio alcance y preflight.
