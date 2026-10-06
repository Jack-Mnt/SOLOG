# SOLOG — Backend ConeXion — Snapshot resuelto V1

**Estado:** CONGELADO — DESPLEGADO Y VALIDADO — BLOQUE CERRADO  
**Proyecto:** SOLOG / ConeXion  
**Clasificación:** Nivel C — Backend / Integración / Contrato  
**Fecha de cierre:** 2026-10-05  
**Fuente primaria de este bloque:** este documento.

## 1. Propósito

Congelar el contrato backend resultante después de trasladar a ConeXion la responsabilidad de impedir el envío de archivos cuyo stock no pueda resolverse de forma determinista.

El objetivo es que un snapshot aceptado y confirmado por Supabase nunca represente stock indeterminado por errores operativos del Excel.

## 2. Prevalencia documental

Este documento prevalece, exclusivamente para la semántica de snapshots resueltos, sobre las reglas incompatibles de:

- `Contrato_backend_ConeXion.md`;
- `SOLOG_Integracion_ConeXion_Supabase_Contrato_V2.md`;
- cualquier documento histórico que permita persistir `codigo_interno_duplicado` o `stock_invalido` como `snapshot_stock.stock = NULL`.

Los contratos anteriores continúan vigentes para todo lo que este documento no reemplace.

## 3. Responsabilidades congeladas

### ConeXion

ConeXion valida el Excel antes de sincronizar.

Si detecta una condición que impida resolver el stock de un SKU esperado, no envía snapshot. En particular:

- `codigo_interno_duplicado` → bloqueante local;
- `stock_invalido` → bloqueante local.

El usuario puede corregir el Excel y cargar otro archivo inmediatamente porque no se creó un snapshot remoto ni se consumió la ventana de dos horas.

### Supabase

Supabase sigue siendo una defensa contractual y transaccional.

Un payload con stock no resoluble se rechaza de forma atómica con:

`UNRESOLVABLE_STOCK_NOT_ALLOWED`

No se persiste `inventario.snapshots`, `snapshot_stock`, `stock_actual` ni incidencias derivadas de ese intento.

### SOLOG

SOLOG consume snapshots con stock resuelto.

La defensa de completitud estructural se conserva: un grupo puede requerir un snapshot completo cuando el snapshot disponible no contiene alguno de los integrantes que el catálogo/grupo operativo actual exige.

Por tanto, `SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE` continúa siendo una salvaguarda válida para incompatibilidades estructurales, no para errores normales del Excel que ConeXion ya bloquea.

## 4. Contrato de sincronización vigente

Se conservan:

- `contract_version = 2`;
- `public.rpc_conexion_sync_snapshot` como RPC pública consumida por `conexion-sync`;
- `public.rpc_conexion_sync_snapshot_strict_v2` como validador/persistidor interno estricto;
- forma general del payload V2;
- idempotencia;
- lock por sede;
- orden temporal;
- ventana mínima de dos horas;
- validación de catálogo, resumen, arrays e incidencias.

Flujo desplegado:

```text
ConeXion
→ Edge Function conexion-sync
→ public.rpc_conexion_sync_snapshot
→ normalización de incidencias
→ public.rpc_conexion_sync_snapshot_strict_v2
→ persistencia atómica
→ inventario.solog_evaluar_snapshot
→ SOLOG
```

## 5. `eliminados[]`

`eliminados[]` representa exclusivamente:

`producto_ausente`

Ya no son valores válidos:

- `codigo_interno_duplicado`;
- `stock_invalido`.

Debe existir correspondencia estricta:

```text
eliminados[c_interno, motivo=producto_ausente]
↔
incidencia tipo=producto_ausente del mismo c_interno
```

## 6. Invariante de `inventario.snapshot_stock`

`stock` es `NOT NULL`.

Estados válidos:

### `observado`

- `stock`: entero determinado;
- `producto_eliminado = false`.

### `producto_ausente`

- `stock = 0`;
- `producto_eliminado = true`.

No son representables:

- `stock = NULL`;
- `estado_observacion = codigo_interno_duplicado`;
- `estado_observacion = stock_invalido`.

Invariante congelada:

> Todo SKU materializado en un snapshot confirmado tiene stock determinado.

## 7. Reconstrucción del snapshot

Para cada SKU incluido en la versión del catálogo:

```text
si aparece en stock[]
→ stock = valor recibido
→ estado_observacion = observado
→ producto_eliminado = false

si aparece en eliminados[] como producto_ausente
→ stock = 0
→ estado_observacion = producto_ausente
→ producto_eliminado = true

si no aparece en stock[] ni eliminados[]
→ stock = 0
→ estado_observacion = observado
→ producto_eliminado = false
```

`codigo_interno_duplicado` y `stock_invalido` nunca llegan a esta construcción.

## 8. Consumidores SOLOG simplificados

### `inventario.solog_stock_grupo_snapshot`

Semántica vigente:

```text
grupo sin miembros → 0
falta un miembro del grupo en snapshot_stock → NULL
todos los miembros presentes → SUM(stock)
```

Ya no inspecciona estados de observación de stock irresoluble.

