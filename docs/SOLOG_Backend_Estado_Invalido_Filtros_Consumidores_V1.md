# SOLOG — Contrato backend: exclusión de conteos inválidos V1

**Proyecto:** SOLOG  
**Clasificación:** Nivel C — contrato de consultas backend  
**Estado:** CONGELADO para implementación; NO desplegado ni validado  
**Rama de documentación:** `admin-work` (nunca modificar `master` por este contrato)  
**Fuente primaria única del Bloque C:** este documento. En caso de contradicción dentro del alcance C, prevalece sobre informes exploratorios y propuestas anteriores. La documentación del Motor V4 y Detalles V2 permanece vigente en todo lo que este documento no sustituya.

## 1. Decisiones aprobadas

- `Inválido` se considera terminal **en el comportamiento actualmente implementado**, pero **no** se agregan triggers, restricciones ni bloqueos para impedir futuras transiciones intencionales.
- No agregar trazabilidad, motivo, auditorías, cambios al estado guardado, migraciones de datos ni modificaciones a las funciones que generan invalidaciones.
- `Inválido` no se muestra en ninguna lista o detalle operativo visible al usuario.
- Conservar filas, valores históricos, estados originales y permisos de acceso en base de datos; solo ajustar las respuestas de consulta pertinentes.
- No cambiar UX, Motor de conteos, priorización, snapshots, valorización, paginación contratada ni exportaciones válidas.

## 2. Baseline de contratos verificado en Supabase

Proyecto operativo: `fvtohxvcvsflzmftgfzs` (`PuertoRicoOnline`). Preflight solo lectura.

| Función | Firma desplegada | Acción |
|---|---|---|
| `public.rpc_solog_details_v2` | `(p_action text, p_payload jsonb) returns jsonb` | C.1 |
| `public.rpc_solog_cashier_history_v2` | `(p_payload jsonb) returns jsonb` | C.2 |
| `inventario.solog_control_groups_v10` | `(p_uid uuid, p_site uuid, p_generated timestamptz, p_payload jsonb) returns jsonb` | C.3: validar, ya filtra |
| `inventario.solog_daily_detail_bootstrap_v1` | misma firma de 4 argumentos, `returns jsonb` | C.3: validar, ya filtra |
| `inventario.solog_daily_detail_page_v1` | misma firma de 4 argumentos, `returns jsonb` | C.3: validar allowlist |
| `public.rpc_solog_control_export_v2` | `(p_payload jsonb) returns jsonb` | C.3: validar, resultados por estado |

Todas las funciones listadas son SECURITY DEFINER. Preservar SECURITY DEFINER, `search_path`, ownership, permisos/grants, control de sede/usuario/dispositivo, códigos de error y estructura de respuesta.

## 3. Fase C.1 — Detalles V2

Modificar solo las ramas `history`, `detail` y `chronology` dentro de `public.rpc_solog_details_v2`:

**Historial:**
- Aplicar `AND cd.estado_diferencia <> 'Inválido'` en el origen SQL de la página, antes de `ORDER BY`, `LIMIT`, cálculo de cursor y agregación.
- Mantener exactamente filtros de sede, fecha (`today`/`yesterday`), sort `contado_at DESC, id DESC`, límite `page_size`, `next_cursor`, formato JSON, revisiones y errores.
- Nunca filtrar un array JSON después de paginar: puede crear páginas artificialmente vacías y cursores incorrectos.

**Detalle por ID:**
- Añadir `AND cd.estado_diferencia <> 'Inválido'` a la selección del `case_id`, junto a la autorización por sede.
- Un `case_id` inválido debe devolver exactamente el error existente `SOLOG_CASE_NOT_FOUND`, igual que un caso no visible/no encontrado; no crear nueva vía de enumeración.

**Cronología:**
- La selección por grupo de la rama `detail` debe excluir filas inválidas **antes** de construir `chronology`.
- Mantener orden, límite 100, nombres, campos y formato.
- No ocultar ni alterar filas de otros estados.

**Exportación Detalles:**
- Mantener sin cambios: la lista elegible ya es `('Confirmada','Inconsistente')`.

## 4. Fase C.2 — Historial Cajero

