# SOLOG — Incidencias comerciales ↔ Catálogo — Contrato de motor V1

**Estado:** CONGELADO — OBJETIVO / PENDIENTE DE IMPLEMENTACIÓN  
**Fecha de congelación:** 2026-09-21  
**Proyecto:** SOLOG  
**Nivel:** C — backend / lógica / integración  
**Ámbito:** incidencias comerciales automáticas ↔ Catálogo > Propuestas  
**Frontend afectado:** Admin > Catálogo / Admin > Productos  
**No modifica la superficie visible:** Admin > Incidencias

---

# 1. Propósito y autoridad

Este documento congela el comportamiento objetivo del motor que conecta las incidencias comerciales persistidas en `inventario.incidencias` con el ciclo de propuestas de Catálogo.

Su propósito es resolver de forma autoritativa:

- cuándo una incidencia comercial genera una propuesta automática;
- qué significa ignorar una propuesta automática;
- cómo se suprime y reactiva la evidencia exacta que la originó;
- la diferencia entre `ignorado` y `descartado`;
- la identidad de propuestas automáticas frente a propuestas administrativas;
- la aprobación atómica de propuestas que necesitan configuración o resolución;
- la conservación del historial sin reintroducir ruido en la UI.

## 1.1. Precedencia

Dentro de esta frontera específica, prevalece:

1. `SOLOG_Backend_Incidencias_Comerciales_Catalogo_Contrato_V1.md` — autoridad del motor comercial ↔ propuestas.
2. `SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md` — autoridad general de Catálogo, staging, preview y publicación.
3. `SOLOG_Backend_Incidencias_Contrato_Tecnico_V2.md` — autoridad de las incidencias operativas visibles en Admin > Incidencias.
4. `SOLOG_Backend_Contratos_Runtime_Actual_V1.md` — runtime compartido consolidado.

Hasta que este contrato sea implementado y validado, el runtime desplegado continúa siendo el descrito por los contratos actuales. Este documento congela el **estado objetivo** y no debe interpretarse como evidencia de despliegue.

---

# 2. Frontera funcional congelada

ConeXion continúa persistiendo incidencias comerciales y operativas en backend.

La frontera objetivo es:

```text
ConeXion / snapshot confirmado
        │
        ├─ incidencia comercial
        │      ↓
        │  motor Catálogo
        │      ↓
        │  Catálogo > Propuestas
        │
        └─ incidencia operativa
               ↓
          Admin > Incidencias
```

Las seis incidencias comerciales permanecen **deliberadamente fuera de Admin > Incidencias**:

```text
producto_nuevo
nombre_modificado
precio_modificado
codigo_barras_modificado
codigo_barras_agregado
codigo_barras_eliminado
```

Se mantienen fuera de esa superficie para evitar un paso humano redundante: cuando la evidencia es comercial, el candidato se deriva automáticamente y se administra en Catálogo > Propuestas.

Admin > Incidencias continúa gestionando las familias operativas definidas por su contrato V2.

---

# 3. Estados autoritativos de propuesta

El motor objetivo reconoce cinco estados persistentes:

```text
pendiente
aprobado
ignorado
descartado
incorporado
```

Semántica:

| Estado | Significado | Recuperable desde UI normal |
|---|---|---:|
| `pendiente` | requiere decisión o resolución | sí |
| `aprobado` | decisión resuelta y preparada para publicación, salvo bloqueos externos reales | sí |
| `ignorado` | evidencia automática aparcada y suprimida, recuperable explícitamente | sí |
| `descartado` | decisión cerrada de forma terminal | no |
| `incorporado` | cambio aplicado a una versión publicada | no |

## 3.1. `descartado` es backend-only

`descartado`:

- se conserva en `inventario.cambios_catalogo` o la autoridad histórica equivalente;
- conserva auditoría;
- no participa en preview ni publicación;
- no se devuelve en la consulta ordinaria de propuestas;
- no aparece en tabs ni counts normales;
- no se pagina ni se solicita rutinariamente desde frontend;
- solo queda disponible para diagnóstico, auditoría o consulta backend explícita.

No existe transición normal:

```text
descartado → reactivar
```

---

# 4. Identidad de evidencia automática

Una propuesta automática representa una **evidencia comercial exacta**, no solo un tipo y un SKU.

