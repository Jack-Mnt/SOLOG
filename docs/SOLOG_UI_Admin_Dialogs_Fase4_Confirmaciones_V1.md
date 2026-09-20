# SOLOG — UI Admin — Dialogs Fase 4 — Confirmaciones V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — UI/UX frontend/Admin  
**Fecha:** 2026-09-19  
**Rama:** `admin-work`

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

Contexto:

- Producto;
- C. interno;
- Detectado en.

Aclaración:

`El producto no se eliminará hasta publicar el Catálogo.`

Footer:

```text
[ Cancelar ] [ Aprobar eliminación ]
```

CTA: Danger.

## 5. Dispositivos

El UUID no se muestra en el Dialog.

El flujo histórico `replace` queda eliminado de la UX.

Acciones vigentes:

### Autorizar

Título/CTA:

`Autorizar dispositivo`

Tono: Primary.

Body:

- contexto Sede;
- aclarar que la sede quedará vinculada al dispositivo autorizado.

### Revocar

Título/CTA:

`Revocar dispositivo`

Tono: Danger.

Texto:

`El dispositivo perderá autorización. La sede quedará disponible para una nueva solicitud de acceso.`

### Rechazar

Título/CTA:

`Rechazar solicitud`

Tono: Danger.

Texto:

`Se rechazará esta solicitud pendiente.`

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

## 9. Estado

> **Fase 4 — Confirmaciones V1: APROBADA Y CONGELADA.**
