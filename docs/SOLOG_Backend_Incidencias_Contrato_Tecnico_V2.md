# SOLOG — Backend Incidencias — Contrato Técnico V2

**Estado:** CONGELADO / DESPLEGADO / VALIDADO  
**Fecha:** 2026-09-10  
**Proyecto:** SOLOG  
**Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`)  
**Nivel:** C — backend / lógica / integración Incidencias ↔ Catálogo  
**API envelope vigente:** `contract_version = 2`

---

## 1. Autoridad y precedencia

Este documento es la **fuente primaria técnica vigente del módulo Admin > Incidencias**.

Precedencia:

1. `SOLOG_Backend_Incidencias_Contrato_Tecnico_V2.md` — fuente primaria vigente para Incidencias.
2. `SOLOG_Backend_Incidencias_Contrato_Tecnico_V1.md` — REEMPLAZADO por V2; histórico para los puntos no modificados.
3. `SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md` — autoridad para el ciclo de propuestas y publicación una vez que Incidencias origina `eliminar_producto`.
4. `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` — decisiones funcionales globales no reemplazadas aquí.
5. `SOLOG_Backend_Contratos_Optimizacion_Global_V10.md` y contratos heredados — vigentes en sus módulos y en reglas comunes no sustituidas.
6. Documentación anterior de Incidencias — histórica cuando contradiga este contrato.

Este contrato **no modifica** los contratos de Catálogo, Grupos, Cajero, Control, Detalles, Dispositivos ni ConeXion salvo en la frontera explícitamente descrita.

---

## 2. Cambios desplegados

Migraciones aplicadas:

- `20260910171314_solog_incidents_operational_freshness_v1`
- `20260910171453_solog_incident_suppression_resolution_guard_v1`
- `20260910204405_solog_incidents_reactivate_scope_contract_v1`

Se mantiene la superficie pública:

```text
public.rpc_solog_admin_incidents_v2(p_action text, p_payload jsonb)
```

No se crea una RPC V3 ni se incrementa `contract_version`, porque el cambio conserva la superficie V2 y es compatible/aditivo para sus consumidores actuales.

### Delta V2

V2 reemplaza a V1 únicamente en la semántica de reactivación por scope y en los campos aditivos necesarios para que frontend pueda decidirla sin ambigüedad:

- `summary` añade `scope_suppression_until`;
- `summary` añade `reactivate_available`;
- `reactivate` exige una supresión activa exactamente correspondiente al scope solicitado;
- si no existe, devuelve `SOLOG_INCIDENT_SUPPRESSION_NOT_ACTIVE`;
- `status='active'` deja de poder devolverse cuando no se revocó ninguna supresión activa del scope solicitado.

Todo lo demás definido por V1 permanece vigente.

---

## 3. Responsabilidad de Incidencias

Admin > Incidencias administra únicamente anomalías operativas que requieren revisión propia y no constituyen decisiones comerciales del Catálogo.

Tipos operativos visibles y accionables:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

Las siguientes incidencias comerciales continúan persistiendo en `inventario.incidencias`, pero **no forman parte de la superficie Admin > Incidencias**:

```text
producto_nuevo
nombre_modificado
precio_modificado
codigo_barras_modificado
codigo_barras_agregado
codigo_barras_eliminado
```

Estas seis familias continúan alimentando `inventario.catalogo_candidatos()` y se administran mediante **Catálogo > Propuestas**.

Incidencias no aprueba ni publica cambios de Catálogo.

---

## 4. Autoridad temporal: snapshot confirmado

Cada snapshot ConeXion confirmado representa una observación autoritativa completa de la sede para las incidencias operativas.

Al confirmarse un nuevo snapshot:

- una incidencia operativa presente en ese snapshot continúa activa;
- una incidencia operativa activa cuyo `ultimo_snapshot_id` ya no corresponde al nuevo snapshot se considera resuelta;
- el historial no se elimina;
- `resuelta_at` toma el `capturado_at` del snapshot que demuestra que la anomalía ya no está presente;
- una incidencia resuelta puede reaparecer posteriormente y volver a estado activo si un nuevo snapshot vuelve a detectarla.

La resolución automática se ejecuta mediante:

```text
inventario.solog_resolve_operational_incidents_on_snapshot_v1()
trg_solog_resolve_operational_incidents_on_snapshot_v1
```

El trigger actúa al pasar un snapshot a `estado='confirmado'`.

---

## 5. Estados operativos

Para las cuatro familias administradas por este módulo, los estados vigentes son:

```text
pendiente
suprimida
resuelta
```

Semántica:

- `pendiente`: la anomalía existe en la observación autoritativa vigente y requiere atención.
- `suprimida`: la anomalía sigue existiendo, pero existe una supresión activa aplicable.
- `resuelta`: una observación posterior autoritativa demostró que la anomalía ya no está presente.

`resuelta` es histórica, no bloqueante.

Una supresión puede continuar vigente temporalmente aunque la incidencia haya quedado `resuelta`; si la misma familia reaparece antes de vencer la supresión, reaparece como `suprimida`, no como `pendiente`.

---

## 6. Identidad y supresión

La identidad de familia continúa siendo `family_key`, SHA-256 estable e independiente de sede.

La normalización se mantiene en:

```text
inventario.solog_guardar_incidencia_normalizada()
inventario.solog_incidencia_datos_canonicos(...)
```

La protección de supresión se aplica por `family_key` tanto en INSERT como en UPDATE/`ON CONFLICT`.

Regla congelada:

> Una incidencia ignorada no puede reaparecer como `pendiente` mientras exista una exclusión activa aplicable, incluso cuando `c_interno` sea `NULL`, como en `codigo_interno_invalido`.

El trigger de normalización solo fuerza `suprimida` cuando la fila intenta estar en estado activo (`pendiente` o `suprimida`). No impide que el resolver de snapshot la marque `resuelta`.

---

## 7. Seguridad

`rpc_solog_admin_incidents_v2`:

- `SECURITY DEFINER`;
- `search_path = ''`;
- `anon`: sin `EXECUTE`;
- `authenticated`: con `EXECUTE`;
- exige `auth.uid()` válido;
- exige usuario activo;
- roles permitidos: `admin | moderador`;
- valida sede activa cuando se proporciona `site_id`.

La función de trigger interna `solog_resolve_operational_incidents_on_snapshot_v1()` no tiene `EXECUTE` para `anon` ni `authenticated`.

---

# 8. Acción `summary`

## 8.1. Payload

Global:

```json
{}
```

Por sede:

```json
{
  "site_id": "uuid"
}
```

No acepta filtros manuales de fecha como parte del contrato funcional del módulo.

## 8.2. Período

El backend usa la quincena operativa vigente mediante:

```text
inventario.solog_periodo_desde(now())
inventario.solog_periodo_hasta(now())
America/Lima
```

Una incidencia forma parte del resumen si durante el período:

- fue observada (`last_seen_at`), o
- fue resuelta (`resuelta_at`).

## 8.3. Alcance

`summary` devuelve exclusivamente las cuatro familias operativas:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

Las incidencias comerciales no se devuelven aquí.

## 8.4. Respuesta

```ts
interface IncidentFamilySummary {
  family_key: string;
  tipo: "producto_ausente" | "codigo_interno_invalido" | "codigo_interno_duplicado" | "stock_invalido";
  c_interno: number | null;
  c_interno_original: string | null;
  datos: Record<string, unknown>;
  representative_id: string;
  representative_site_id: string;

