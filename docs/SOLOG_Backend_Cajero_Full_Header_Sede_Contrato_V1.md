# SOLOG — Backend Cajero Full — Header sede — Contrato V1

**Estado:** APROBADO, DESPLEGADO Y VALIDADO EN LECTURA. **Frontend aún no adaptado al momento de congelar este documento.**
**Fecha:** 2026-10-28.
**Bloque:** Delta del smoke P6: mostrar `PR [sede]` en header Full.
**Fuente primaria funcional prevalente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.
**Fuente primaria específica de este delta:** este documento, subordinado a la anterior, prevalece únicamente para el nuevo objeto de sede.
**Documento UX aprobado:** `docs/SOLOG_UX_Cajero_Header_Estados_Delta_V1.md`.
**Contrato previo vigente:** `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_Full_Contrato_V1.md`, conservado salvo ampliación explícita.
**Migración remota aplicada:** `20261028093324_solog_cajero_full_site_header_v1`.
**SQL exacto en repositorio:** `supabase/migrations/20261028093324_solog_cajero_full_site_header_v1.sql`.
**Rama:** `admin-work`. `master` sin cambios.

## Decisión y forma congelada

La respuesta EXITOSA del RPC existente `public.rpc_solog_cashier_bootstrap_v6(p_payload jsonb)` para `code='CASHIER_STATE'` incluye siempre, además del resto de campos V6:

```ts
data.site: { id: string; nombre: string }
// id: UUID de la sede autorizada por el dispatcher; nombre: texto no vacío de public.sedes.nombre.
```

El backend obtiene el objeto desde `public.sedes` por el `p_site` **ya resuelto y autorizado** por el dispatcher Full, dentro de `inventario.full_cashier_state_v2`:
```sql
'site', (SELECT jsonb_build_object('id', site.id, 'nombre', site.nombre)
         FROM public.sedes site WHERE site.id = p_site)
```

Ninguna consulta frontend adicional, ningún dato tomado de `user_metadata`, ninguna reactivación del runtime V4 y ningún dato artificial para header. `data.site` debe existir tanto con sesión activa como sin sesión o con estado de recuperación, siempre que V6 retorne éxito. Los errores V6 siguen con `data=null`. La respuesta V7 y `affected_groups` **NO** cambian.

**Frontend dependiente:** tipar `FullState.site` obligatorio y validar que es objeto, `id` UUID y `nombre` cadena no vacía (trim); renderizar `<strong className="cajero-header__site">PR {view.bootstrap.site.nombre}</strong>` únicamente al disponer de V6 correcto. Durante bootstrap/error no inventar sede.

## Validación de despliegue

- `apply_migration` retornó `success=true`.
- `full_cashier_state_v2` hash MD5 posterior: `58318fd97500a2a29722206a667d1e5d` (anterior `93f1ccaba41a0c8417dc42f7f3bf769f`).
- Las 5/5 sedes devolvieron `site.id` igual a `p_site` y `site.nombre` igual al nombre real, comprobadas por invocación SQL de lectura de `full_cashier_state_v2`.
- 5/5 conservaron `operational_summary` y `groups` con sus tipos JSON; los nombres de sede no fueron impresos en el reporte.
- Hashes V6 `dd700c0b963f602d1ab0394281db5371` y V7 `700e7f813f376ab78509ba696a1b3c6c` sin cambios.
- `authenticated` no tiene EXECUTE directo en `full_cashier_state_v2`.
- No se realizaron escrituras de inventario, sesiones u observaciones. **No equivale a HTTP autenticado real ni smoke móvil.**

## Restricciones de consumo

No alterar `rpc_solog_cashier_bootstrap_v6` público, `rpc_solog_cashier_mutate_v7`, `FullRuntime` de registro, prioridad, autorización, outbox, recuperación, lógica de stock o bordes temporales. Adaptar fixtures Bun/Playwright V6 y pruebas de esquema. No añadir `site` obligatorio a variantes de mutación V7.

El ajuste permanece abierto hasta validación Bun/lint/build/browser y smoke humano del header.
