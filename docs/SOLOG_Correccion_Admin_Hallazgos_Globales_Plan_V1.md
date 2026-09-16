# SOLOG — Corrección Admin — Hallazgos Globales — Plan V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel C — plan de corrección transversal Admin  
**Fecha:** 2026-09-16

## 1. Propósito

Este documento congela el plan acordado para corregir los hallazgos detectados en la revisión global de SOLOG/Admin.

No autoriza ampliar alcance ni reinterpretar los documentos primarios de cada bloque.

## 2. Fuentes primarias por bloque

1. **Bloque 1 — Lógica crítica de Incidencias**  
   `docs/SOLOG_Logica_Incidencias_Acciones_Globales_V1.md`

2. **Bloque 2 — Supresión multisede**  
   `docs/SOLOG_UX_Incidencias_Supresion_Multisede_V1.md`

3. **Bloque 3 — AdminDialog**  
   `docs/SOLOG_UX_AdminDialog_Gestion_Foco_V1.md`

4. **Bloque 4 — Feedback Admin**  
   `docs/SOLOG_UX_Admin_Feedback_Mutaciones_V1.md`

5. **Bloque 5 — UI/consistencia**  
   `docs/SOLOG_UI_Admin_Correcciones_Consistencia_V1.md`

Todo lo no reemplazado explícitamente por estos documentos continúa vigente.

## 3. Orden obligatorio

```text
1. Incidencias — lógica crítica
2. Incidencias — supresión multisede
3. AdminDialog — UX/accesibilidad
4. Feedback Admin
5. UI/CSS y utilidades
6. Revisión global final
```

No se avanza al bloque siguiente con fallos técnicos abiertos del bloque actual.

## 4. Bloque 1 — ejecución

### Backend primero

1. Actualizar `rpc_solog_admin_incidents_v2` para exponer `revisions.incidents_global` en `summary`.
2. Desplegar en Supabase.
3. Validar contrato y revisiones.
4. Congelar como contrato desplegado antes de tocar consumidores frontend.

### Frontend después

Implementar:
- Ignorar global;
- Reactivar global;
- detalle multisede real;
- selección de fuente Pendiente para `propose_delete`;
- coherencia global de `deletion_proposed`;
- cierre/actualización correcta del modal;
- notices aprobados.

Codex no debe modificar backend en este bloque salvo instrucción explícita posterior.

## 5. Bloque 2

Aplicar exclusivamente la presentación derivada de la semántica global:
- una sola acción Ignorar;
- una sola acción Reactivar;
- una sola fecha `Ignorada hasta`;
- copy explícito de alcance en todas las sedes.

No crear lógica paralela por sede.

## 6. Bloque 3

Centralizar en `AdminDialog`:
- topmost Escape;
- backdrop topmost;
- focus trap;
- foco inicial;
- restauración de foco;
- comportamiento correcto de nested dialogs.

Retirar traps locales únicamente cuando queden demostrablemente redundantes.

## 7. Bloque 4

Normalizar feedback:
- una superficie por mutación;
- no mostrar `operation_id`;
- identidad de notice por ocurrencia;
- retry idempotente;
- eliminar duplicación de Dispositivos.

## 8. Bloque 5

Correcciones acotadas:
- aislar la excepción visual de Dashboard;
- retirar su uso accidental en Control;
- corregir fallback de abreviaturas;
- preservar deliberadamente el código de Incidencias sin prefijo.

## 9. Validación por bloque

Al finalizar cada bloque:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Además:
- ejecutar tests dirigidos del bloque;
- revisar archivos modificados;
- confirmar que no hubo backend/frontend fuera de alcance;
- realizar smoke humano cuando el bloque afecte interacción visible.

Los resultados deben considerarse evidencia; un paso no ejecutado no se marca como validado.

## 10. Revisión global final

Después del Bloque 5:

- revisar nuevamente todo SOLOG/Admin;
- comprobar interacciones entre Incidencias, dialogs, notices y estilos compartidos;
- ejecutar suite completa;
- ejecutar smoke dirigido de:
  - Dashboard;
  - Control;
  - Catálogo;
  - Productos;
  - Grupos;
  - Incidencias;
  - Dispositivos;
- confirmar ausencia de regresiones sobre Cajero/Detalles cuando compartan primitives o stores;
- cerrar explícitamente el bloque global.

## 11. Reglas para implementación

- preservar cambios preexistentes;
- no hacer refactors generales no relacionados;
- no modificar backend desde Codex;
- si Codex detecta necesidad backend adicional, detenerse y devolver el bloqueo a ChatGPT;
- cualquier desviación de una fuente primaria requiere nueva decisión antes de implementarse;
- ideas no bloqueantes van al backlog.

## 12. Estado

> **Plan global aprobado y congelado.**

El siguiente paso autorizado es iniciar el **Bloque 1**, empezando por backend y contrato antes de implementar frontend.