  cases: number;
  occurrences: number;
  sites: number;

  pending_cases: number;
  suppressed_cases: number;
  resolved_cases: number;
  active_cases: number;

  active: boolean;
  family_state: "pendiente" | "suprimida" | "resuelta";

  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;

  // Cualquier supresión activa que afecta a la familia en la vista consultada.
  // En vista global puede reflejar una supresión global o de una sede.
  // En vista por sede puede reflejar una supresión global o de esa sede.
  active_suppression_until: string | null;

  // Supresión activa exacta que puede revocarse desde el scope actual.
  // Vista global: solo supresión global.
  // Vista por sede: solo supresión específica de esa sede.
  scope_suppression_until: string | null;
  reactivate_available: boolean;

  deletion_proposed: boolean;
}
```

Envelope:

```ts
interface IncidentSummaryResponse {
  contract_version: 2;
  generated_at: string;
  period: { from: string; to: string };
  site_id: string | null;
  families: IncidentFamilySummary[];
  revisions: { incidents: number };
}
```

Orden:

1. familias activas primero;
2. `last_seen_at DESC`;
3. `family_key` como desempate.

`active=true` cuando existe al menos un caso `pendiente` o `suprimida` en el scope consultado.

### 8.5. Semántica de supresión y reactivación

`active_suppression_until` y `scope_suppression_until` responden preguntas distintas y no deben sustituirse entre sí:

- `active_suppression_until`: informa si existe alguna supresión activa que afecta a la familia en la vista consultada. En resumen global puede corresponder a una supresión global o a una supresión específica de cualquier sede incluida; en resumen por sede puede corresponder a una supresión global o a una supresión específica de esa sede.
- `scope_suppression_until`: informa únicamente la supresión activa exacta que la acción `reactivate` del scope actual puede revocar.
- `reactivate_available=true` únicamente cuando `scope_suppression_until != null`.

Reglas exactas:

```text
summary global (sin site_id)
  reactivate_available = existe supresión GLOBAL activa de la familia
  scope_suppression_until = vencimiento de esa supresión global