### `inventario.solog_aplicar_snapshot_v4`

Un grupo se considera incompleto únicamente cuando falta un miembro esperado en `snapshot_stock`.

Ya no existe lógica específica para `codigo_interno_duplicado` o `stock_invalido`.

### `inventario.solog_resolve_operational_incidents_on_snapshot_v1`

La resolución automática operativa conserva:

- `producto_ausente`;
- `codigo_interno_invalido`.

Ya no administra futuras incidencias remotas de:

- `codigo_interno_duplicado`;
- `stock_invalido`.

## 9. Ventana de snapshots

No cambia.

Después de aceptar un snapshot válido se mantienen:

- `SNAPSHOT_INTERVAL_TOO_SHORT`;
- `SNAPSHOT_WINDOW_NOT_OPEN`;
- intervalo mínimo de dos horas.

Como ConeXion no sincroniza un archivo irresoluble, corregir un error local antes del envío no consume esta ventana.

## 10. Seguridad

Estado validado:

- `conexion-sync` desplegada con `verify_jwt = false` y credenciales propias de instalación;
- la Edge Function utiliza `SERVICE_ROLE` únicamente del lado servidor;
- `public.rpc_conexion_sync_snapshot` es `SECURITY DEFINER` y ejecutable por `service_role`;
- `public.rpc_conexion_sync_snapshot_strict_v2` no está expuesta a `anon`, `authenticated` ni `service_role`; es invocada internamente por el wrapper;
- tablas privadas relevantes de `inventario` mantienen RLS activo;
- no se concedió acceso directo de ConeXion a tablas privadas.

Los avisos globales del advisor sobre tablas `inventario.*` con RLS sin políticas son compatibles con esta arquitectura RPC-only. Otros avisos de seguridad/performance existentes pertenecen a superficies no modificadas por este bloque.

## 11. Saneamiento realizado

Se eliminó el único snapshot de prueba que todavía contenía stock indeterminado:

`5ebe6e81-e194-4e29-a238-db61e9500f69`

Antes de eliminarlo se verificó que no era referencia de conteos, detalles, runtime, `estado_stock_grupo` ni `stock_actual`.

Después del saneamiento:

- `snapshot_stock.stock IS NULL = 0`;
- incidencias remotas `codigo_interno_duplicado/stock_invalido = 0`.

## 12. Migraciones remotas de este bloque

```text
20261005224229  conexion_snapshot_strict_v2_resolved_stock_contract_v1
20261005225100  snapshot_stock_resolved_stock_invariant_v1
20261006030100  solog_snapshot_consumers_resolved_stock_v1
20261006030607  fix_conexion_snapshot_producto_eliminado_boolean_v1
```

La última migración corrige `producto_eliminado` para productos observados mediante `coalesce(..., false)`.

## 13. Evidencia de validación

Validación transaccional con rollback:

- snapshot válido V2 → `OK`;
- 970 filas reconstruidas;
- 100/100 `producto_ausente` → stock 0 y `producto_eliminado=true`;
- cero stock NULL;
- cero estados de observación inválidos;
- 488 grupos activos consumibles por SOLOG;
- cero grupos incompletos en snapshot completo;
- cero `requiere_snapshot_completo` para el snapshot completo de prueba;
- `codigo_interno_duplicado` → `UNRESOLVABLE_STOCK_NOT_ALLOWED`, sin persistencia;
- `stock_invalido` → `UNRESOLVABLE_STOCK_NOT_ALLOWED`, sin persistencia;
- intervalo mínimo de dos horas preservado;
- ventana de servidor de dos horas preservada;
- al retirar temporalmente un miembro del snapshot, `solog_stock_grupo_snapshot` devuelve `NULL`;
- el wrapper público `rpc_conexion_sync_snapshot` fue probado tanto con snapshot válido como con payload bloqueante.

Las pruebas temporales se ejecutaron dentro de transacciones revertidas y no dejaron sedes, instalaciones ni snapshots de prueba.

## 14. Hallazgo no bloqueante

`public.rpc_solog_admin_incidents_v2` todavía contiene filtros históricos para `codigo_interno_duplicado` y `stock_invalido`.

No afecta el nuevo contrato porque:

- no quedan incidencias de esos tipos;
- ConeXion ya no las sincroniza;
- Supabase las rechaza defensivamente.

Su limpieza se considera refactor administrativo independiente y no forma parte de este bloque.

## 15. Deuda técnica conocida

La historia de migraciones remotas de Supabase está por delante de los archivos de migración disponibles localmente en el repositorio.

Este bloque no reconcilia esa deuda. Las migraciones remotas listadas en la sección 12 son el estado desplegado autoritativo hasta realizar un bloque específico de reconciliación.

## 16. Cierre

El contrato operativo queda:

```text
ConeXion
= impedir que un archivo con stock irresoluble sea sincronizado

Supabase
= validar defensivamente, persistir atómicamente y garantizar stock resuelto

SOLOG
= consumir snapshots resueltos y conservar defensa de completitud estructural
```

No existe bloqueo conocido para continuar el desarrollo sobre este baseline.

**BLOQUE CERRADO.**
