# SOLOG — Backend: limpieza de helpers y RPC legacy admin — V1

## Clasificación
Nivel B — limpieza backend dirigida y acotada.

## Estado
Decisión aprobada para implementación.

## Fuente primaria
Este documento es la fuente primaria de este bloque independiente de limpieza backend.
Prevalece únicamente para el alcance descrito aquí. No modifica contratos funcionales vigentes fuera de este bloque.

## Baseline
- Rama de trabajo documental/frontend: `admin-work`.
- HEAD al congelar este bloque: `62eebe76996f9036025bef0e8651a65e52e27290`.
- `master` ya contiene el corte que migró Catálogo a V4; la verificación previa confirmó ausencia de consumidores frontend actuales de las RPC públicas Catálogo V3.
- Backend objetivo: proyecto Supabase `fvtohxvcvsflzmftgfzs`.

## Alcance aprobado
Eliminar exclusivamente estas funciones:

1. `public.rpc_solog_admin_catalog_read_v3(text, jsonb)`
2. `public.rpc_solog_admin_catalog_v3(text, jsonb)`
3. `inventario.solog_admin_legacy(text, jsonb)`
4. `inventario.solog_admin_inc_catalog(text, jsonb)`

## Condición previa obligatoria
Inmediatamente antes de eliminar:
- confirmar que las cuatro funciones existen;
- confirmar ausencia de callers SQL, triggers, cron y Edge Functions;
- no usar `CASCADE`;
- detener la implementación si aparece una dependencia nueva.

## Fuera de alcance
No modificar ni eliminar en este bloque:
- helpers internos Catálogo V2/V3 consumidos por V4;
- Master V2 y sus helpers;
- Groups Read V1;
- branches `control_page` / `control_detail` de `rpc_solog_operational_v2`;
- Cajero, Detalles o ConeXion;
- tablas, columnas, datos históricos, índices, secuencias, triggers, RLS/policies, grants generales, cron, Storage o Edge Functions;
- frontend.

## Validación requerida
Después de la eliminación:
1. comprobar que las cuatro funciones ya no existen;
2. comprobar que Catálogo V4 público e interno sigue existiendo;
3. comprobar que Incidencias V2 sigue existiendo;
4. comprobar que Groups V1 vigente sigue existiendo;
5. comprobar que RPC/funciones ConeXion siguen existiendo;
6. revisar dependencias rotas detectables en catálogo PostgreSQL;
7. registrar el bloque como cerrado antes de retomar la limpieza frontend.

## Siguiente bloque
La limpieza frontend será independiente y deberá retirar primero consumidores/transporte legacy antes de autorizar nuevas eliminaciones backend:
- Master V2 residual;
- Groups Read V1 residual;
- tipos/validadores/branches legacy de Control.
