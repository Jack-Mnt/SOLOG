# SOLOG — UI Admin — Drawers Fase 8.2A — Composición V1

**Proyecto:** SOLOG  
**Estado:** CONGELADO PARA IMPLEMENTACIÓN / PROTOTIPO FRONTEND  
**Fecha:** 2026-09-21  
**Clasificación:** Nivel B — composición frontend, sin cambios backend

## 1. Autoridad y precedencia

Esta fuente es el **delta primario de Fase 8.2A**.

Precedencia para el alcance cubierto:

1. `SOLOG_UI_Admin_Drawers_Fase8_2A_Composicion_V1.md`
2. `SOLOG_UI_Admin_Dialogs_Fase8_Drawers_V1.md`
3. `SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
4. `SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`

Todo lo no reemplazado explícitamente por este delta permanece vigente.

## 2. Objetivo

Realizar una segunda pasada visual sobre los tres Drawers de Fase 8 para:

- reducir ancho innecesario;
- aumentar densidad vertical;
- mostrar únicamente la información útil para cada estado;
- validar visualmente la composición antes de diseñar el contrato backend optimizado de Fase 8.2B.

No se modifica backend en 8.2A.

## 3. Detalle diario

Ancho objetivo inicial: **620 px**.

Se conserva:

- selector `Stock positivo | Stock 0`;
- StateViews;
- paginación local;
- contrato `daily_detail` actual.

Las tablas cambian según estado:

- **Coincide:** `Grupo | Stock`.
- **Por recontar:** `Grupo | Físico | Diferencia`.
- **Confirmados:** `Grupo | Diferencia | Valorizado`.
- **Inconsistentes:** `Grupo | Teórico | Diferencia inicial | Diferencia encontrada`.

El estado interno `Confirmada` no cambia; solo su etiqueta UI pasa a **Confirmados**.

### 3.1. Placeholder temporal de Inconsistentes

Hasta Fase 8.2B:

- `Diferencia encontrada = difference`;
- `Diferencia inicial = -difference`.

Este artificio es exclusivamente visual para evaluar composición.

No debe:

- persistirse;
- exportarse;
- alimentar cálculos;
- asumirse como dato autoritativo;
- sobrevivir a la implementación del contrato backend definitivo.

## 4. Cronología

Ancho objetivo inicial: **560 px**.

Reglas:

- mantener quincena actual cargada por defecto;
- mantener carga lazy de quincena anterior;
- simplificar el control a `Quincena anterior + switch`;
- agrupar eventos visualmente por fecha;
- mostrar la fecha una sola vez por grupo diario;
- sustituir tarjetas amplias por filas compactas de cronología;
- eliminar datos repetidos de precio/unidad/paquete;
- conservar orden más reciente → más antiguo.

Métricas visibles por estado:

- **Coincide:** Stock.
- **Por recontar:** Físico + Diferencia.
- **Confirmado:** Diferencia + Valorizado.
- **Inconsistente:** Teórico + Inicial + Encontrada.
- **Recontado:** Físico + Diferencia mientras exista como evento específico del contrato actual.

Para Inconsistente se usa el mismo placeholder temporal de signo invertido definido en 3.1.

## 5. Incidencias — Repeticiones

Ancho objetivo inicial: **520 px**.

Se conserva la lectura agregada `detail_sites`.

Composición:

- sede a la izquierda;
- cantidad de repeticiones a la derecha cuando exista;
- para cero ocurrencias mostrar únicamente `Sin registros`;
- para ocurrencias mostrar en una sola línea compacta:
  - primera detección;
  - flecha temporal;
  - última detección;
  - estado.

Se elimina la redundancia visual `0 veces + Sin registros`.

## 6. Fuera de alcance de 8.2A

- cambios Supabase;
- nuevos campos RPC;
- optimización de egress;
- modificación de `contract_version`;
- eliminación de fallbacks de compatibilidad;
- cambios del motor de diferencias;
- Fase 8.2B;
- Fase 9+;
- Fase 12 global.

## 7. Próximo paso: Fase 8.2B

Solo después del smoke visual de 8.2A se definirá el contrato backend mínimo.

Objetivos previstos de 8.2B:

- exponer diferencias inicial/encontrada reales;
- evitar transferir columnas que la UI no usa;
- evaluar filtrado/paginación server-side por stock y estado;
- reducir payload y egress de `daily_detail`;
- revisar `control_chronology` contra la composición finalmente aprobada.

## 8. Validación esperada

Frontend:

- test dirigido de Fase 8;
- suite completa;
- lint;
- build;
- `git diff --check`;
- smoke humano de los tres Drawers en Preview.

La aprobación visual puede ajustar los anchos objetivo sin cambiar la semántica funcional de este delta.
