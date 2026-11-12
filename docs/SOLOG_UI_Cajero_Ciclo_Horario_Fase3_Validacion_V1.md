# SOLOG — UI Cajero — Ciclo horario — Validación Fase 3 V1

**Estado:** FASE 3 IMPLEMENTADA Y CERRADA TÉCNICAMENTE. Smoke humano con snapshot real: **PENDIENTE**.
**Fecha:** 2026-11-12.
**Rama:** `admin-work`; baseline anterior `66332297ee02c0b0164d6d0c03e860e0dd917000`.
**HEAD de código validado:** `d005635b07a610d016cfe3e5ced4c493ffd46fe9`.

## Precedencia y alcance

- **Fuente primaria funcional congelada:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
- **Contrato de consumo backend desplegado:** `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`.
- **Delta de activación aprobado:** `docs/SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md`; el servidor continúa en `required`, sin ruta `dual`.
- Este reporte describe evidencia implementada; **no redefine** el bloque funcional ni sustituye contratos backend.
- Fuera de alcance Fase 3: refactor de Motor, Supabase, prioridad, B5 de batches, historiales y Admin.

## Cambios implementados

1. `full.start-gate.ts`: la compuerta local usa `start_offer` V3 y reloj confiable; admite inicio antes de HH:57 con margen >=180 s y bloquea ofertas de ciclos obsoletos, ausentes, indisponibles o con plazo insuficiente. No clasifica generación desde `stock.is_fallback`.
2. `full.app.tsx`: inicio directo `new` mediante oferta explícita; `fallback` abre confirmación humana; se eliminó polling de 8 s y mensajes HH:59–HH+1:02; consulta V6 puntual al cambiar de hora sin interferir con recuperación de pendientes, reconexión ni KPI.
3. `full.start-dialog.tsx`: diálogo accesible de respaldo con `Esperar 30 segundos (Recomendado)`, `Utilizar inventario válido` y `Cancelar`. El foco se contiene y restaura; el modal desaparece cuando la oferta deja de coincidir con V6.
4. Espera voluntaria: se mide por timestamp absoluto del reloj sincronizado; **una consulta V6** tras 30 segundos; no hay V7 automático ni polling del respaldo. Al reanudar pestaña suspendida se evalúa el plazo efectivamente transcurrido.
5. `cajero.css`: estilos acotados del diálogo que reutilizan tokens existentes, geometría adaptativa y estilos focus-visible.
6. Tests de guardia V3 y ampliación del smoke real Chromium para `new`, `fallback`, espera, referencia obsoleta, autorización y teclado.

## Validación ejecutada

**Evidencia GitHub Actions:** [SOLOG Cajero Full V3 — ejecución 43164566797](https://github.com/Jack-Mnt/SOLOG/actions/runs/43164566797).

| Validación | Evidencia | Resultado |
|---|---|---|
| Tests dirigidos Full | `bun test` sobre 6 archivos | **60 pass / 0 fail** |
| Suite global | `bun test` | **867 pass / 0 fail** (96 archivos) |
| Lint | `bun run lint` | **PASS** |
| Typecheck y build | `bun run build` | **PASS** |
| Diferencias | `git diff --check` | **PASS** |
| Chromium Full simulado | `bun tests/cajero-full.browser.mjs` | **34 escenarios PASS**, 0 fallos |
| Salida de red navegador | Intercepción de solicitudes a hosts no permitidos | **0 solicitudes externas** |

Los escenarios V3 incluyen seis pruebas específicas:
- inicio `new` sin modal con UUID/referencia;
- respaldo con aceptación humana y navegación por teclado;
- cierre inmediato de modal si V6 sustituye referencia;
- espera de 30 s, una sola nueva lectura V6, sin V7 espontáneo;
- rechazo del inicio si referencia cambia entre oferta y revalidación;
- bloqueo sin oferta elegible.

El smoke de navegador utiliza V6/V7 simuladas, **no** datos reales, RPC de producción ni dispositivos operativos.

## Estado de cierre y siguiente bloque

**Cierre técnico de Fase 3 aprobado por evidencia de CI.** No se ha ejecutado smoke humano real ni un inicio exitoso en Supabase con snapshot fresco. El sistema permanece cerrado hasta completar Fase 4 (resolución de conflictos B5), validación global Fase 5 y smoke operativo antes de reapertura.

En Fase 4, no modificar backend mediante frontend: cualquier incompatibilidad real de RPC, schema o Motor regresa a ChatGPT para corrección y validación independiente.