La identidad debe permanecer alineada con el `propuesta_fingerprint` del candidato.

Ejemplo:

```text
SKU 20500 · precio 10 → 11 = fingerprint A
SKU 20500 · precio 10 → 12 = fingerprint B
```

A y B son evidencias diferentes.

La supresión de A nunca debe impedir que B genere una propuesta.

## 4.1. Canonicalización

La canonicalización ya definida para fingerprints se conserva:

- valores numéricos equivalentes producen la misma identidad;
- cambios realmente diferentes producen fingerprints diferentes;
- el motor no debe usar `tipo + SKU` como única identidad de supresión para las incidencias comerciales.

La representación física de la supresión puede resolverse con tabla, columna o relación auxiliar durante implementación, pero la invariantes congelada es:

> La unidad mínima de supresión/reactivación comercial es la evidencia exacta equivalente al fingerprint de propuesta.

---

# 5. Generación de candidatos automáticos

`inventario.catalogo_candidatos()` o su reemplazo mantiene los mapeos:

```text
producto_nuevo            → agregar_producto
nombre_modificado         → nombre
precio_modificado         → precio
codigo_barras_modificado  → codigo
codigo_barras_agregado    → codigo
codigo_barras_eliminado   → codigo
```

No genera automáticamente propuestas desde:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

## 5.1. Regla de supresión obligatoria

Antes de emitir un candidato automático:

```text
evidencia comercial
      ↓
¿fingerprint exacto suprimido?
      ├─ sí → no emitir candidato
      └─ no → candidato permitido
```

Una evidencia suprimida no puede reaparecer como propuesta pendiente mientras esa supresión siga vigente.

---

# 6. Agregación multisede

Una misma evidencia puede detectarse en varias sedes y consolidarse en una sola propuesta automática.

Ejemplo:

```text
Cutervo ─┐
Huaca ───┼─ misma evidencia/fingerprint → propuesta A
Divino ──┘
```

`incidencia_origen_id` puede conservar una fila representativa, pero **no es autoridad suficiente para ignorar o reactivar**.

Las operaciones sobre la evidencia deben afectar todas las incidencias comerciales que correspondan exactamente al fingerprint de la propuesta dentro de la identidad consolidada.

---

# 7. Flujo de propuesta automática

Estado objetivo:

```text
incidencia comercial
        ↓
candidato automático
        ↓
     pendiente
      /     \
 aprobar   ignorar
    │         │
resolver      ▼
    │      ignorado
    ▼         │
 aprobado  reactivar
    │         │
    │         └────→ pendiente
    │
    ├─ withdraw → pendiente
    ├─ discard  → descartado
    └─ publish  → incorporado
```

---

# 8. Ignorar propuesta automática

`ignorar` significa:

> No atender esta evidencia ahora y mantenerla recuperable de forma explícita.

La operación debe ser atómica:

```text
propuesta automática → ignorado
+
toda evidencia exacta que genera ese fingerprint → suprimida recuperable
```

Obligaciones:

- no basta con cambiar `cambios_catalogo.estado`;
- la misma evidencia no puede regenerar otra propuesta pendiente;
- si varias sedes generan el mismo fingerprint, se suprimen todas las filas correspondientes;
- el staging dependiente se limpia;
- la auditoría registra propuesta, actor, fingerprint y evidencia afectada.

Toda transición a `ignorado` elimina:

```text
_setup
_price_resolution
```

---

# 9. Reactivar propuesta ignorada

`ignorado` es un estado deliberadamente recuperable.

La acción de reactivación debe realizar de forma coordinada:

```text
propuesta ignorada → pendiente
+
supresión exacta recuperable → revocada
```

No pasa automáticamente a `aprobado`.

Después de reactivarse, la propuesta vuelve al flujo normal de evaluación/resolución.

La UI normal solo ofrece reactivación a propuestas automáticas ignoradas.

---

# 10. Descartar propuesta

`descartar` significa:

> Cerrar definitivamente esta instancia de propuesta y retirarla del flujo operativo normal.

Transición:

```text
aprobado → descartado
```

La operación:

- elimina `_setup`;
- elimina `_price_resolution`;
- retira la propuesta de preview/publicación;
- conserva historial y auditoría;
- no ofrece reactivación.

## 10.1. Descarte de propuesta automática

Además de marcar la propuesta como `descartado`, la evidencia exacta asociada queda silenciada de forma terminal para esa identidad.

