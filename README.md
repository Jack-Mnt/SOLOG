# SOLOG

Plataforma web de conteo físico de inventario para Puerto Rico.

## Requisitos

- Node.js 22 o posterior
- Bun 1.3 o posterior

## Configuración local

```bash
bun install
cp .env.example .env.local
bun run dev
```

Complete en `.env.local` la URL y la clave publicable/anon de `PuertoRicoOnline`. Nunca use una clave `service_role` en esta aplicación web.

## Validación

```bash
bun run lint
bun run build
```

La aplicación recupera la sesión de Supabase Auth, obtiene el estado autorizado mediante las RPC SOLOG y dirige al usuario a la pantalla correspondiente a su rol, dispositivo y sesión activa. La inspección del backend y los cambios pendientes están en:

- [Estado actual del backend](./docs/backend-current-state.md)
- [Contrato técnico Backend V1](./docs/SOLOG_Contrato_Tecnico_Backend_V1.md)
- [Cambios requeridos en Supabase](./docs/supabase-required-changes.md)

Las llamadas a las tres RPC SOLOG, sus tipos y la normalización de errores están centralizadas en `src/features/solog/`. Los componentes no deben llamar `supabase.rpc(...)` directamente. La navegación incluye rutas protegidas para `/login`, `/`, `/device-pending`, `/count` y `/admin`.

Los flujos operativos disponibles son **Por categoría**, **Cambios recientes**, **Stock 0**, **Stock negativo** y **Contar detalladamente**. Los conteos normales guardan una cantidad por grupo mediante `save`; Contar detalladamente vuelve a contar el grupo completo mediante `recount`, usando el ID del conteo original entregado por backend. Todos recuperan la sesión tras recarga, respetan su expiración y permiten cierre completo o parcial.

El área `/admin` ofrece para `admin` y `moderador` un resumen de sedes, cobertura y sesiones activas; solicitudes de tablets; autorización con reemplazo backend; revocación; rechazo y refresco manual. También permite consultar mediante `rpc_solog_admin/report` las cinco vistas administrativas: resumen por período, conteos, diferencias, historial y apoyo para ajuste POS, con filtros explícitos y paginación. Ajuste POS es exclusivamente informativo: SOLOG no modifica el POS ni distribuye diferencias entre SKU. Exportaciones y gráficos continúan fuera del alcance actual.
