# Estado actual del backend de SOLOG

Documento sincronizado el 19 de agosto de 2026 con [SOLOG_Contrato_Tecnico_Backend_V1.md](./SOLOG_Contrato_Tecnico_Backend_V1.md), que es la fuente de verdad para la integración frontend. Esta actualización no ejecutó consultas de escritura, DDL, migraciones ni cambios de configuración en Supabase.

## Resumen ejecutivo

El backend V1 de SOLOG está implementado y validado en el proyecto Supabase `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`). El frontend no accede directamente al schema privado `inventario`; opera exclusivamente con Supabase Auth y tres RPC públicas para usuarios autenticados:

```text
public.rpc_solog_state
public.rpc_solog_count
public.rpc_solog_admin
```

El modelo de conteos, la autorización de tablets, el motor automático de diferencias, su integración con los snapshots confirmados por ConeXion y los reportes administrativos ya forman parte del backend actual. Los antiguos requisitos que proponían acceso directo, vistas nuevas o RPC alternativas quedan reemplazados por este contrato.

## Proyecto y responsabilidades

- Proyecto: `PuertoRicoOnline`.
- Project ref: `fvtohxvcvsflzmftgfzs`.
- SOLOG consume stock y snapshots; no lee Excel, no crea snapshots y no modifica `inventario.stock_actual`.
- ConeXion conserva la responsabilidad de publicar snapshots y mantener el stock teórico por SKU.
- SOLOG cuenta a nivel `grupo_conteo`; la composición desde SKU y el cálculo de stock teórico se resuelven en backend.

## Auth, rol y sede

SOLOG reutiliza Supabase Auth. Los roles operativos son `cajero`, `moderador` y `admin`. El backend obtiene el usuario autenticado mediante `auth.uid()` y resuelve rol, estado y sede desde `public.usuarios`; el frontend no es autoridad para esos valores.

El cliente web usa una clave publicable/anon y mantiene la sesión mediante `@supabase/supabase-js`. Las RPC SOLOG son ejecutables únicamente por `authenticated`.

## Arquitectura de seguridad

```text
SOLOG Web
  -> Supabase Auth
  -> RPC públicas SOLOG
  -> validación de rol, sede y dispositivo
  -> inventario.*
```

- `inventario` permanece sin acceso directo para `anon` o `authenticated`.
- El frontend no necesita tipos generados ni grants directos sobre las tablas privadas.
- Autorización, sede, sesión activa, expiración, snapshot, elegibilidad, stock teórico, diferencias y cobertura se validan en PostgreSQL.
- El token del dispositivo se genera y conserva en la tablet; el backend almacena únicamente su hash SHA-256.
- `inventario.dispositivos_solog` forma parte del modelo actual de autorización de tablets.

Esta falta de acceso directo a `inventario` es una decisión de seguridad resuelta mediante las RPC, no un bloqueo pendiente.

## Modelo de datos de conteos

El backend actual ya cubre:

- sesiones de conteo por sede y usuario;
- snapshot de referencia elegido por backend;
- máximo de una sesión activa por sede y expiración a las dos horas;
- conteo por categoría, cambios recientes, stock cero, stock negativo y reconteo;
- detalle por grupo con stock teórico, stock físico, diferencia, precio histórico, valor de diferencia y hora;
- estados de cierre `completado` y `parcial`;
- atribución del usuario y sede derivadas por backend;
- autorización, revocación y reemplazo de dispositivos por sede.

El frontend no debe escribir directamente en las tablas de conteo.

## RPC disponibles

Todas reciben `p_action text`, `p_payload jsonb DEFAULT '{}'` y devuelven `jsonb`.

### `rpc_solog_state`

- `bootstrap`: devuelve contexto operativo, usuario, sede, dispositivo, sesión, snapshot, cobertura, categorías y contadores de vistas.
- `groups`: devuelve los grupos elegibles y sus productos para la sesión activa.

### `rpc_solog_count`

- `start`: inicia una sesión y fija su snapshot de referencia.
- `save`: guarda un grupo; el backend calcula todos los valores derivados.
- `finish`: cierra la sesión y devuelve su cobertura o reconteos pendientes.
- `recount`: registra el único reconteo permitido para una diferencia elegible.

### `rpc_solog_admin`

- `bootstrap`: devuelve sedes, dispositivos, sesiones, cobertura y solicitudes pendientes.
- `authorize_device`: autoriza una tablet y revoca automáticamente la anterior de la sede.
- `revoke_device`: revoca una tablet.
- `report`: expone `summary`, `counts`, `differences`, `history` y `pos_adjustments` con filtros y paginación documentados.

## Motor automático de diferencias

El backend calcula `stock_teorico`, `diferencia`, `precio`, `valor_diferencia` y el estado inicial al guardar. Los estados documentados son:

```text
coincide
pendiente
probablemente_explicada
parcialmente_explicada
persistente
confirmada_reconteo
conteos_inconsistentes
```

Cuando ConeXion confirma un snapshot posterior, el motor evalúa automáticamente las diferencias pendientes. No existe ni se necesita una acción frontend para ejecutar esta evaluación.

## Integración con snapshots de ConeXion

- El backend selecciona el snapshot confirmado al iniciar el conteo.
- La sesión conserva su snapshot de referencia aunque aparezcan snapshots posteriores.
- `cambios_recientes` usa las 12 horas anteriores al snapshot de referencia.
- La evaluación posterior compara contra los nuevos snapshots confirmados por ConeXion.
- SOLOG nunca publica snapshots ni actualiza `stock_actual`.

## Validación realizada

El contrato técnico declara como completadas las pruebas sintéticas e integrales del modelo, seguridad, las tres RPC, el motor de diferencias y la integración con ConeXion. El frontend debe tratar esos contratos como API existente y no duplicar sus reglas.

## Estado de la base frontend

El repositorio ya dispone de:

- React, TypeScript y Vite;
- cliente Supabase centralizado con sesión persistente;
- variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` fuera del repositorio;
- estructura `src/features/solog/` con tipos, errores y acceso centralizado a RPC;
- contexto React de Auth que recupera la sesión inicial, escucha sus cambios y ofrece login por email/password y logout;
- token local persistente de tablet generado con 32 bytes criptográficamente aleatorios, sin fingerprinting;
- contexto operativo que obtiene `rpc_solog_state/bootstrap` y usa su respuesta como fuente de verdad;
- navegación protegida por rol, autorización del dispositivo y sesión activa;
- shells funcionales para `/login`, `/`, `/device-pending`, `/count` y `/admin`.

Los flujos frontend **Por categoría**, **Cambios recientes**, **Stock 0**, **Stock negativo** y **Contar detalladamente** ya están implementados. Comparten carga de grupos, captura física inmutable, restauración desde backend tras recarga, temporizador de expiración y cierre según la respuesta backend. El tipo de la sesión activa determina la vista que se solicita al reconstruir `/count`.

Los cuatro conteos normales usan `rpc_solog_count/save`. Contar detalladamente inicia una sesión `reconteo`, carga la vista homónima y usa `rpc_solog_count/recount`: el ID del conteo original de cada grupo se emplea solo para recontearlo, mientras el ID de la sesión activa se conserva para `finish`.

El área administrativa consume `rpc_solog_admin/bootstrap`, `authorize_device` y `revoke_device`. Para `admin` y `moderador` muestra el resumen de sedes, cobertura y sesiones, las tablets autorizadas y las solicitudes pendientes; permite autorizar o reemplazar una tablet, revocarla, rechazar una solicitud y refrescar manualmente. La carga administrativa es independiente del bootstrap operativo que protege el routing.

La sección de reportes consume las cinco variantes de `rpc_solog_admin/report`: `summary`, `counts`, `differences`, `history` y `pos_adjustments`. Incluye rango de fechas, sede, estados específicos por reporte, código interno para historial/ajuste POS y paginación mediante `limit` y `offset`; aplica los filtros únicamente por acción explícita del usuario y realiza una llamada por consulta.

Historial presenta cada observación física en el orden entregado por backend, incluidas las coincidencias. Ajuste POS distingue casos de SKU único y grupos compuestos usando exclusivamente `sku_count` y `sku_unico`; es una consulta de apoyo para revisión manual y no modifica POS ni `stock_actual`. Los filtros de categoría y grupo permanecen disponibles en el contrato backend, pero no se exponen en esta UI porque el bootstrap administrativo no entrega un catálogo fiable de esos IDs y no se añadieron consultas auxiliares. No se añadió acceso directo a tablas ni lógica frontend que sustituya las decisiones del backend.

## Precisiones contractuales resueltas

Las tres carencias detectadas durante la preparación frontend ya están resueltas:

1. Los grupos de `contar_detalladamente` incluyen `conteo_origen_id`, `estado_diferencia`, `stock_fisico_original` y `contado_at_original`. Para las demás vistas son anulables.
2. `rpc_solog_state/bootstrap` define cada categoría con `id`, `nombre`, `orden` y `grupos_inventariables`.
3. `rpc_solog_admin/bootstrap` define cada dispositivo pendiente con su ID, sede, solicitante y fechas de solicitud/último acceso.

El frontend puede usar `conteo_origen_id` como `conteo_id` al ejecutar `rpc_solog_count/recount`; no necesita ni debe consultar tablas privadas. No quedan cambios de Supabase pendientes para continuar el frontend.