La misma evidencia/fingerprint no vuelve a generar una propuesta normal.

Una evidencia comercial distinta, con fingerprint distinto, sí puede originar una propuesta nueva.

## 10.2. Descarte de propuesta administrativa

No existe incidencia automática que suprimir.

La instancia queda terminalmente archivada. Si en el futuro el administrador decide ejecutar la misma intención comercial, se crea una **nueva instancia administrativa**.

---

# 11. Volver a pendiente

La transición vigente de retirada de aprobación se conserva con una semántica explícita:

```text
aprobado → pendiente
```

Significa:

> conservar la propuesta, pero volver a evaluarla antes de una decisión final.

Siempre limpia:

```text
_setup
_price_resolution
```

Es distinta de `descartar`:

```text
withdraw → pendiente y recuperable
discard  → descartado y terminal
```

---

# 12. Aprobación resuelta y atómica

El estado `aprobado` deja de significar “se aceptó pero todavía falta una decisión que el administrador podía resolver en ese mismo flujo”.

Para propuestas complejas:

```text
agregar_producto
reincorporar_producto
precio
```

la resolución debe completarse antes de confirmar `aprobado`.

Objetivo lógico:

```text
pendiente
   ↓ aprobar
abrir resolución
   ↓ guardar
validar + persistir resolución + aprobar
   ↓
aprobado
```

No debe existir una ventana autoritativa donde:

```text
estado = aprobado
pero falta _setup o _price_resolution requerido
```

por una interrupción entre dos mutaciones humanas.

La aprobación/resolución debe ser transaccional o tener una semántica backend equivalente que garantice atomicidad.

Tipos simples pueden aprobarse directamente cuando no requieren configuración adicional.

Los bloqueos externos reales siguen siendo válidos después de aprobación, por ejemplo evidencia posterior desactualizada, stock incompatible o cambios concurrentes de master data.

---

# 13. Propuestas administrativas

Las propuestas originadas por una decisión humana explícita —por ejemplo desde Admin > Productos— no comparten la identidad eterna de una evidencia automática.

Regla:

> Cada nueva intención humana posterior es una nueva instancia administrativa.

Ejemplo:

```text
Propuesta A · excluir SKU
↓
descartado

más adelante:
nueva acción humana
↓
Propuesta B · excluir SKU
```

A y B son instancias históricas diferentes.

## 13.1. Idempotencia

Un retry incierto de la **misma operación** no crea una instancia adicional.

`operation_id` o el mecanismo idempotente equivalente identifica la misma intención mientras se reintenta.

Una acción humana nueva, ejecutada posteriormente, debe poder crear una nueva instancia aunque una instancia anterior equivalente haya quedado `descartado`.

## 13.2. Ignorado no forma parte del flujo administrativo normal

Las propuestas administrativas nuevas no ofrecen:

```text
ignorar
reactivar ignorada
```

Su flujo normal es:

```text
nueva decisión
   ↓
resolver / confirmar
   ↓
aprobado
   ├─ withdraw → pendiente
   ├─ discard  → descartado
   └─ publish  → incorporado
```

Las filas administrativas `ignorado` existentes antes de este contrato pueden conservarse como historial legacy. No es obligatorio migrarlas a `descartado`.

---

# 14. Origen autoritativo de propuesta

El frontend no debe inferir de forma frágil el origen usando únicamente:

```text
cambio_id == null
```

porque una propuesta automática persistida también posee `cambio_id`.

El contrato objetivo debe exponer de manera autoritativa el origen lógico de cada propuesta ordinaria:

```text
automatico
administrativo
```

Puede implementarse como campo persistido o derivado, pero la lectura de Catálogo debe entregarlo de forma inequívoca.

Este origen gobierna al menos:

- disponibilidad de `Ignorar`;
- disponibilidad de `Reactivar`;
- semántica de `Descartar`;
- creación de nueva instancia administrativa.

---

# 15. Lecturas ordinarias de Catálogo

La superficie normal de propuestas conserva únicamente los estados visibles:

```text
pendiente
aprobado
ignorado
incorporado
```

`descartado`:

- no es un filtro normal;
- no entra en los counts normales;
- no se carga al abrir Catálogo;
- no se añade como tab.

Esto permite conservar auditoría sin aumentar egress ni ruido visual.

