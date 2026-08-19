# SOLOG V1 — Contrato técnico Backend ↔ Frontend

**Proyecto:** SOLOG  
**Backend:** Supabase — `PuertoRicoOnline`  
**Project ID:** `fvtohxvcvsflzmftgfzs`  
**Fecha:** 2026-08-19  
**Estado:** Backend V1 implementado y validado  
**Destino:** Codex / implementación frontend SOLOG

---

## 1. Regla de responsabilidad

Codex implementa únicamente SOLOG. Los cambios de Supabase se realizan exclusivamente mediante ChatGPT.

Codex puede consumir las RPC documentadas aquí, pero no debe crear/modificar tablas, RPC, RLS, Edge Functions, Auth ni ejecutar migraciones remotas. Si necesita un cambio backend, debe documentarlo en:

```text
docs/supabase-required-changes.md
```

---

## 2. Arquitectura de acceso

```text
SOLOG Web
↓
Supabase Auth
↓
RPC públicas SOLOG
↓
PostgreSQL
↓
inventario.*
```

RPC públicas:

```text
public.rpc_solog_state
public.rpc_solog_count
public.rpc_solog_admin
```

Todas reciben:

```text
p_action text
p_payload jsonb DEFAULT '{}'
```

Todas devuelven `jsonb` y solo son ejecutables por `authenticated`.

Ejemplo:

```ts
const { data, error } = await supabase.rpc('rpc_solog_state', {
  p_action: 'bootstrap',
  p_payload: {}
})
```

---

## 3. Errores

Los errores funcionales se devuelven como errores PostgreSQL/Supabase. El frontend debe mapear los códigos `SOLOG_*` a mensajes de UI y no replicar la lógica de autorización como fuente de verdad.

---

## 4. Device token

La tablet debe generar un token aleatorio persistente de entre 32 y 512 caracteres. Recomendación:

```ts
const bytes = new Uint8Array(32)
crypto.getRandomValues(bytes)
const deviceToken = Array.from(bytes)
  .map(b => b.toString(16).padStart(2, '0'))
  .join('')
```

El backend almacena únicamente `SHA-256(device_token)`.

---

# RPC 1 — `rpc_solog_state`

## 5. `bootstrap`

Roles permitidos:

```text
cajero
moderador
admin
```

Payload para cajero:

```json
{
  "device_token": "<TOKEN_LOCAL>"
}
```

Respuesta conceptual:

```json
{
  "usuario": {
    "id": "uuid",
    "nombre": "Cajero Huaca",
    "rol": "cajero",
    "activo": true
  },
  "sede": {
    "id": "uuid",
    "nombre": "Huaca",
    "activo": true
  },
  "dispositivo": {
    "id": "uuid",
    "estado": "pendiente",
    "sede_correcta": true,
    "autorizado": false
  },
  "sesion_activa": null,
  "stock": {
    "disponible": true,
    "snapshot_id": "uuid",
    "snapshot_at": "timestamp",
    "version_catalogo": 2
  },
  "cobertura_hoy": {
    "grupos_contados": 100,
    "grupos_totales": 481,
    "pendientes": 381,
    "porcentaje": 20.8
  },
  "categorias": [
    {
      "id": "uuid",
      "nombre": "Isotónicas",
      "orden": 10,
      "grupos_inventariables": 18
    }
  ],
  "vistas": {
    "cambios_recientes": 12,
    "stock_cero": 40,
    "stock_negativo": 2,
    "contar_detalladamente": 3
  }
}
```

No hardcodear `grupos_totales`; debe consumirse de backend.

### Estados de dispositivo

```text
token_requerido
pendiente
autorizado
revocado
```

Una tablet nueva genera automáticamente una solicitud `pendiente`.

### `sesion_activa`

Cuando existe:

```json
{
  "id": "uuid",
  "tipo": "categoria",
  "categoria_id": "uuid",
  "iniciado_at": "timestamp",
  "expira_at": "timestamp",
  "snapshot_referencia_id": "uuid",
  "snapshot_referencia_at": "timestamp",
  "grupos_contados": 10
}
```

### `stock`

Si no existe snapshot confirmado:

```json
{
  "disponible": false,
  "snapshot_id": null,
  "snapshot_at": null,
  "version_catalogo": null
}
```

SOLOG no debe permitir iniciar conteo cuando `stock.disponible = false`.

---

## 6. `groups`

Solo para cajero + tablet autorizada + sesión activa.

Payload:

```json
{
  "device_token": "<TOKEN>",
  "vista": "categoria"
}
```

Valores de `vista`:

