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

## Backend V2

El frontend usa Supabase Auth y únicamente `rpc_solog_state`, `rpc_solog_count` y `rpc_solog_admin`, centralizadas en `src/features/solog/api.ts`. No consulta directamente el schema privado `inventario`.

SOLOG V2 mantiene una sesión general activa por sede. Dentro de ella el cajero navega entre categorías, Stock 0 y, cuando la cobertura quincenal está completa, Cambios recientes, Stock negativo y Contar detalladamente. Las capturas regulares se conservan en `localStorage` bajo `solog.pending-counts.v2` y se transmiten con `save_batch`; los reconteos siguen siendo individuales e identifican la observación original por `detalle_id`.

La fuente de verdad sobre sesión, snapshot, coberturas, categorías pendientes, autorización y roles siempre es el backend. El temporizador usa `server_now` para compensar el reloj local y representa la vigencia del Excel, no la duración calculada desde el inicio de sesión.

Documentación:

- [Estado actual del backend](./docs/backend-current-state.md)
- [Contrato técnico Backend V2](./docs/SOLOG_Contrato_Tecnico_Backend_V2.md)
- [Contrato V1 obsoleto](./docs/SOLOG_Contrato_Tecnico_Backend_V1.md)
- [Cambios requeridos en Supabase](./docs/supabase-required-changes.md)
- [Identidad visual SOLOG](./docs/Identidad_visual_SOLOG.md)

## Validación

```bash
bun run lint
bun run build
```

El proyecto no define actualmente un script automatizado de tests.

El área `/admin` conserva resumen, dispositivos y los cinco reportes: resumen por período, conteos, diferencias, historial y apoyo para ajuste POS. Ajuste POS es informativo; SOLOG no modifica el POS ni distribuye diferencias entre SKU.