En `public.rpc_solog_cashier_history_v2`:
- Aplicar `AND cd.estado_diferencia <> 'Inválido'` al SELECT sobre `inventario.conteo_detalle`, preservando `c.sede_id=v_sede AND c.usuario_id=v_uid` y periodo.
- Conservar intactos `contract_version=2`, campos JSON, orden, fecha, revisión operativa y autorización.
- Sin modificación de Cajero V4, cola de reconteo ni funciones de mutación.

## 5. Fase C.3 — Revisión de contratos Admin (sin cambios preventivos)

Verificar mediante inspección SQL y, donde exista una fixture segura, mediante pruebas:
- `solog_control_groups_v10`: exclusión ya declarada con allowlist `('Coincide','Recontar','Confirmada','Inconsistente')`.
- `solog_daily_detail_bootstrap_v1`: selección por esos cuatro estados.
- `solog_daily_detail_page_v1`: comprobar allowlist de `v_state` en el recorrido completo hasta la función; una petición `Inválido` no debe ser una vista válida.
- `rpc_solog_control_export_v2`: garantizar que ningún arreglo ni KPI devuelto materialice filas inválidas; la CTE `base` actualmente sí puede incluirlas, aunque los conjuntos de salida utilizan filtros específicos. Revisar también denominadores y agregaciones, no solo las filas.
- `solog_control_chronology_view_v1`: revisar si la CTE fuente o etapas publicadas pueden mostrar filas inválidas, incluidas referencias históricas.

**Regla de implementación:** modificar únicamente la función donde se demuestre exposición de `Inválido` o influencia sobre un agregado visible. Si se descubre un caso no documentado o una ruptura de contrato, registrar el bloqueo y solicitar decisión antes de ampliar alcance.

## 6. Invariantes y casos límite

1. Un conteo `Inválido` se conserva en `inventario.conteo_detalle`, con los mismos stocks, diferencias, valorizado, timestamps, snapshots y relaciones.
2. No se altera `Coincide`, `Recontar`, `Confirmada` ni `Inconsistente`.
3. Un historial compuesto solo por inválidos devuelve `items=[]` y `next_cursor=null`.
4. Una página donde existan inválidos intercalados devuelve hasta `page_size` válidos, si existen suficientes.
5. Acceso directo al detalle inválido: `SOLOG_CASE_NOT_FOUND`.
6. Una cronología mixta omite inválidos conservando el orden de casos válidos.
7. Los KPIs operativos no incorporan inválidos ni en numeradores ni en denominadores, cuando provienen de conteos visibles.
8. Ninguna RPC cambia estado ni borra un registro.
9. La revisión de terminalidad es de rutas actuales; no crear una restricción futura por inferencia.

## 7. Validación exigida antes de cierre

**Preparación:** guardar el DDL íntegro de las funciones afectadas, verificar firmas, grants y revisión operativa; realizar un rollback documentado. No alterar una función completa copiando fragmentos sueltos: conservar todas las ramas, variables, excepciones y seguridad.

**Backend por fase:** comparar contrato JSON antes/después para casos de estados permitidos; confirmar que los filtros se aplican antes de paginar; comprobar permisos y errores. No crear casos falsos en producción. Si no existe fixture con `Inválido`, usar test transaccional con ROLLBACK solo si está demostrado que no produce efectos fuera de transacción; en caso contrario, dejar la validación negativa como pendiente y no declararla superada.

**Integración:** pruebas dirigidas de Detalles e Historial, smoke humano sobre historial y exportaciones; verificar funciones Admin de C.3, recuentos, cursores y `git diff --check` para documentación si aplica.

## 8. Secuencia y límites

1. C.1: modificar y validar `rpc_solog_details_v2`.
2. C.2: modificar y validar `rpc_solog_cashier_history_v2`.
3. C.3: verificar Admin y ajustar únicamente exposiciones demostradas; documentar cualquier cambio como delta dentro de este contrato.
4. Revisión global proporcional, reporte de evidencia y smoke humano cuando corresponda.
5. Cierre explícito por aprobación del usuario.

**Responsable de backend:** ChatGPT. No delegar SQL, migraciones ni despliegue backend a Codex; ningún cambio frontend está aprobado en este contrato. **No desplegar todavía:** este documento congela qué implementar, no ejecuta la implementación.