```text
categoria
cambios_recientes
stock_cero
stock_negativo
contar_detalladamente
```

Mapeo obligatorio:

```text
tipo sesión             vista
--------------------------------------------
categoria               categoria
cambios_recientes       cambios_recientes
stock_cero              stock_cero
stock_negativo          stock_negativo
reconteo                contar_detalladamente
```

Respuesta:

```json
{
  "conteo_id": "uuid",
  "vista": "categoria",
  "snapshot_referencia_id": "uuid",
  "snapshot_referencia_at": "timestamp",
  "grupos": [
    {
      "grupo_id": "uuid",
      "nombre": "Gatorade 500 ml",
      "categoria_id": "uuid",
      "categoria": "Isotónicas",
      "precio": 3.5,
      "stock_teorico": 18,
      "productos": [
        {
          "c_interno": 12345,
          "producto": "GATORADE BLUE 500ML",
          "marca": "GATORADE"
        }
      ],
      "contado": false,
      "conteo_origen_id": null,
      "estado_diferencia": null,
      "stock_fisico_original": null,
      "contado_at_original": null
    }
  ]
}
```

Reglas:

- `categoria`: excluye stock teórico `0`, pero puede incluir negativo.
- `stock_cero`: `stock_teorico = 0`.
- `stock_negativo`: `stock_teorico < 0`.
- `cambios_recientes`: cambios en las 12 h previas al snapshot de referencia.
- `contar_detalladamente`: diferencias `parcialmente_explicada` o `persistente`.
- Para `contar_detalladamente`, los cuatro campos de origen son no nulos. La cola elige el conteo elegible más reciente por grupo que aún no tenga reconteo.
- Para las demás vistas, `conteo_origen_id`, `estado_diferencia`, `stock_fisico_original` y `contado_at_original` pueden ser `null`.

---

# RPC 2 — `rpc_solog_count`

Solo para `cajero` con tablet autorizada.

Acciones:

```text
start
save
finish
recount
```

## 7. `start`

Categoría:

```json
{
  "device_token": "<TOKEN>",
  "tipo": "categoria",
  "categoria_id": "uuid"
}
```

Otras vistas:

```json
{
  "device_token": "<TOKEN>",
  "tipo": "stock_cero"
}
```

Tipos:

```text
categoria
cambios_recientes
stock_cero
stock_negativo
reconteo
```

Respuesta:

```json
{
  "ok": true,
  "codigo": "COUNT_STARTED",
  "conteo_id": "uuid",
  "tipo": "categoria",
  "categoria_id": "uuid",
  "snapshot_referencia_id": "uuid",
  "snapshot_referencia_at": "timestamp",
  "iniciado_at": "timestamp",
  "expira_at": "timestamp"
}
```

Reglas backend:

```text
máximo 1 sesión activa por sede
máximo 2 horas por sesión
snapshot elegido por backend
usuario/sede derivados por backend
```

---

## 8. `save`

Payload:

```json
{
  "device_token": "<TOKEN>",
  "conteo_id": "uuid",
  "grupo_id": "uuid",
  "stock_fisico": 18
}
```

`stock_fisico >= 0`.

Respuesta:

```json
{
  "ok": true,
  "codigo": "GROUP_COUNT_SAVED",
  "conteo_id": "uuid",
  "grupo_id": "uuid",
  "stock_teorico": 20,
  "stock_fisico": 18,
  "diferencia": -2,
  "precio": 6,
  "valor_diferencia": -12,
  "estado_diferencia": "pendiente",
  "contado_at": "timestamp"
}
```

El backend calcula stock teórico, diferencia, precio, valor, estado y hora.

El mismo grupo no puede registrarse dos veces en una sesión.

---

## 9. `finish`

Payload:

```json
{
  "device_token": "<TOKEN>",
  "conteo_id": "uuid"
}
```

Respuesta:

```json
{
  "ok": true,
  "codigo": "COUNT_FINISHED",
  "conteo_id": "uuid",
  "estado": "parcial",
  "grupos_elegibles": 55,
  "grupos_contados": 31,
  "reconteos_pendientes": null,
  "finalizado_at": "timestamp"
}
```

Estados posibles:

```text
completado
parcial
```

Para sesión `reconteo`, `grupos_elegibles` y `grupos_contados` son `null` y se usa `reconteos_pendientes`.

---

## 10. `recount`

Solo para casos `parcialmente_explicada` o `persistente`.

Payload:

```json
{
  "device_token": "<TOKEN>",
  "conteo_id": "uuid",
  "grupo_id": "uuid",
  "stock_fisico": 18
}
```

Respuesta:

```json
{
  "ok": true,
  "codigo": "RECOUNT_SAVED",
  "conteo_id": "uuid",
  "grupo_id": "uuid",
  "stock_fisico_original": 18,
  "reconteo_stock": 18,
  "estado_diferencia": "confirmada_reconteo",
  "recontado_at": "timestamp"
}
```

Resultado:

```text
reconteo = primer físico  → confirmada_reconteo
reconteo != primer físico → conteos_inconsistentes
```

Solo se permite un reconteo.

---

## 11. Estados de diferencia

```text
coincide
pendiente
probablemente_explicada
parcialmente_explicada
persistente
confirmada_reconteo
conteos_inconsistentes
```

Etiquetas sugeridas:

```text
coincide                 → Coincide
pendiente                → Pendiente
probablemente_explicada  → Probablemente explicada
parcialmente_explicada   → Parcialmente explicada
persistente              → Persistente
confirmada_reconteo      → Confirmada por reconteo
conteos_inconsistentes   → Conteos inconsistentes
```

La evaluación posterior ocurre automáticamente cuando ConeXion confirma un nuevo snapshot. No existe RPC frontend para ejecutar esa evaluación.

---

# RPC 3 — `rpc_solog_admin`

Solo para:

```text
admin
moderador
```

Acciones:

```text
bootstrap
authorize_device
revoke_device
report
```

## 12. `bootstrap`

Payload:

```json
{}
```

Respuesta:

```json
{
  "usuario": {
    "id": "uuid",
    "nombre": "Admin Puerto Rico",
    "rol": "admin"
  },
  "sedes": [
    {
      "id": "uuid",
      "nombre": "Huaca",
      "activo": true,
      "dispositivo": {
        "id": "uuid",
        "estado": "autorizado",
        "autorizado_at": "timestamp",
        "ultimo_acceso_at": "timestamp"
      },
      "sesion_activa": null,
      "cobertura_hoy": {
        "grupos_contados": 100,
        "grupos_totales": 481
      }
    }
  ],
  "dispositivos_pendientes": [
    {
      "id": "uuid",
      "sede_id": "uuid",
      "sede": "Huaca",
      "solicitado_por": "uuid",
      "solicitante": "Cajero Huaca",
      "solicitado_at": "timestamp",
      "ultimo_acceso_at": null
    }
  ]
}
```

---

## 13. `authorize_device`

Payload:

```json
{
  "device_id": "uuid"
}
```

Respuesta:

```json
{
  "ok": true,
  "codigo": "DEVICE_AUTHORIZED",
  "device_id": "uuid",
  "sede_id": "uuid",
  "autorizado_por": "uuid"
}
```

Al autorizar una tablet nueva, la anterior autorizada para esa sede se revoca automáticamente.

---

## 14. `revoke_device`

Payload:

```json
{
  "device_id": "uuid"
}
```

Respuesta:

```json
{
  "ok": true,
  "codigo": "DEVICE_REVOKED",
  "device_id": "uuid",
  "sede_id": "uuid"
}
```

---

## 15. `report`

Tipos:

```text
summary
counts
differences
history
pos_adjustments
```

Payload base:

```json
{
  "report_type": "summary"
}
```

Filtros opcionales:

```json
{
  "sede_id": "uuid",
  "date_from": "2026-08-19",
  "date_to": "2026-08-19",
  "estado": "persistente",
  "categoria_id": "uuid",
  "grupo_id": "uuid",
  "c_interno": 20211,
  "limit": 100,
  "offset": 0
}
```

Reglas:

```text
limit default: 100
limit máximo: 500
offset mínimo: 0
zona horaria: America/Lima
```

Si no se envían fechas, backend usa hoy.

### `summary`

```json
{
  "report_type": "summary",
  "date_from": "2026-08-19",
  "date_to": "2026-08-19",
  "rows": [
    {
      "sede_id": "uuid",
      "sede": "Huaca",
      "grupos_totales": 481,
      "grupos_contados": 326,
      "sesiones": 5,
      "coincide": 280,
      "pendiente": 10,
      "probablemente_explicada": 20,
      "parcialmente_explicada": 5,
      "persistente": 4,
      "confirmada_reconteo": 3,
      "conteos_inconsistentes": 4
    }
  ]
}
```

### `counts`

```json
{
  "report_type": "counts",
  "limit": 100,
  "offset": 0,
  "rows": [
    {
      "conteo_id": "uuid",
      "sede_id": "uuid",
      "sede": "Huaca",
      "usuario_id": "uuid",
      "usuario": "Cajero Huaca",
      "tipo": "categoria",
      "categoria_id": "uuid",
      "estado": "completado",
      "iniciado_at": "timestamp",
      "expira_at": "timestamp",
      "finalizado_at": "timestamp",
      "snapshot_referencia_id": "uuid",
      "grupos_contados": 29
    }
  ]
}
```

