# SOLOG — UI Admin — Dialogs Fase 8 — Drawers V1

**Proyecto:** SOLOG  
**Estado:** CONGELADO / EN IMPLEMENTACIÓN — PRIMERA PASADA  
**Fecha:** 2026-09-20  
**Clasificación:** Nivel C — frontend + deltas backend aditivos

## 1. Autoridad y precedencia

Esta es la **fuente primaria de Fase 8 — Drawers**.

Precedencia:

1. `SOLOG_UI_Admin_Dialogs_Fase8_Drawers_V1.md` — decisiones específicas de Fase 8.
2. `SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md` — contrato global de AdminDialog no reemplazado aquí.
3. `SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md` — secuencia general del bloque.
4. Contratos backend vigentes de Admin e Incidencias — permanecen vigentes salvo los campos/acciones aditivos descritos en esta fuente.

Fase 7 permanece cerrada. La Fase 12 global continúa fuera de alcance hasta cerrar el bloque independiente de Dialogs/Modals/Drawers.

## 2. Normalización mínima previa

- `AdminDialog` mantiene únicamente `default | wide | drawer`.
- `drawer` admite un ancho máximo individual controlado por el primitive; `className` no se usa para geometría.
- ancho global máximo: 960 px.
- Desktop/Tablet dejan 48 px de contexto visible cuando el viewport lo requiere.
- Mobile `<768px`: fullscreen.
- `useAdminQuery` admite `enabled` para lecturas lazy.
- la normalización transversal agresiva se difiere hasta después de esta primera pasada.

## 3. Dashboard — Detalle diario

Ancho: **720 px**.

Orden:

1. Header con sede + fecha.
2. Selector binario:
   - Stock positivo
   - Stock 0
3. StateViews:
   - Coincide
   - Por recontar
   - Confirmadas
   - Inconsistentes
4. Tabla correspondiente al estado seleccionado.
5. Footer con paginación local solo cuando aplique + Cerrar.

### 3.1. Definición de stock

La clasificación se basa en el **conteo físico original**:

- `stock_fisico > 0` → `positive`;
- `stock_fisico = 0` → `zero`.

No existe estado físico negativo dentro del contrato funcional.

### 3.2. Delta backend desplegado

`daily_detail.items[]` añade:

```ts
stock_class: "positive" | "zero"
```

La RPC pública y `contract_version = 2` se conservan.

## 4. Control — Cronología

Ancho: **720 px**.

La tabla histórica queda reemplazada por una **línea de tiempo vertical**.

Reglas:

- quincena actual siempre visible y cargada por defecto;
- switch después del Header: `Mostrar cronología de la quincena anterior`;
- quincena anterior se solicita únicamente al activar el switch;
- al activarse, actual y anterior se muestran simultáneamente;
- orden visual: más reciente → más antiguo;
- cada evento muestra estado, teórico, físico, diferencia, valorizado y datos de valorización;
- un fallo de la quincena anterior no elimina la quincena actual;
- se elimina la navegación por quincena del Footer.

No requiere cambio backend.

## 5. Incidencias — Repeticiones

Ancho: **640 px**.

Se elimina del Drawer:

- tabla;
- JSON técnico;
- paginación;
- navegación Anterior/Siguiente.

La vista muestra un bloque directo por cada sede activa con:

- sede;
- cantidad histórica de repeticiones;
- primera detección;
- última detección;
- estado cuando existe evidencia;
- `Sin registros` cuando la sede nunca registró la familia.

### 5.1. Delta backend desplegado

Se añade lectura aditiva:

```text
rpc_solog_admin_incidents_v2
action = detail_sites
payload = { family_key }
```

Respuesta:

```ts
{
  contract_version: 2;
  generated_at: string;
  family_key: string;
  sites: Array<{
    site_id: string;
    site: string;
    occurrences: number;
    state: "pendiente" | "suprimida" | "resuelta" | null;
    active: boolean;
    first_seen_at: string | null;
    last_seen_at: string | null;
    resolved_at: string | null;
  }>;
  revisions: { incidents: number };
}
```

`detail` V2 permanece intacto para compatibilidad.

## 6. Fuera de alcance

- rediseño general de todos los Dialogs;
- limpieza agresiva de Admin CSS;
- nuevos variants de AdminDialog;
- cambio de RPC públicas o `contract_version`;
- modificación del motor de conteos;
- modificación de lógica de diferencias/reconteos;
- Fase 9+;
- Fase 12 global.

## 7. Validación esperada

Backend:
- `daily_detail` solo devuelve `positive | zero`;
- `detail_sites` devuelve una entrada por cada sede activa;
- permisos Admin/Moderador se preservan;
- advisors sin nuevo hallazgo atribuible al delta.

Frontend:
- tests dirigidos Fase 8;
- suite completa;
- lint;
- build;
- `git diff --check`;
- smoke humano en Preview para los tres Drawers.

## 8. Estado

Backend: **DESPLEGADO Y VALIDADO SINTÉTICAMENTE**.  
Frontend: **PRIMERA PASADA EN IMPLEMENTACIÓN**.  
Cierre de Fase 8: pendiente de validación técnica y smoke humano.
