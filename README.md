# SOLOG

Plataforma web de conteo físico de inventario para Puerto Rico.

## Requisitos y configuración

- Node.js 22 o posterior
- Bun 1.3 o posterior

```bash
bun install
cp .env.example .env.local
bun run dev
```

Complete `.env.local` con la URL y la clave publicable/anon de `PuertoRicoOnline`. Nunca use una clave `service_role` en esta aplicación web.

## Arquitectura actual

SOLOG usa Supabase Auth y contratos backend V2 con `contract_version = 2`. El frontend no consulta directamente el schema privado `inventario`.

Superficies principales vigentes:

- `rpc_solog_route_v2`
- `rpc_solog_cashier_bootstrap_v2`
- `rpc_solog_cashier_mutate_v2`
- `rpc_solog_cashier_history_v2`
- `rpc_solog_details_v2`
- `rpc_solog_admin_bootstrap_v2`
- `rpc_solog_operational_v2`
- `rpc_solog_control_export_v2`
- `rpc_solog_admin_master_read_v2`
- `rpc_solog_admin_master_v2`
- `rpc_solog_admin_incidents_v2`
- `rpc_solog_admin_devices_v2`
- publicación de catálogo mediante Edge `conexion-admin` y contratos de publicación vigentes.

Las antiguas RPC genéricas V1 fueron retiradas durante S10 y ya no forman parte del contrato.

## Cajero

El Cajero utiliza una sesión congelada por sede basada en snapshot, catálogo, grupos, teóricos y precios autoritativos del backend.

Las mutaciones vigentes son:

- `start`
- `save_batch`
- `recount_save_batch`
- `finish`

Los conteos y reconteos pendientes se mantienen en memoria hasta su envío; no se usa persistencia operativa en `localStorage` o `sessionStorage`.

La expiración de captura y la entrega pendiente están separadas. Al llegar a `expira_at` se bloquea nueva captura, pero una sesión puede entrar en Recovery y entregar borradores válidos hasta `recovery_until`. El backend conserva timestamps originales y valida que `contado_at <= expira_at`.

El Motor V3 y los estados finales de diferencia son responsabilidad del backend.

## Detalles

`/detalles` consume `rpc_solog_details_v2` para:

- resumen;
- historial paginado;
- detalle bajo demanda;
- exportación;
- solicitud de acceso del dispositivo.

## Administración

`/admin` organiza:

- Dashboard
- Control
- Incidencias
- Catálogo
- Grupos
- Dispositivos

Admin consume contratos V2 dedicados. Control concentra la trazabilidad y exportación administrativa. SOLOG no modifica directamente el stock del POS.

La publicación de catálogo se realiza mediante `conexion-admin`; el navegador no posee privilegios `service_role`.

## Compatibilidad

Las rutas `/count` y `/cajero/seguimiento` continúan reconocidas como compatibilidad activa. No deben confundirse con código legacy eliminado.

## Documentación vigente

Orden de referencia principal:

1. [Contrato backend V9](./docs/SOLOG_Backend_Contratos_Optimizacion_Global_V9.md)
2. [Decisiones congeladas de optimización global](./docs/SOLOG_Decisiones_Congeladas_Optimizacion_Global.md)
3. [Alcance y cierre de limpieza legacy S10](./docs/SOLOG_Arquitectura_Limpieza_Legacy_S10_V1.md)
4. [Cierre S10](./docs/SOLOG_Refactor_Limpieza_Legacy_S10_Cierre_V1.md)

`SOLOG_Backend_Contratos_Optimizacion_Global_V8.md` y versiones anteriores se conservan como documentación histórica/heredada según la precedencia declarada en V9.

`SOLOG_Plan_Implementacion_Optimizacion_Global.md` se conserva como plan histórico de la migración y optimización ejecutada; no debe utilizarse como descripción del runtime actual cuando contradiga V9 o este README.

## Validación

```bash
bun test
bun run lint
bun run build
```

La validación final de S10-B cerró con:

- 269 tests aprobados;
- 16/16 browser runners aprobados;
- lint aprobado;
- typecheck/build aprobados;
- `git diff --check` aprobado;
- cero superficies RPC/actions legacy en `src` y chunks de producción.
