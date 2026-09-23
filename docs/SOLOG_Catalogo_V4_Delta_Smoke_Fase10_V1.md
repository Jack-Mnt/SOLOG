# SOLOG — Catálogo V4 — Delta post-smoke Fase 10 V1

**Estado:** CONGELADO / IMPLEMENTADO — PENDIENTE DE RE-SMOKE  
**Fecha:** 2026-09-22  
**Rama:** `admin-work`  
**Ámbito:** correcciones detectadas durante smoke humano de Catálogo V4.

# 1. Precedencia

Este delta reemplaza únicamente las reglas del contrato V1 que contradiga en:

- descarte de propuestas automáticas;
- aplicación del valorizado durante resolución de precio;
- consolidación de propuestas equivalentes de precio por grupo;
- presentación de publicación sin cambios o publicación ya confirmada.

# 2. Automáticas vs administrativas

Propuestas automáticas:

```text
Pendiente → Aprobar/Resolver | Ignorar
Aprobado  → Volver a pendiente | Ignorar
Ignorado  → Reactivar
Descartar → PROHIBIDO
```

Propuestas administrativas:

```text
Aprobado → Volver a pendiente | Descartar
Ignorar  → PROHIBIDO
```

`Descartado` continúa siendo backend-only y terminal, pero queda reservado al flujo administrativo.

# 3. Valorizado durante cambios de precio

Para un grupo existente y resolución `update_group_price` o `keep_structure`:

- `keep`: no modifica valorizado;
- `set`: actualiza `unidades_por_paquete` + `precio_paquete` inmediatamente;
- `update`: actualiza `precio_paquete` inmediatamente;
- `clear`: elimina valorizado inmediatamente.

La actualización ocurre en la misma transacción que la resolución/preparación.

La resolución almacenada para publicación normaliza el valorizado a:

```text
package_action = keep
```

para que la publicación no sobrescriba posteriormente el master data con una copia antigua.

`withdraw` no revierte el valorizado ya aplicado.

Para `separate_sku`, el grupo futuro todavía no existe y el valorizado permanece en staging hasta publicación.

# 4. Precio sugerido

Al seleccionar x6/x10/x12/x20 o cambiar el número de unidades:

```text
precio sugerido = unidades × nuevo precio unitario
```

Cambiar unidades siempre recalcula el sugerido.

Una edición manual del precio se conserva mientras no vuelva a cambiarse el número de unidades.

En el subdiálogo de valorizado, `Aplicar` completa directamente `resolve_price` o `prepare_price`; no requiere regresar al modal anterior para un segundo guardado.

# 5. Propuestas equivalentes de precio

Para `update_group_price`:

- mismo grupo + mismo precio objetivo + propuestas automáticas pendientes → se resuelven/aprueban juntas;
- el valorizado se aplica una sola vez al grupo;
- todas reciben staging equivalente y posteriormente se incorporan juntas.

Si existe una propuesta automática pendiente del mismo grupo con precio objetivo diferente:

```text
SOLOG_GROUP_PRICE_PROPOSAL_CONFLICT
```

y `update_group_price` queda bloqueado.

`separate_sku` continúa siendo individual.

No se absorben automáticamente propuestas ignoradas, incorporadas o administrativas.

# 6. Publicación

Una publicación con:

```text
completion_recorded = true
```

domina la presentación del diálogo:

```text
Catálogo publicado · versión N
```

No se muestran simultáneamente errores provenientes del preview recargado.

`NO_APPROVED_CATALOG_CHANGES` se representa como estado informativo:

```text
No hay cambios aprobados para publicar.
```

sin acción de reintento.

`Reintentar/Recuperar` queda reservado a fallos reales o resultados inciertos.