---

# 16. Publicación y preview

Solo las propuestas `aprobado` elegibles participan en preview/publicación.

Nunca participan:

```text
pendiente
ignorado
descartado
incorporado
```

La publicación continúa siendo autoridad de Catálogo V3 y mantiene:

- preview previo;
- idempotencia;
- validación de master data;
- generación de artefacto;
- commit;
- transición final a `incorporado`.

Este contrato no altera el formato del artefacto ConeXion salvo decisión posterior explícita.

---

# 17. Auditoría mínima

Las transiciones deben dejar trazabilidad suficiente para distinguir como mínimo:

```text
approve / resolve-and-approve
ignore
reactivate
withdraw
discard
publish
```

Cuando interviene evidencia automática, la auditoría debe permitir reconstruir:

- propuesta;
- actor;
- fingerprint;
- origen automático;
- incidencias/sedes afectadas por supresión o reactivación;
- timestamp.

Para propuestas administrativas debe distinguirse la instancia histórica, incluso cuando varias instancias representen la misma intención comercial en momentos diferentes.

---

# 18. Incidencias comerciales y Admin > Incidencias

Este contrato **no incorpora las seis incidencias comerciales a la UI Admin > Incidencias**.

No se agregan:

- tabs;
- filtros;
- acciones;
- counts;
- drawers de incidencias comerciales.

La administración humana de esas evidencias ocurre en:

```text
Admin > Catálogo > Propuestas
```

La supresión/reactivación definida aquí es interna al motor comercial y no debe confundirse con la UX de supresión temporal de incidencias operativas definida por Incidencias V2.

---

# 19. Compatibilidad con `producto_ausente → eliminar_producto`

`producto_ausente` sigue siendo una incidencia operativa.

No genera `eliminar_producto` automáticamente.

La propuesta de eliminación continúa requiriendo una acción humana explícita desde Incidencias según su contrato V2.

Una vez creada la propuesta, su ciclo posterior pertenece a Catálogo.

---

# 20. Reglas de implementación no negociables

La implementación debe preservar:

1. no reintroducir las seis incidencias comerciales en Admin > Incidencias;
2. no suprimir comercialmente por solo `tipo + SKU`;
3. no usar solo `incidencia_origen_id` para una propuesta multisede;
4. no devolver `descartado` en las lecturas/counts normales;
5. no permitir reactivar `descartado`;
6. no dejar staging al entrar en `ignorado` o `descartado`;
7. no dejar una propuesta compleja en `aprobado` si su resolución requerida no quedó persistida;
8. no reutilizar una instancia administrativa descartada como una nueva decisión humana;
9. conservar idempotencia de retries;
10. conservar historial y auditoría.

---

# 21. Superficie de transporte

## 21.1. Decisión de preflight congelada

La implementación utilizará **Catálogo V4** para las lecturas y mutaciones afectadas por este motor.

Motivo:

- la lectura añade información autoritativa de origen y puede mantenerse conceptualmente aditiva;
- la semántica de aprobación cambia de forma incompatible: una propuesta compleja ya no puede pasar a `aprobado` antes de persistir su resolución;
- el frontend V3 valida explícitamente `contract_version = 3` y hoy ejecuta `proposal_action: approve` antes de `prepare_product/prepare_price`;
- reutilizar V3 haría ambiguo el contrato desplegado y generaría una ventana de incompatibilidad.

Se congela:

```text
public.rpc_solog_admin_catalog_read_v4(...)
public.rpc_solog_admin_catalog_v4(...)
contract_version = 4
```

Catálogo V3 permanece intacto durante construcción y validación de V4. El frontend cambia a V4 solo cuando backend V4 esté desplegado y validado.

La publicación existente puede reutilizar la infraestructura actual de preview/artefacto/commit. Este bloque no modifica el formato `.prcatalog`.

## 21.2. Lecturas V4

Filtros visibles:

```text
pendiente
aprobado
ignorado
incorporado
```

`descartado` no forma parte de filtros ni counts ordinarios.

Cada propuesta expone autoritativamente:

```text
origen = automatico | administrativo
```

No se infiere el origen mediante `cambio_id == null`.

## 21.3. Mutaciones V4