summary por sede (con site_id)
  reactivate_available = existe supresión DE ESA SEDE activa de la familia
  scope_suppression_until = vencimiento de esa supresión de sede
```

Una supresión global puede afectar a una incidencia vista por sede y, por tanto, aparecer en `active_suppression_until`, pero **no** habilita `reactivate` con `scope=site`. De forma equivalente, una supresión de una sede puede hacer que el resumen global indique que existe alguna supresión activa, pero no habilita `reactivate` con `scope=global`.

---

# 9. Acción `detail`

## 9.1. Payload

```json
{
  "family_key": "sha256 hex",
  "site_id": "uuid opcional",
  "page": 0,
  "page_size": 100
}
```

`page_size <= 100`.

La familia debe pertenecer a uno de los cuatro tipos operativos; una familia comercial no es accesible mediante esta superficie.

## 9.2. Item

Cada item conserva los campos V2 anteriores y añade:

```ts
{
  resuelta_at: string | null;
  active: boolean;
}
```

`active=true` únicamente para `pendiente | suprimida`.

La paginación del detalle continúa siendo backend y bajo demanda.

---

# 10. Mutaciones comunes

Acciones:

```text
ignore_30d
reactivate
propose_delete
```

Payload base:

```json
{
  "family_key": "sha256 hex",
  "scope": "global | site",
  "site_id": "uuid solo cuando scope=site",
  "operation_id": "uuid",
  "expected_revision": 1
}
```

Todas:

- son atómicas;
- usan `operation_id` e idempotencia mediante `inventario.solog_operaciones`;
- validan `expected_revision`;
- usan lock por `family_key + scope + site`;
- solo aceptan familias de los cuatro tipos operativos.

El mismo `operation_id` solo puede reutilizarse al reintentar exactamente la misma intención.

---

# 11. `ignore_30d`

Solo puede aplicarse a una familia que tenga evidencia activa (`pendiente | suprimida`) dentro del scope solicitado.

Efecto:

- crea o renueva una exclusión durante 30 días;
- `scope=global` crea supresión global;
- `scope=site` crea supresión para la sede indicada;
- filas activas de la familia pasan a `suprimida`;
- filas ya `resuelta` no se reactivan ni se reescriben como suprimidas.

Si la familia ya no está activa:

```text
SOLOG_INCIDENT_NOT_CURRENT
```

---

# 12. `reactivate`

Revoca anticipadamente la supresión **activa exacta** correspondiente al scope solicitado.

- `global`: solo puede revocar una exclusión global activa de la familia;
- `site`: solo puede revocar una exclusión activa específica de esa sede;
- una supresión global no puede revocarse mediante `scope=site`;
- una supresión de sede no puede revocarse mediante `scope=global`;
- otras exclusiones aplicables permanecen vigentes;
- una fila `suprimida` todavía vigente pasa a `pendiente` únicamente si ya no existe otra supresión aplicable;
- una fila `resuelta` permanece `resuelta`.

Antes de ejecutar la mutación, backend exige que exista una supresión activa exactamente revocable por ese scope. Si no existe:

```text
SOLOG_INCIDENT_SUPPRESSION_NOT_ACTIVE
```

Este rechazo es definitivo para esa intención y no debe representarse como éxito.

Cuando la operación responde `status='active'`, significa que **sí se revocó una supresión activa del scope solicitado**. No garantiza que la anomalía continúe actualmente presente; una familia puede estar resuelta y aun conservar una supresión temporal que el administrador decida levantar.

La UI debe utilizar `reactivate_available` como autoridad para mostrar la acción. `active_suppression_until` no es suficiente para decidir si el scope actual puede reactivar.

---

# 13. `propose_delete`

Solo es válida para:

```text
tipo = producto_ausente
c_interno != null
```

Es una **acción humana explícita**. Nunca se ejecuta automáticamente al recibir una incidencia.

## 13.1. Evidencia vigente obligatoria

Antes de crear/reutilizar una propuesta, backend exige evidencia autoritativa vigente de ausencia:

- la familia sigue `pendiente` o `suprimida`;
- su `ultimo_snapshot_id` corresponde a un snapshot confirmado;
- `snapshot_stock` de ese snapshot registra:
  - `estado_observacion = 'producto_ausente'`;
  - `producto_eliminado = true`;
- no existe un snapshot confirmado posterior de esa sede.

Para `scope=site`, la evidencia debe corresponder a la sede indicada.

Para `scope=global`, debe existir al menos una sede de la familia con evidencia vigente de ausencia.

Si la evidencia quedó obsoleta o un snapshot posterior demostró que el producto reapareció:

```text
SOLOG_INCIDENT_NOT_CURRENT
```

## 13.2. Efecto

`propose_delete`:

- crea/reutiliza una fila `cambios_catalogo` de tipo `eliminar_producto` en el flujo existente;
- no elimina el SKU;
- no excluye el SKU;
- no aprueba la propuesta;
- no publica catálogo;
- no suprime la incidencia.

Desde ese punto, la autoridad pasa a **Catálogo V3**.

---

# 14. Frontera Incidencias ↔ Catálogo

```text
ConeXion
   │
   ├─ incidencias comerciales ───────────────→ Catálogo > Propuestas
   │
   └─ anomalías operativas ─→ Incidencias
                                  │
                                  └─ producto_ausente
                                      + acción humana
                                      "Proponer eliminación"
                                             │
                                             ▼
                                      Catálogo > Propuestas
