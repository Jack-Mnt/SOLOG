# SOLOG — Backend Catálogo — Delta Valorizado y Máscaras V1

**Estado:** CONGELADO  
**Proyecto:** SOLOG  
**Módulo:** Catálogo ↔ Grupos  
**Prefijo:** Backend  
**Fecha:** 2026-09-11  

## 1. Naturaleza del documento

Este archivo es un **delta técnico** posterior al contrato congelado:

`SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md`

Solo reemplaza lo indicado aquí. Todo lo demás del contrato técnico de Catálogo V1 continúa vigente.

Motivo:

1. Grupos V1 define una misma configuración de valorizado reutilizable desde Catálogo y Grupos.
2. Grupos V1 permite máscaras operativas en `grupos_conteo.nombre`.
3. La publicación Catálogo V3 anterior normalizaba indiscriminadamente el nombre de todos los grupos `Único`, destruyendo máscaras personalizadas.

---

# 2. RPC pública de Catálogo

No cambia la superficie pública:

```sql
public.rpc_solog_admin_catalog_read_v3(p_action text,p_payload jsonb)
public.rpc_solog_admin_catalog_v3(p_action text,p_payload jsonb)
```

No cambia:

```text
contract_version = 3
```

No se crea una RPC adicional para valorizado.

---

# 3. `prepare_price` — valorizado por paquete

La acción sigue siendo:

```text
rpc_solog_admin_catalog_v3('prepare_price', payload)
```

La decisión de valorizado se guarda en staging dentro de:

```text
cambios_catalogo.datos._price_resolution
```

y no modifica el master hasta publicación.

## `package_action`

Valores soportados:

```text
keep
update
set
clear
not_applicable
```

### `keep`

Conserva:

```text
unidades_por_paquete
precio_paquete
```

sin cambios.

### `update`

Compatibilidad legacy.

Solo actualiza `precio_paquete` de una valorización xN ya existente.

Requiere que el grupo ya tenga:

```text
unidades_por_paquete > 1
```

### `set`

Define o reemplaza completamente:

```text
unidades_por_paquete
precio_paquete
```

Payload:

```json
{
  "package_action": "set",
  "unidades_por_paquete": 6,
  "precio_paquete": 27.00
}
```

Validación:

```text
unidades_por_paquete > 1
precio_paquete > 0
```

### `clear`

Elimina la valorización al publicar:

```text
unidades_por_paquete = NULL
precio_paquete = NULL
```

### `not_applicable`

Se mantiene por compatibilidad y para separaciones sin valorizado.

No puede utilizarse para ignorar silenciosamente una valorización existente que requiera decisión.

---

# 4. Resoluciones de precio

Se mantienen:

```text
keep_structure
update_group_price
separate_sku
```

## `keep_structure`

Para grupo unitario.

Puede combinarse con:

```text
keep
update
set
clear
```

## `update_group_price`

Actualiza el precio unitario del grupo y de todos sus integrantes.

Puede combinarse con:

```text
keep
update
set
clear
```

## `separate_sku`

Crea/prepara un grupo unitario nuevo para el SKU separado.

Valorizado admitido:

```text
set
clear
not_applicable
```

No admite `keep` ni `update` porque la nueva unidad no debe heredar implícitamente la valorización del grupo origen.

---

# 5. Aplicación atómica en publicación

`catalogo_preparar_publicacion_v3` proyecta la valorización resultante junto con:

- precio comercial;
- estructura;
- altas/reincorporaciones;
- exclusiones/eliminaciones;
- resto del lote aprobado.

La publicación aplica el resultado de forma atómica mediante el flujo ConeXion Admin existente.

No existe una escritura inmediata de valorizado desde Catálogo.

---

# 6. Máscaras operativas

Se congela la separación:

```text
catalogo.producto → nombre comercial
grupos_conteo.nombre → nombre/máscara operativa
```

La publicación Catálogo no puede sobrescribir una máscara personalizada por el mero hecho de que el grupo sea `Único`.

---

## 6.1 Grupo Único ya existente

Si antes de la publicación:

```text
grupo.nombre == producto anterior
```

se considera que el grupo seguía usando el nombre automático.

Si Catálogo cambia el producto:

```text
grupo.nombre → nuevo nombre comercial
```

Si antes de la publicación:

```text
grupo.nombre != producto anterior
```

se considera máscara personalizada y se preserva.

---

## 6.2 Grupo que pasa de Agrupado a Único

Debe normalizarse al nombre comercial del SKU restante.

Si ya existe una identidad de grupo con ese nombre:

- activa → conflicto;
- inactiva y vacía → puede reactivarse/reutilizarse;
- la identidad agrupada reemplazada queda inactiva.

Al reutilizar una identidad inactiva:

- el valorizado histórico se conserva solo si categoría y precio siguen siendo compatibles;
- de lo contrario se limpia.

---

## 6.3 Grupo unitario nuevo

Su nombre inicial es el nombre comercial del SKU.

Una máscara personalizada puede configurarse posteriormente desde Grupos.

---

# 7. Conflictos nuevos/relevantes

La preview puede devolver:

```text
GROUP_NAME_CONFLICT
INVALID_PACKAGE_CONFIGURATION
INVALID_PACKAGE_PRICE
PACKAGE_PRICE_DECISION_REQUIRED
```

Estos conflictos bloquean publicación.

---

# 8. Compatibilidad

El delta mantiene compatibilidad con clientes anteriores:

- `package_action=update` continúa soportado;
- `not_applicable` continúa soportado donde corresponde;
- nombres de RPC y `contract_version=3` no cambian.

El frontend nuevo puede utilizar `set` y `clear` para implementar el modal compartido de **Configuración de valorizado**.

---

# 9. Migrations desplegadas

En `fvtohxvcvsflzmftgfzs`:

```text
20260911122122_solog_catalog_price_valuation_prepare_v1
20260911122330_solog_catalog_price_valuation_preview_v1
20260911122421_solog_catalog_preserve_group_masks_v1
```

---

# 10. Validación

Pruebas sintéticas con rollback aprobadas:

- Único sin xN → `set`;
- Único con xN → `clear`;
- agrupado → `update_group_price + set`;
- agrupado → `separate_sku + set`;
- máscara personalizada preservada;
- nombre automático sincronizado ante cambio comercial;
- grupo que queda singleton reutiliza grupo unitario histórico inactivo;
- publicación Catálogo sintética completa:
  - cambio de precio;
  - valorizado xN;
  - preservación de máscara;
  - incorporación del cambio;
  - creación temporal de V7;
  - todo dentro de transacción con `ROLLBACK`.

No se publicó V7 real ni quedaron cambios aprobados de prueba.
