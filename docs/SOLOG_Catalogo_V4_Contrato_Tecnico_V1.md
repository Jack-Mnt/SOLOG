# SOLOG — Catálogo V4 — Contrato técnico V1

**Estado:** VIGENTE / IMPLEMENTADO  
**Proyecto:** SOLOG  
**Módulo:** Admin > Catálogo / Admin > Productos  
**Clasificación:** Nivel C — backend / lógica / integración + frontend  
**Contrato de API:** `contract_version = 4`  
**Rama de implementación:** `admin-work`  
**Última consolidación:** 2026-09-22

---

# 1. Autoridad

Este documento es la **única fuente contractual vigente de Catálogo V4** dentro del repositorio.

Prevalece para:

- estados y transiciones de propuestas;
- origen automático/administrativo;
- incidencias comerciales ↔ propuestas;
- aprobación atómica;
- resolución de precio;
- valorizado por paquete durante Catálogo;
- preview/publicación;
- contrato frontend ↔ RPC V4;
- comportamiento de Admin > Productos relacionado con Catálogo.

Fuentes funcionales/arquitectónicas generales pueden complementar este documento, pero no redefinir sus estados, payloads, transiciones o semántica de publicación.

Las superficies V3 que todavía existan físicamente en backend son **legacy pendiente de una limpieza backend independiente**. No son contrato de frontend, no deben usarse para nuevas implementaciones y no justifican mantener tipos, páginas, tests o documentación V3.

---

# 2. Superficie pública V4

Frontend activo:

```text
src/features/solog/admin/catalogo/admin.catalogo.v4.ts
src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx
src/features/solog/admin/catalogo/admin.catalogo.store.ts
```

RPC públicas:

```sql
public.rpc_solog_admin_catalog_read_v4(
  p_action text,
  p_payload jsonb
)

public.rpc_solog_admin_catalog_v4(
  p_action text,
  p_payload jsonb
)
```

Contrato:

```text
contract_version = 4
```

Toda lectura/mutación V4 conserva:

- autenticación;
- autorización Admin/Moderador según operación;
- revisiones `catalog/groups`;
- idempotencia mediante `operation_id`;
- rechazo de revisiones obsoletas;
- retry seguro de operaciones inciertas.

---

# 3. Estados autoritativos

Estados persistentes:

```text
pendiente
aprobado
ignorado
descartado
incorporado
```

Superficie ordinaria de frontend:

```text
Pendientes
Aprobados
Ignorados
Publicados
```

`descartado` es backend-only:

- no tiene tab;
- no entra en counts normales;
- no participa en preview;
- no participa en publicación;
- no se reactiva.

---

# 4. Origen autoritativo

Cada propuesta ordinaria expone:

```text
origen = automatico | administrativo
```

El frontend no infiere origen usando `cambio_id`.

El origen gobierna qué transiciones son válidas.

---

# 5. Incidencias comerciales automáticas

Las seis familias comerciales permanecen fuera de Admin > Incidencias:

```text
producto_nuevo
nombre_modificado
precio_modificado
codigo_barras_modificado
codigo_barras_agregado
codigo_barras_eliminado
```

Mapeo a Catálogo:

```text
producto_nuevo            → agregar_producto
nombre_modificado         → nombre
precio_modificado         → precio
codigo_barras_modificado  → codigo
codigo_barras_agregado    → codigo
codigo_barras_eliminado   → codigo
```

No generan automáticamente propuesta:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

`producto_ausente → eliminar_producto` continúa requiriendo acción humana explícita desde Admin > Incidencias.

---

# 6. Identidad y supresión de evidencia automática

Una propuesta automática representa una evidencia comercial exacta mediante su `propuesta_fingerprint`.

Ejemplo:

```text
SKU 20500 · 10 → 11 = fingerprint A
SKU 20500 · 10 → 12 = fingerprint B
```

A y B son evidencias distintas.

La supresión se aplica por fingerprint exacto, no solamente por `tipo + SKU`.

Una misma evidencia detectada en varias sedes se consolida lógicamente en una propuesta y las operaciones de ignorar/reactivar afectan todas las incidencias equivalentes de esa identidad.

---

# 7. Flujo de propuestas automáticas

## 7.1 Pendiente

```text
Pendiente
├─ Aprobar / Resolver
└─ Ignorar
```

## 7.2 Aprobado

```text
Aprobado
├─ Volver a pendiente
├─ Ignorar
└─ Publicar → Incorporado
```

## 7.3 Ignorado

```text
Ignorado
└─ Reactivar → Pendiente
```

## 7.4 Restricción terminal

Una propuesta automática **no puede descartarse**.

```text
automatico + discard → inválido
```

Si una evidencia automática no debe seguir generando ruido, la decisión correcta es `ignorar`.

---

# 8. Ignorar y reactivar

Ignorar una automática pendiente o aprobada realiza coordinadamente:

```text
propuesta → ignorado
evidencia exacta → supresión recuperable
```

Además:

- limpia `_setup`;
- limpia `_price_resolution`;
- impide que el mismo fingerprint reaparezca como candidato;
- conserva auditoría.

Reactivar:

```text
ignorado → pendiente
supresión recuperable → revocada
```

No aprueba automáticamente.

---

# 9. Propuestas administrativas

Una acción humana explícita genera una propuesta de origen:

```text
administrativo
```

Cada nueva intención humana posterior es una nueva instancia.

Idempotencia de una misma operación:

```text
mismo operation_id → misma intención/retry
```

Nueva intención posterior:

```text
nuevo operation_id → nueva instancia
```

aunque exista una instancia administrativa previa descartada.

Flujo administrativo:

```text
Aprobado
├─ Volver a pendiente
├─ Descartar → backend-only terminal
└─ Publicar → Incorporado
```

Las propuestas administrativas no usan Ignorar/Reactivar.

---

# 10. Aprobación atómica

Tipos simples que no requieren configuración adicional pueden aprobarse directamente.

Tipos complejos:

```text
agregar_producto
reincorporar_producto
precio
```

deben resolver su decisión antes de quedar `aprobado`.

No es válido:

```text
estado = aprobado
+
configuración requerida ausente
```

Mutaciones:

```text
resolve_product
resolve_price
```

realizan validación + persistencia de resolución + aprobación dentro de una operación autoritativa.

`prepare_product` / `prepare_price` se conservan para modificar posteriormente una resolución ya aprobada.

---

# 11. Productos administrativos

## 11.1 Exclusión

```text
Producto incluido
→ confirmar exclusión
→ propuesta administrativa aprobada
→ publicación posterior aplica el cambio comercial
```

## 11.2 Reincorporación

```text
Producto excluido
→ configurar reincorporación
→ validar destino
→ aprobar atómicamente
```

No existe una ventana en la que una reincorporación nueva quede aprobada sin configuración.

---

# 12. Resolución de precio

Resoluciones soportadas:

```text
keep_structure
update_group_price
separate_sku
```

## 12.1 keep_structure

Se utiliza cuando la estructura del grupo se conserva.

## 12.2 update_group_price

La decisión afecta al grupo existente y a todos sus integrantes comerciales en la publicación.

Antes de resolver se inspeccionan otras propuestas automáticas pendientes de precio pertenecientes al mismo grupo.

### Equivalentes

Si tienen el mismo precio objetivo:

```text
A 10 → 12
B 10 → 12
C 10 → 12
```

resolver una con `update_group_price`:

```text
→ A/B/C reciben resolución equivalente
→ A/B/C quedan aprobadas
→ se publican juntas
```

La UI informa cuántas propuestas equivalentes serán resueltas.

### Incompatibles

Si existe al menos un precio objetivo diferente:

```text
A 10 → 12
B 10 → 12
C 10 → 13
```

`update_group_price` se bloquea.

Código autoritativo:

```text
SOLOG_GROUP_PRICE_PROPOSAL_CONFLICT
```

La UI muestra los productos/precios incompatibles.

No se absorben automáticamente:

- propuestas ignoradas;
- propuestas incorporadas;
- propuestas administrativas.

## 12.3 separate_sku

Es una resolución individual.

Las demás propuestas del grupo permanecen en su estado actual.

---

# 13. Valorizado por paquete

Campos:

```text
unidades_por_paquete
precio_paquete
```

Acciones soportadas:

```text
keep
set
update
clear
not_applicable
```

## 13.1 Grupo existente

Para `update_group_price` o `keep_structure`, el valorizado se aplica **inmediatamente** al master data al confirmar la resolución/preparación.

```text
keep   → no modificar
set    → actualizar unidades + precio paquete
update → actualizar precio paquete
clear  → eliminar valorizado
```

La escritura ocurre en la misma transacción lógica que la resolución/preparación de precio.

Después de aplicar inmediatamente el valorizado, el staging destinado a publicación queda normalizado para no sobrescribirlo con una copia antigua.

`withdraw` no revierte automáticamente un valorizado ya aplicado al master data.

## 13.2 Nuevo grupo por separate_sku

El grupo todavía no existe, por lo que su valorizado permanece en staging y se materializa durante publicación.

Admite:

```text
set
clear
not_applicable
```

No hereda implícitamente el valorizado del grupo origen.

---

# 14. Precio sugerido de valorizado

Al seleccionar x6/x10/x12/x20 o cambiar el número de unidades:

```text
precio sugerido = unidades × nuevo precio unitario
```

Cambiar unidades siempre recalcula el sugerido.

Una edición manual del precio permanece mientras el usuario no vuelva a cambiar el número de unidades.

En el subdiálogo de valorizado, `Aplicar` completa directamente `resolve_price` o `prepare_price`. No exige un segundo guardado en el diálogo padre.