```

Reglas:

- las seis incidencias comerciales no se revisan/ignoran desde Admin > Incidencias;
- su persistencia se conserva para construir propuestas de Catálogo;
- `eliminar_producto` puede originarse desde `producto_ausente` solo mediante acción humana explícita;
- Catálogo sigue siendo autoridad de aprobación, staging, preview y publicación.

---

# 15. Compatibilidad con frontend actual

El backend sigue exponiendo los campos V2 ya consumidos:

- `cases`;
- `occurrences`;
- `sites`;
- `pending_cases`;
- `suppressed_cases`;
- `first_seen_at`;
- `last_seen_at`;
- `active_suppression_until`;
- `deletion_proposed`.

Los campos de resolución/actividad y de reactivación por scope son aditivos. V2 añade:

- `scope_suppression_until`;
- `reactivate_available`.

El frontend actual puede seguir funcionando mientras Codex realiza el ajuste posterior, pero debe migrarse para:

- distinguir visualmente `resuelta` de una incidencia activa;
- utilizar `active`, `active_cases`, `resolved_cases` y `family_state`;
- no ofrecer acciones que requieran incidencia activa cuando `active=false`;
- mostrar `Reactivar incidencia` únicamente cuando `reactivate_available=true`;
- no inferir reactivación posible a partir de `active_suppression_until`;
- tratar `SOLOG_INCIDENT_SUPPRESSION_NOT_ACTIVE` como rechazo definitivo y recargar estado autoritativo;
- mostrar únicamente los cuatro tipos operativos devueltos por backend;
- conservar `propose_delete` como acción explícita;
- alinear textos y presentación visual según las decisiones UI vigentes.

---

# 16. Validaciones realizadas

Se ejecutaron pruebas sintéticas transaccionales con rollback, sin persistir datos.

Validado:

1. `summary` no devuelve incidencias comerciales.
2. Una incidencia operativa presente en el snapshot vigente permanece `pendiente`.
3. Un snapshot posterior sin la anomalía cambia la fila a `resuelta`.
4. `summary` devuelve la familia resuelta con `active=false` y `family_state='resuelta'`.
5. `propose_delete` funciona cuando existe evidencia vigente de `producto_ausente`.
6. `propose_delete` devuelve `SOLOG_INCIDENT_NOT_CURRENT` después de una observación posterior que invalida la ausencia.
7. `ignore_30d` funciona para `codigo_interno_invalido` con `c_interno=NULL`.
8. La supresión de `codigo_interno_invalido` sobrevive a una repetición por `ON CONFLICT`.
9. Una incidencia suprimida puede pasar correctamente a `resuelta` cuando un snapshot posterior demuestra que desapareció.
10. `reactivate` devuelve una incidencia suprimida todavía vigente a `pendiente` cuando ya no existe otra supresión aplicable.
11. `ignore_30d` sobre una incidencia ya resuelta devuelve `SOLOG_INCIDENT_NOT_CURRENT`.
12. `detail` rechaza familias comerciales.
13. `anon` no puede ejecutar `rpc_solog_admin_incidents_v2`.
14. `authenticated` conserva acceso a la RPC, sujeto a las validaciones internas de usuario/rol.
15. La función de trigger interna no es ejecutable por `anon` ni `authenticated`.
16. Con una supresión **de sede** activa, `summary` global conserva `active_suppression_until`, pero devuelve `scope_suppression_until=null` y `reactivate_available=false`.
17. En ese mismo caso, `summary` de la sede devuelve `scope_suppression_until` y `reactivate_available=true`.
18. `reactivate(scope=global)` con solo una supresión de sede devuelve `SOLOG_INCIDENT_SUPPRESSION_NOT_ACTIVE` y no revoca la supresión de sede.
19. `reactivate(scope=site)` con la supresión exacta de sede activa funciona correctamente.
20. Repetir la misma reactivación exitosa con el mismo `operation_id` devuelve replay idempotente.
21. Una supresión **global** activa afecta correctamente a la vista por sede mediante `active_suppression_until`, pero no habilita `reactivate(scope=site)`.
22. La vista global de esa supresión devuelve `scope_suppression_until` y `reactivate_available=true`.
23. `reactivate(scope=global)` revoca correctamente la supresión global activa.
24. Toda la validación sintética del delta se ejecutó dentro de una transacción forzada a rollback mediante el marcador `SOLOG_INCIDENT_SCOPE_VALIDATION_ROLLBACK_OK`.

Estado de producción después de las pruebas:

```text
snapshots              = 0
incidencias             = 0
exclusiones sintéticas  = 0
catálogo publicado      = V6
inventario.catalogo     = 980 filas
cambios_catalogo        = 33 filas
```

No se publicó una nueva versión de catálogo ni se dejaron datos sintéticos.

---

# 17. Advisors

La revisión de seguridad no detectó exposición anónima nueva de la RPC de Incidencias ni de la función de trigger interna.

Persisten advertencias preexistentes del proyecto fuera del alcance de este bloque, incluyendo RLS defensivo sin políticas directas en `inventario`, vistas `SECURITY DEFINER`, `pg_trgm` en `public`, otras funciones históricas ejecutables y protección de contraseñas filtradas deshabilitada.

La revisión de rendimiento no detectó un nuevo hallazgo específico provocado por este cambio. Los avisos existentes corresponden principalmente a índices/PK/FK/policies de otras áreas o índices sin uso aún observado.

No se amplía el alcance para corregirlos desde este contrato.

---

# 18. Fuera de alcance

Este contrato no autoriza:

- rediseñar Grupos;
- modificar Motor V3;
- modificar Cajero;
- modificar Catálogo V3;
- cambiar el contrato externo ConeXion V2;
- eliminar historial de incidencias comerciales;
- automatizar `eliminar_producto`;
- publicar catálogo desde Incidencias;
- realizar limpieza general de seguridad/performance del proyecto.

---

# 19. Estado de cierre backend

```text
Preflight funcional/técnico       COMPLETADO
Decisiones funcionales            APROBADAS
Backend Supabase                  DESPLEGADO
Validación sintética              APROBADA
Contrato técnico                  CONGELADO
Frontend Incidencias              PENDIENTE DE AJUSTE EN CODEX
Smoke integrado                   PENDIENTE
```

El backend queda preparado para que el frontend Admin > Incidencias se adapte contra **V2** sin requerir cambios adicionales conocidos. V1 queda reemplazado por este documento.