```text
proposal_action:
  approve     → solo tipos simples
  ignore      → solo automática pendiente
  reactivate  → ignorado automático → pendiente
  withdraw    → aprobado → pendiente
  discard     → aprobado → descartado

resolve_product:
  pendiente agregar/reincorporar
  → validar configuración + guardar _setup + aprobar atómicamente

resolve_price:
  pendiente precio
  → validar resolución + guardar _price_resolution + aprobar atómicamente

prepare_product:
  actualizar _setup de una propuesta ya aprobada

prepare_price:
  actualizar _price_resolution de una propuesta ya aprobada

propose_product_state:
  nueva instancia administrativa explícita
  → exclusión simple aprobada
  → reincorporación exige configuración en la misma operación
```

Estos nombres de acción quedan congelados para V4.

## 21.4. Representación física congelada

### `inventario.cambios_catalogo`

Añadir:

```text
origen_propuesta text
  automatico | administrativo

descartado_por uuid | null
descartado_at  timestamptz | null
```

El check de `estado` admite `descartado`.

Backfill:

```text
datos._context.origen = conexion          → automatico
datos.origen = productos                  → administrativo
datos.origen = producto_ausente_manual    → administrativo
datos.origen = producto_ausente_propuesto → administrativo
```

Filas legacy fuera de esta superficie pueden conservar `origen_propuesta = null`.

### Supresión comercial exacta

Crear:

```text
inventario.catalogo_supresiones_evidencia
```

Campos mínimos:

```text
id
propuesta_fingerprint
cambio_id
modo = ignorado | descartado
creado_por
creado_at
revocado_por
revocado_at
```

Máximo una supresión activa por fingerprint. `descartado` no puede revocarse.

No se reutiliza `exclusiones_incidencias` de Incidencias V2.

### Identidad administrativa

Cada nueva acción humana genera una nueva instancia:

```text
sha256(
  catalog-admin |
  operation_id |
  c_interno |
  tipo
)
```

El mismo `operation_id` conserva idempotencia; una acción posterior con otro `operation_id` produce otra instancia.

## 21.5. Helper de evidencia comercial

Centralizar en un único helper SQL:

```text
incidencia comercial
→ tipo de propuesta
→ payload canónico
→ propuesta_fingerprint
```

Debe ser reutilizado por:

- `catalogo_candidatos()`;
- trigger de normalización/supresión;
- `ignore`;
- `reactivate`;
- `discard`.

No se duplica la lógica de fingerprint.

## 21.6. Compatibilidad de despliegue

Orden obligatorio:

```text
backend V4 desplegado            ✅
→ validación V4                  ✅
→ frontend cambia a V4           PENDIENTE — FASE 7
→ smoke                          PENDIENTE
→ V3 queda como compatibilidad temporal
```

No se modifica ni elimina V3 en este bloque.

---

# 22. Criterios de aceptación

El motor se considera implementado cuando, como mínimo:

1. ignorar una propuesta automática impide que la misma evidencia exacta vuelva a Pendientes;
2. evidencia diferente del mismo SKU/tipo puede generar una propuesta nueva;
3. una propuesta multisede ignora/reactiva todas las incidencias de la identidad exacta;
4. reactivar un ignorado devuelve propuesta + evidencia a evaluación;
5. descartar mueve a backend-only y desaparece de lecturas/counts normales;
6. una propuesta administrativa descartada puede ser seguida por una nueva instancia equivalente sin conflicto;
7. retries no duplican instancias;
8. agregar/reincorporar/precio no quedan aprobados sin su resolución requerida;
9. `withdraw` continúa devolviendo a Pendientes y limpia staging;
10. preview/publicación ignoran `ignorado` y `descartado`;
11. las seis incidencias comerciales continúan fuera de Admin > Incidencias;
12. auditoría permite reconstruir todas las transiciones relevantes.

---

# 23. Estado de implementación

A la fecha de congelación:

```text
Contrato funcional/backend objetivo → CONGELADO
Implementación backend              → COMPLETADA — FASES 2–6
Implementación frontend             → PENDIENTE — FASES 7–8
Migraciones Supabase                → 6 APLICADAS — FASES 2–6
RPC pública Catálogo V4             → DESPLEGADA / VALIDADA
Validación técnica                  → BACKEND V4 VALIDADO
Smoke humano                        → PENDIENTE — TRAS FRONTEND
```

No debe declararse este motor como desplegado hasta completar implementación y validación.
