# SOLOG — UI Admin — Dialogs Fase 4 — Confirmaciones V1

**Proyecto:** SOLOG  
**Estado:** CERRADA · VALIDADA TÉCNICA Y VISUALMENTE  
**Clasificación:** Nivel B — UI/UX frontend/Admin  
**Fecha:** 2026-09-19  
**Rama:** `admin-work`

## Reconciliación posterior — 2026-09-26

La decisión UX de esta fuente quedó alineada también con backend:

```text
replace → retirado
```

El wrapper `public.rpc_solog_admin_devices_v2` ya no acepta `replace`.

Acciones runtime vigentes:

```text
list
authorize
revoke
reject
```

El reemplazo funcional permanece como flujo explícito:

```text
revocar dispositivo actual
→ sede disponible
→ nueva solicitud
→ autorizar
```

Para el inventario backend actual prevalece `SOLOG_Backend_Contratos_Runtime_Actual_V2.md`.

## 1. Fuentes relacionadas

Este documento complementa:

- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`
- `docs/SOLOG_Logica_Admin_Cambios_Catalogo_Origen_Manual_Autoaprobacion_V1.md`

## 2. Patrón visual común

Las confirmaciones simples de Fase 4 usan:

```text
Header
Body
  ├── explicación / consecuencia
  ├── contexto estructurado
  └── notice solo para feedback, warning o error
Footer
  ├── Cancelar
  └── Acción principal
```

El Body utiliza composición compacta con separación uniforme.

El contexto se representa mediante una superficie discreta con:

- borde estándar;
- `var(--color-surface-secondary)`;
- radius 8 px;
- pares `dt/dd`;
- dos columnas en Desktop/Tablet;
- una columna en Mobile.

No se crea todavía una nueva primitive `ConfirmationDialog`.

Regla visual:

- explicación secundaria simple → párrafo normal del Body;
- consecuencia operativa importante que conviene destacar → `AdminNotice tone="info"`;
- warning, error y feedback asíncrono conservan sus tonos correspondientes;
- los notices informativos dentro de confirmaciones usan tipografía ligeramente más compacta (`0.8125rem`) para mantener jerarquía sin competir con el contexto principal.

## 3. Ignorar incidencia durante 30 días

Título:

`Ignorar incidencia durante 30 días`

Header secundario:

`Tipo · C. interno`

Body:

- explicar que dejará de aparecer como pendiente;
- contexto:
  - Alcance → Todas las sedes;
  - Duración → 30 días;
- aclaración:
  - `Ignorar no resuelve ni elimina la incidencia.`

Footer:

```text
[ Cancelar ] [ Ignorar 30 días ]
```

CTA: Primary, no Danger.

## 4. Aprobar eliminación

Título:

`Aprobar eliminación`

Descripción:

`El cambio quedará aprobado y listo para incluirse en la próxima publicación del Catálogo.`

Body:

1. `AdminNotice tone="info"` encima del contexto:
   - `El producto no se eliminará hasta publicar el Catálogo.`
2. Contexto:
   - Producto;
   - C. interno;
   - Detectado en.
3. Error, si existe.

Footer:

```text
[ Cancelar ] [ ⊘ Aprobar eliminación ]
```

CTA: Danger con icono `CircleOff`.

## 5. Dispositivos

El UUID no se muestra en el Dialog.

El flujo histórico `replace` queda eliminado de la UX.

Acciones vigentes:

### Autorizar

Título/CTA:

`Autorizar dispositivo`

Tono: Primary.

Body:

1. `AdminNotice tone="info"` encima del contexto:
   - `La sede quedará vinculada a este dispositivo autorizado.`
2. Contexto:
   - Sede.

### Revocar

Título/CTA:

`Revocar dispositivo`

Tono: Danger.

Body:

1. `AdminNotice tone="info"` encima del contexto:
   - `El dispositivo perderá autorización. La sede quedará disponible para una nueva solicitud de acceso.`
2. Contexto:
   - Sede.

### Rechazar

Título/CTA:

`Rechazar solicitud`

Tono: Danger.

Body:

1. `AdminNotice tone="info"` encima del contexto:
   - `Se rechazará esta solicitud pendiente.`
2. Contexto:
   - Sede.

## 6. Aprobar exclusión

Título:

`Aprobar exclusión`

Descripción:

`El cambio quedará aprobado y listo para incluirse en la próxima publicación del Catálogo.`

Body:

- notice informativo:
  - el cambio queda aprobado;
  - el producto no cambia hasta publicar;
- contexto:
  - Producto;
  - C. interno;
  - Estado actual;
  - Grupo.

Se elimina `Modalidad`.

Footer:

```text
[ Cancelar ] [ Aprobar exclusión ]
```

CTA: Danger.

## 7. Aprobar reincorporación

Título:

`Aprobar reincorporación`

Descripción:

`El cambio quedará aprobado. Antes de publicarlo deberá completarse la configuración necesaria del producto.`

Body:

- mismo patrón de contexto que Exclusión;
- sin campo Modalidad.

Footer:

```text
[ Cancelar ] [ Aprobar reincorporación ]
```

CTA: Primary.

La reincorporación aprobada debe quedar disponible inmediatamente en Configuración pendiente sin requerir un refetch adicional.

## 8. Regla semántica

```text
Acción temporal/reversible         → Primary
Intención destructiva              → Danger
Acción restaurativa                → Primary
Revocar/rechazar autorización      → Danger
```

## 9. Cierre y validación

La Fase 4 queda cerrada sobre la implementación corregida después del smoke humano.

Las correcciones realizadas durante el smoke se consideran parte autoritativa de la composición final, en particular:

- los mensajes operativos relevantes usan `AdminNotice tone="info"` encima del bloque de contexto;
- `Aprobar eliminación` conserva tono Danger e icono `CircleOff`;
- los notices informativos de confirmación usan tipografía compacta para mantener jerarquía;
- el flujo de dispositivos no ofrece reemplazo ni muestra UUID;
- exclusión, reincorporación y eliminación manual conservan la semántica de autoaprobación congelada;
- `Modalidad` permanece eliminada del Dialog de estado de producto.

Estado de cierre:

- validación técnica: ✅ aprobada;
- smoke funcional: ✅ aprobado;
- validación visual: ✅ aprobada;
- composición responsive: ✅ aprobada;
- decisiones funcionales relacionadas: ✅ congeladas.

Baseline de cierre observado en `admin-work`:

`c5bebcc50aff7030bcdacac1a1ab87e27c059f33`

> **Fase 4 — Confirmaciones V1: CERRADA Y VALIDADA.**