### `differences` / `history` / `pos_adjustments`

Fila:

```json
{
  "conteo_id": "uuid",
  "grupo_id": "uuid",
  "grupo": "Gatorade 500 ml",
  "categoria_id": "uuid",
  "categoria": "Isotónicas",
  "sede_id": "uuid",
  "sede": "Huaca",
  "usuario_id": "uuid",
  "usuario": "Cajero Huaca",
  "stock_teorico": 20,
  "stock_fisico": 18,
  "diferencia": -2,
  "precio": 3.5,
  "valor_diferencia": -7,
  "estado_diferencia": "persistente",
  "contado_at": "timestamp",
  "snapshot_referencia_id": "uuid",
  "snapshot_posterior_id": "uuid",
  "stock_posterior": 20,
  "reconteo_stock": null,
  "recontado_at": null,
  "sku_count": 4,
  "sku_unico": null
}
```

`differences` excluye `coincide`.

`history` incluye todos los estados.

`pos_adjustments` solo incluye:

```text
persistente
parcialmente_explicada
confirmada_reconteo
conteos_inconsistentes
```

Interpretación:

```text
sku_count = 1 → sku_unico contiene c_interno
sku_count > 1 → sku_unico = null
```

---

## 16. Códigos de éxito

```text
COUNT_STARTED
GROUP_COUNT_SAVED
COUNT_FINISHED
RECOUNT_SAVED
DEVICE_AUTHORIZED
DEVICE_REVOKED
```

---

## 17. Códigos de error

Generales:

```text
SOLOG_AUTH_REQUIRED
SOLOG_INVALID_PAYLOAD
SOLOG_USER_DISABLED
SOLOG_ROLE_NOT_ALLOWED
SOLOG_INVALID_ACTION
```

Dispositivo:

```text
SOLOG_INVALID_DEVICE_TOKEN
SOLOG_DEVICE_REQUIRED
SOLOG_DEVICE_NOT_AUTHORIZED
SOLOG_INVALID_DEVICE_ID
SOLOG_DEVICE_ID_REQUIRED
SOLOG_PENDING_DEVICE_NOT_FOUND
SOLOG_DEVICE_NOT_REVOCABLE
```

Roles:

```text
SOLOG_CASHIER_WITHOUT_SEDE
SOLOG_OPERATIONAL_ROLE_REQUIRED
SOLOG_ADMIN_ROLE_REQUIRED
```

Sesión:

```text
SOLOG_INVALID_COUNT_TYPE
SOLOG_CATEGORY_REQUIRED
SOLOG_CATEGORY_NOT_AVAILABLE
SOLOG_ACTIVE_COUNT_EXISTS
SOLOG_CONFIRMED_SNAPSHOT_REQUIRED
SOLOG_COUNT_NOT_AVAILABLE
SOLOG_COUNT_NOT_ACTIVE
SOLOG_COUNT_EXPIRED
SOLOG_ACTIVE_COUNT_REQUIRED
SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE
```

Grupo:

```text
SOLOG_INVALID_COUNT_PAYLOAD
SOLOG_GROUP_ALREADY_COUNTED
SOLOG_GROUP_NOT_AVAILABLE
SOLOG_GROUP_NOT_IN_CATALOG
SOLOG_GROUP_NOT_ALLOWED_IN_COUNT
SOLOG_USE_RECOUNT_ACTION
```

Vista:

```text
SOLOG_VIEW_REQUIRED
SOLOG_VIEW_MISMATCH
```

Reconteo:

```text
SOLOG_INVALID_RECOUNT_PAYLOAD
SOLOG_RECOUNT_NOT_AVAILABLE
SOLOG_RECOUNT_NOT_ELIGIBLE
SOLOG_RECOUNT_ALREADY_DONE
```

Reportes:

```text
SOLOG_REPORT_TYPE_REQUIRED
SOLOG_INVALID_REPORT_FILTER
SOLOG_INVALID_DATE_RANGE
SOLOG_INVALID_REPORT_TYPE
```

---

## 18. Mapeo sugerido de errores UI