---

# 15. Máscaras operativas de grupos

Se mantiene la separación:

```text
catalogo.producto     → nombre comercial
grupos_conteo.nombre → nombre/máscara operativa
```

La publicación no sobrescribe una máscara personalizada solo porque el grupo sea `Único`.

## 15.1 Único existente

Si antes del cambio:

```text
grupo.nombre == producto anterior
```

el nombre se considera automático y puede sincronizarse al nuevo nombre comercial.

Si:

```text
grupo.nombre != producto anterior
```

se considera máscara personalizada y se preserva.

## 15.2 Agrupado → Único

Debe normalizarse al nombre comercial del SKU restante cuando corresponda.

Una identidad activa incompatible produce conflicto.

Una identidad inactiva y vacía puede reutilizarse si sigue siendo compatible.

## 15.3 Único nuevo

El nombre inicial es el nombre comercial del SKU. Una máscara personalizada puede configurarse después desde Grupos.

---

# 16. Lecturas V4

Acciones:

```text
status
reference
proposals
products
price_options
publication_preview
```

Las lecturas operativas principales son conjuntos completos bajo el límite contractual vigente; no se introduce paginación remota silenciosa.

`proposals` devuelve origen autoritativo y counts para:

```text
pendiente
aprobado
ignorado
incorporado
```

`price_options` incluye:

- grupo;
- integrantes;
- precio objetivo;
- opciones de resolución;
- estado de valorizado;
- resolución preparada;
- propuestas equivalentes del grupo;
- propuestas incompatibles del grupo.

---

# 17. Mutaciones V4

```text
proposal_action:
  approve     → tipos simples
  ignore      → automática pendiente/aprobada
  reactivate  → automática ignorada → pendiente
  withdraw    → aprobada → pendiente
  discard     → solo administrativa aprobada → descartado

resolve_product
resolve_price
prepare_product
prepare_price
propose_product_state
```

Una automática no puede ejecutar `discard`.

Una administrativa no utiliza `ignore` ni `reactivate`.

---

# 18. Preview y publicación

Solo participan propuestas `aprobado` elegibles.

Nunca participan:

```text
pendiente
ignorado
descartado
incorporado
```

La publicación conserva:

- preview previo;
- validación de master data;
- idempotencia;
- artefacto;
- commit de versión;
- transición final a `incorporado`.

El formato compartido con ConeXion continúa bajo su propio contrato; Catálogo V4 no redefine esa API externa.

---

# 19. Feedback de publicación

Si la publicación devuelve:

```text
completion_recorded = true
```

ese resultado domina la UI.

La superficie muestra:

```text
Catálogo publicado · versión N
```

y no mezcla simultáneamente errores del preview recargado.

Si posteriormente:

```text
NO_APPROVED_CATALOG_CHANGES
```

se representa como estado informativo:

```text
No hay cambios aprobados para publicar.
```

sin acción de reintento.

`Reintentar/Recuperar` se reserva a fallos reales o resultados inciertos.

---

# 20. Auditoría e historial

Debe poder reconstruirse:

- actor;
- timestamp;
- propuesta;
- fingerprint;
- origen;
- approve / resolve-and-approve;
- ignore;
- reactivate;
- withdraw;
- discard administrativo;
- publish;
- evidencia/sedes suprimidas o reactivadas cuando aplique.

`descartado` conserva historial aunque no aparezca en la UI ordinaria.

---

# 21. Compatibilidad externa

Catálogo V4 no redefine el contrato compartido ConeXion ↔ Supabase.

El catálogo compartido conserva su `schema_version` vigente y la publicación sigue produciendo el artefacto esperado por ConeXion.

Las funciones internas con sufijos históricos pueden permanecer temporalmente hasta una limpieza backend posterior. El nombre interno de una función legacy **no altera este contrato V4**.

---

# 22. Legacy V3 pendiente de limpieza backend

El frontend V3, su contrato TypeScript y sus tests contractuales fueron retirados.

No existe soporte de frontend para:

```text
contract_version = 3
```

Si todavía existen RPC o helpers V3 en Supabase:

- no son contrato vigente;
- no deben consumirse desde frontend;
- no deben documentarse como alternativa compatible;
- su eliminación/refactor se realizará en un bloque backend separado.

Este contrato no autoriza esa limpieza backend en la pasada actual.

---

# 23. Validación y estado actual

Smoke funcional:

```text
Fase 10 / re-smoke → APROBADO
```

Se validó humanamente:

- resolución atómica;
- valorizado inmediato;
- presets de xN;
- Ignorar/Reactivar automáticas;
- Descartar administrativas;
- publicación sin notices contradictorias;
- resolución grupal de propuestas equivalentes.

La validación técnica debe volver a ejecutarse después de la limpieza frontend/documental:

```powershell
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

El bloque se cierra únicamente cuando esa revalidación pase sin errores.