```text
SOLOG_DEVICE_NOT_AUTHORIZED
→ Esta tablet todavía no está autorizada.

SOLOG_ACTIVE_COUNT_EXISTS
→ Ya existe un conteo activo en esta sede.

SOLOG_COUNT_EXPIRED
→ La sesión de conteo venció. Inicia una nueva.

SOLOG_CONFIRMED_SNAPSHOT_REQUIRED
→ Todavía no existe stock actualizado para esta sede.

SOLOG_GROUP_ALREADY_COUNTED
→ Este grupo ya fue contado en esta sesión.

SOLOG_RECOUNT_NOT_ELIGIBLE
→ Este grupo ya no requiere conteo detallado.
```

Centralizar en:

```text
src/features/solog/errors.ts
```

---

## 19. Flujo operativo recomendado

```text
Auth login
↓
obtener/crear device_token local
↓
rpc_solog_state/bootstrap
↓
¿tablet autorizada?
├─ no → pantalla pendiente
└─ sí
   ↓
¿sesión activa?
├─ sí → reanudar
└─ no → pantalla de selección
```

Inicio:

```text
rpc_solog_count/start
↓
rpc_solog_state/groups
```

Guardar cada grupo individualmente:

```text
rpc_solog_count/save
```

No mantener todo el conteo únicamente en memoria para enviarlo al final.

Cierre:

```text
rpc_solog_count/finish
↓
rpc_solog_state/bootstrap
```

---

## 20. Flujo `Contar detalladamente`

```text
rpc_solog_count/start
  tipo = recount
↓
rpc_solog_state/groups
  vista = contar_detalladamente
↓
rpc_solog_count/recount
```

Cada grupo de esta vista devuelve `conteo_origen_id`. Para guardar el reconteo, el frontend debe enviarlo como `conteo_id` junto con `grupo_id`, `stock_fisico` y `device_token`:

```json
{
  "device_token": "<TOKEN>",
  "conteo_id": "<conteo_origen_id>",
  "grupo_id": "<grupo_id>",
  "stock_fisico": 18
}
```

No buscar el conteo original mediante acceso directo a tablas.

---

## 21. Flujo administrativo

```text
Auth
↓
rpc_solog_admin/bootstrap
↓
Resumen administrativo
```

Autorizar tablet:

```text
rpc_solog_admin/authorize_device
↓
refrescar bootstrap
```

Reportes:

```text
rpc_solog_admin/report
```

---

## 22. Reglas que el frontend no debe tratar como autoridad

Puede reflejarlas para UX, pero PostgreSQL es la fuente definitiva para:

```text
rol
sede
tablet autorizada
sesión activa
expiración
snapshot de referencia
stock teórico
diferencia
precio histórico
estado de diferencia
elegibilidad de grupo
elegibilidad de reconteo
cobertura
```

---

## 23. Auth

SOLOG reutiliza Supabase Auth de PuertoRicoOnline.

Roles relevantes:

```text
cajero
moderador
admin
```

Rol y sede son resueltos en backend desde `public.usuarios`.

---

## 24. Separación ConeXion / SOLOG

ConeXion:

```text
POS
→ Excel
→ snapshot
→ stock_actual
```

SOLOG:

```text
snapshot/stock
→ conteo físico
→ diferencias
→ evaluación
→ administración
```

SOLOG no debe leer Excel, subir snapshots, modificar `stock_actual` ni modificar POS.

---

## 25. Organización TypeScript recomendada

Tipos:

```text
src/features/solog/types.ts
```

Cliente:

```text
src/features/solog/api.ts
```

Errores:

```text
src/features/solog/errors.ts
```

No dispersar llamadas `supabase.rpc(...)` por los componentes.

Tipos sugeridos:

```text
SologBootstrap
SologDeviceState
SologActiveCount
SologCoverage
SologCategory
SologGroup
SologGroupProduct
SologCountStartResponse
SologCountSaveResponse
SologCountFinishResponse
SologRecountResponse
SologAdminBootstrap
SologAdminSummaryRow
SologCountReportRow
SologDifferenceReportRow
SologReportResponse
```

---

## 26. Regla de cambio de contrato

Codex debe tratar estas RPC y campos como API existente.

Si necesita un cambio:

1. no modificar Supabase;
2. documentar el requisito;
3. indicar RPC afectada;
4. indicar payload/respuesta deseada;
5. continuar con todo lo que no dependa de ese cambio.

---

## 27. Estado backend

```text
Modelo de datos            ✅
Seguridad                  ✅
rpc_solog_state            ✅
rpc_solog_count            ✅
Motor diferencias          ✅
Integración ConeXion       ✅
rpc_solog_admin            ✅
Pruebas integrales         ✅
```

El backend está preparado para iniciar la implementación funcional de SOLOG en Codex. Las formas de categorías, dispositivos pendientes y grupos de reconteo están definidas; no quedan precisiones contractuales pendientes para continuar el frontend.
