# SOLOG — UI Admin — Dialogs — Normalización de Formato y Kind V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO PARA IMPLEMENTACIÓN  
**Fecha:** 2026-09-24  
**Clasificación:** Nivel B — frontend transversal / UI-UX Admin  
**Rama:** `admin-work`  
**Baseline de Fase 9.2:** `17c73d62788081a7525c579488705fcc158b9c63`

## 1. Propósito

Esta fuente congela la normalización transversal de `AdminDialog` aprobada para la Fase 9.

La normalización separa explícitamente tres responsabilidades:

1. **Formato** — Dialog centrado o Drawer lateral.
2. **Tamaño** — geometría del Dialog centrado.
3. **Kind** — naturaleza/composición semántica del Dialog.

El objetivo es reducir variantes accidentales, eliminar composición repetida y mantener una API clara sin reabrir foco, stack, Escape, backdrop, scroll lock, contratos backend ni lógica de negocio.

## 2. Autoridad y precedencia

Esta es la **fuente primaria de Fase 9** para:

- API pública de `AdminDialog` cubierta por esta normalización;
- separación `format / size / kind`;
- semántica de Drawers;
- `kind="confirmation"`, `kind="task"` y `kind="management"`;
- reglas de Footer;
- reglas de Button e IconButton dentro de Dialogs/Drawers;
- delta de geometría de Detalle de propuesta;
- plan de implementación revisado de Fase 9.

Precedencia para este alcance:

1. `docs/SOLOG_UI_Admin_Dialogs_Normalizacion_Formato_Kind_V1.md`
2. `docs/SOLOG_UI_Admin_Drawers_Fase8_2A_Composicion_V2.md`
3. `docs/SOLOG_UI_Admin_Dialogs_Fase7_Catalogo_Nesting_V1.md`
4. `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
5. `docs/SOLOG_UX_AdminDialog_Gestion_Foco_V1.md`
6. `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`

Esta fuente reemplaza únicamente los puntos que redefine de manera explícita.

La composición funcional previamente aprobada de cada consumidor permanece vigente salvo los deltas concretos de esta fuente.

## 3. Estado previo

Fase 9.1 completó el preflight transversal y confirmó:

- una sola primitive modal Admin: `AdminDialog`;
- geometría actual mezclada bajo `variant="default" | "wide" | "drawer"`;
- confirmaciones repetidas en múltiples módulos;
- patrón `.admin-dialog-confirmation` ya existente;
- patrón `.admin-dialog-task` ya existente;
- Dialogs de gestión con comportamiento local distinto de una tarea puntual;
- cuatro superficies que conceptualmente son drill-down/detalle;
- Footer y botón `Cerrar` actualmente sobregeneralizados;
- repetición de Buttons de acción con copys y uso de iconos no completamente normalizados.

No se detectó motivo para reabrir la infraestructura de foco, stack, inert, Escape, backdrop o scroll lock.

---

# 4. Modelo normalizado de AdminDialog

## 4.1. Formato

Se congela:

```ts
type AdminDialogFormat =
  | "dialog"
  | "drawer";
```

Semántica:

- `dialog` → modal centrado;
- `drawer` → superficie lateral de detalle / drill-down.

Valor por defecto:

```text
format = "dialog"
```

## 4.2. Tamaño

El tamaño aplica únicamente a `format="dialog"`.

```ts
type AdminDialogSize =
  | "default"
  | "wide";
```

Valor por defecto:

```text
size = "default"
```

Geometría vigente:

- `default` → máximo 560 px;
- `wide` → máximo 820 px.

No se cambia la geometría ya validada por esta normalización.

## 4.3. Kind

Se congela:

```ts
type AdminDialogKind =
  | "confirmation"
  | "task"
  | "management";
```

`kind` aplica únicamente a `format="dialog"`.

No se crea:

```text
kind="detail"
```

porque el concepto de detalle/drill-down queda absorbido por `format="drawer"`.

`kind` puede permanecer ausente para un caso verdaderamente genérico. Los consumidores actuales deben clasificarse cuando exista una categoría real; no se debe inventar un kind solo para evitar un valor vacío.

## 4.4. Contrato TypeScript objetivo

La API final debe impedir combinaciones inválidas conceptualmente equivalentes a:

```ts
type AdminDialogLayoutProps =
  | {
      format?: "dialog";
      size?: "default" | "wide";
      kind?: "confirmation" | "task" | "management";
      drawerMaxWidth?: never;
    }
  | {
      format: "drawer";
      size?: never;
      kind?: never;
      drawerMaxWidth?: number;
    };
```

La forma exacta de integración con el resto de props puede adaptarse durante Fase 9.3, pero las combinaciones permitidas quedan congeladas.

Son inválidos conceptualmente:

```tsx
<AdminDialog format="drawer" size="wide" />
<AdminDialog format="drawer" kind="confirmation" />
<AdminDialog format="dialog" drawerMaxWidth={620} />
```

## 4.5. Retiro de variant

La API objetivo deja de utilizar:

```ts
variant = "default" | "wide" | "drawer"
```

y la sustituye por:

```text
format + size + kind
```

No debe quedar un alias legacy permanente de `variant` al cerrar Fase 9.

Durante la implementación puede existir una migración transitoria dentro de una fase/commit si reduce riesgo, pero el estado final debe tener una sola API autoritativa.

---

# 5. Formato Drawer

## 5.1. Semántica

`format="drawer"` representa superficies predominantemente de:

- drill-down;
- inspección contextual;
- historial;
- detalle operativo;
- detalle de una entidad o agrupación.

Puede contener acciones, pero su propósito primario no es completar un formulario.

## 5.2. Geometría global

Se conserva el contrato ya validado:

- anclado a la derecha;
- alto completo;
- sin border-radius;
- máximo global 960 px;
- Desktop/Tablet deja contexto visible cuando corresponda;
- Mobile <768 px → fullscreen;
- transición y reduced-motion ya congelados;
- Header/Footer fijos;
- Body como región principal scrollable.

`drawerMaxWidth` continúa permitiendo anchos individuales sin superar 960 px.

## 5.3. Inventario Drawer objetivo

| Superficie | Formato objetivo | Ancho |
|---|---|---:|
| Incidencias · Repeticiones | `drawer` | 520 px |
| Control · Cronología | `drawer` | 560 px |
| Dashboard · Detalle diario | `drawer` | 620 px |
| Catálogo · Detalle de propuesta | `drawer` | 720 px |

Los anchos 520/560/620 px permanecen congelados por sus fuentes previas.

El ancho de Detalle de propuesta queda congelado en **720 px** por decisión aprobada al iniciar la implementación de 9.4. Respeta el máximo global de 960 px y deja 48 px de contexto a 768 px de viewport.

## 5.4. Delta — Detalle de propuesta

Se aprueba y congela el cambio:

```text
antes: variant="wide"
ahora: format="drawer"
```

Este delta reemplaza únicamente su geometría/presentación como superficie.

Permanecen vigentes de Fase 7, salvo normalizaciones transversales explícitas de esta fuente:

- identidad de producto;
- tipo/estado;
- cambio actual → nuevo;
- contexto operativo;
- notices;
- estados/bloqueos;
- acciones disponibles;
- flujos nested;
- lógica funcional;
- contratos frontend/backend.

Flujos resultantes:

```text
Catálogo
└── Drawer · Detalle de propuesta
    └── Dialog · Configurar producto
```

```text
Catálogo
└── Drawer · Detalle de propuesta
    └── Dialog wide · Resolver precio
        └── Dialog · Configuración de valorizado
```

No se crea infraestructura nueva para nesting.

---

# 6. Kind confirmation

## 6.1. Propósito

`kind="confirmation"` representa una decisión puntual que requiere confirmar intención y/o comprender una consecuencia antes de ejecutar una acción.

Patrón conceptual:

```text
Header
Body
  explicación / consecuencia
  contexto opcional
  notice opcional
  feedback opcional
Footer
  Cancelar
  Acción
```

## 6.2. Composición

La primitive debe poder aportar la composición base de confirmación sin exigir al consumidor un wrapper manual equivalente a:

```tsx
<div className="admin-dialog-confirmation">
```

Objetivo:

- ritmo vertical compacto;
- explicación directa;
- `admin-dialog-context` cuando exista contexto estructurado;
- `AdminNotice` para info/warning/error;
- feedback asíncrono en la misma jerarquía;
- acción global en Footer.

La implementación exacta de clases pertenece a 9.3/9.5A.

## 6.3. Semántica de acción

Se conserva:

- temporal/reversible → Primary;
- restaurativa → Primary;
- destructiva/terminal → Danger;
- revocar/rechazar autorización → Danger.

## 6.4. Inventario confirmation

| Superficie | Tamaño |
|---|---|
| Dispositivos · Autorizar | `default` |
| Dispositivos · Revocar | `default` |
| Dispositivos · Rechazar | `default` |
| Incidencias · Ignorar 30 días | `default` |
| Incidencias · Aprobar eliminación | `default` |
| Productos · Aprobar exclusión | `default` |
| Productos · Reincorporación / entrada a configuración | `default` |
| Categorías · Descartar cambios de orden | `default` |
| Integrantes · Separar producto | `default` |
| Catálogo · Descartar propuesta | `default` |

Todos usan:

```text
format="dialog"
kind="confirmation"
```

---

# 7. Kind task

## 7.1. Propósito

`kind="task"` representa una operación en la que el usuario debe revisar, introducir o seleccionar información para completar una tarea.

Incluye formularios y workflows. No se crean kinds separados como:

- `form`;
- `workflow`;
- `review`.

Patrón conceptual:

```text
Header
Body
  contexto
  campos / controles / secciones
  notices
  feedback
Footer
  acción secundaria cuando aplique
  acción principal
```

## 7.2. Composición

La primitive debe aportar el ritmo base actualmente repetido por `.admin-dialog-task`, evitando wrappers manuales cuando no agregan semántica propia.

No debe forzar una grilla interna única: cada tarea conserva los campos, secciones y layouts aprobados en su fuente individual.

## 7.3. Inventario task

| Superficie | Tamaño |
|---|---|
| Descargar ajuste | `default` |
| Editar grupo | `default` |
| Configuración de valorizado | `default` |
| Configurar producto | `default` |
| Crear grupo | `wide` |
| Resolver precio | `wide` |
| Publicar catálogo | `wide` |

Todos usan:

```text
format="dialog"
kind="task"
```

---

# 8. Kind management

## 8.1. Propósito

`kind="management"` representa una superficie que administra una colección o conjunto persistente dentro del mismo Dialog y permite múltiples acciones locales antes de cerrar.

Patrón conceptual:

```text
Header
Body
  búsqueda / creación / contexto
  colección
  acciones locales
  feedback
Footer
  acciones globales solo cuando existan
```

## 8.2. Ownership de acciones

En `management`:

- acciones de fila → Body;
- acciones locales de edición/crear/mover → Body;
- acciones que gobiernan el Dialog completo → Footer;
- acciones compactas de fila → preferentemente `IconButton`.

El kind no convierte listas distintas en una única primitive genérica.

## 8.3. Inventario management

| Superficie | Tamaño |
|---|---|
| Administrar categorías | `wide` |
| Integrantes del grupo | `wide` |
| Configuración pendiente | `default` |

Todos usan:

```text
format="dialog"
kind="management"
```

`management` queda aprobado porque existe repetición semántica real. Si una implementación concreta demuestra una incompatibilidad, debe reportarse como bloqueo antes de eliminar o redefinir el kind.

---

# 9. Footer normalizado

## 9.1. Footer deja de ser obligatorio

Se reemplaza la regla global anterior que exigía Footer en todos los Dialogs.

Nuevo contrato:

- si existen acciones globales → Footer;
- si no existen acciones globales → Footer puede omitirse;
- `AdminDialog` no genera automáticamente un botón `Cerrar`;
- la `X` del Header sigue siendo el mecanismo común de cierre.

## 9.2. Cerrar explícito

`Cerrar` puede mantenerse de forma explícita cuando el consumidor realmente necesite una acción visible de salida, especialmente si es la única acción útil de esa superficie.

No debe existir solo para satisfacer una obligación estructural.

## 9.3. Orden

Se conserva:

```text
[ Secundaria ] [ Primaria ]
```

Destructiva:

```text
[ Cancelar ] [ Acción danger ]
```

En Mobile las acciones globales continúan apiladas y full-width según el contrato responsive vigente.

## 9.4. Drawers

Drawer sin acciones:

```text
Header [X]
Body
sin Footer
```

Drawer con navegación o acciones:

- Footer permitido;
- navegación puede ocupar el área izquierda;
- acciones operativas permanecen a la derecha en Desktop/Tablet;
- comportamiento Mobile conserva el contrato responsive vigente.

---

# 10. Button normalizado

## 10.1. Regla general

Los Buttons textuales de Dialogs/Drawers usan preferentemente:

```text
icono + texto de acción
```

El icono se mantiene incluso cuando el texto ya sería suficiente, porque forma parte del lenguaje visual didáctico/intuitivo aprobado para SOLOG.

## 10.2. Copy

El texto debe expresar la acción de forma breve.

Preferencia:

- 1 palabra cuando sea suficiente;
- 2 palabras normalmente;
- máximo aproximado de 3 palabras cuando mejore comprensión.

Ejemplos válidos:

```text
Guardar
Cancelar
Publicar
Reactivar
Guardar orden
Descargar Excel
Ignorar 30 días
Aprobar eliminación
Descartar y cerrar
```

No se debe convertir el Button en una explicación de la consecuencia. La explicación pertenece al Header/Body/Notice/Confirmation.

## 10.3. Iconos

El icono del Button es decorativo respecto al nombre accesible textual:

```tsx
<Save size={16} aria-hidden="true" />
Guardar
```

La acción debe seguir siendo comprensible por el texto sin depender únicamente del icono.

Se reutilizan iconos coherentes por verbo/intención cuando exista equivalente claro, por ejemplo:

- guardar → Save/Check;
- crear/agregar → Plus;
- descargar → Download;
- publicar/aprobar → Check o icono contextual aprobado;
- eliminar/excluir → CircleOff;
- reactivar/restaurar → RotateCcw;
- cancelar/cerrar → X cuando corresponda;
- separar/desvincular → Unlink.

No se fuerza un icono semánticamente incorrecto solo para cumplir la regla visual.

---

# 11. IconButton normalizado

`IconButton` permanece como primitive para acciones compactas/contextuales.

Uso preferente:

- acciones de fila;
- tablas;
- toolbars;
- orden;
- acciones locales compactas;
- acciones que abren un `kind="confirmation"` que explicará la consecuencia.

No se usa como reemplazo general de los CTA globales del Footer.

Contrato de accesibilidad:

- `aria-label` obligatorio;
- `title` recomendado/esperado cuando mejora descubribilidad y no existe otro tooltip;
- icono no debe ser la única semántica accesible;
- estados disabled y focus visible se preservan.

Patrón aprobado:

```text
IconButton contextual
        ↓
AdminDialog kind="confirmation"
        ↓
contexto + consecuencia
        ↓
Button textual de confirmación
```

---

# 12. Patrones compartidos que permanecen vigentes

Continúan siendo patrones comunes:

- `AdminNotice`;
- `admin-dialog-context`;
- `admin-dialog-help`;
- selector binario;
- QueryState/feedback ya normalizado;
- Footer navigation/actions donde corresponda.

Fase 9.2 no aprueba todavía nuevas primitives para `context` o `help`.

Su eventual extracción se evalúa en 9.7 únicamente si la repetición y beneficio técnico lo justifican.

---

# 13. Foco, nesting y cierre funcional

No se modifica:

- `admin.dialog.focus.ts`;
- `admin.dialog.stack.ts`;
- `admin.dialog.scroll.ts`;
- focus trap;
- foco inicial;
- restauración de foco;
- Escape topmost;
- backdrop topmost;
- `inert`;
- `closeDisabled`;
- scroll lock stack-aware.

Cambiar `variant` por `format/size/kind` no autoriza reimplementar esta infraestructura.

Si Fase 9.3 detecta una incompatibilidad real, debe detenerse y reportarla antes de rediseñar.

---

# 14. Responsive y geometría

Permanecen vigentes los breakpoints y comportamientos ya congelados.

Dialog `default`:

- Desktop/Tablet → centrado, máximo 560 px;
- Mobile → inset según contrato vigente.

Dialog `wide`:

- Desktop/Tablet → centrado, máximo 820 px;
- Mobile → fullscreen.

Drawer:

- Desktop/Tablet → lateral derecho;
- Mobile <768 px → fullscreen.

No se introducen nuevos breakpoints en Fase 9.

---

# 15. Clases y ownership CSS

La implementación debe hacer que `AdminDialog` sea propietario de las clases estructurales derivadas de:

- format;
- size;
- kind.

La convención exacta de nombres CSS puede ajustarse en 9.3, pero debe existir una sola fuente de verdad y no depender de `className` del consumidor para geometría estructural.

Los wrappers actuales:

```text
admin-dialog-confirmation
admin-dialog-task
```

deben evaluarse para eliminación cuando su única función haya sido absorbida por `kind`.

No se eliminan en 9.3 si aún tienen consumidores no migrados. La retirada definitiva corresponde a 9.5/10 según evidencia.

---

# 16. Fuera de alcance

Fase 9 no modifica:

- backend;
- Supabase;
- RPC;
- contratos de datos;
- lógica de negocio;
- motor de conteos;
- semántica de estados;
- tablas globales del Admin;
- Shell/Sidebar;
- infraestructura de foco/stack;
- librerías externas;
- portals;
- responsive global fuera de Dialogs/Drawers;
- cleanup agresivo general reservado para Fase 10.

No se reabren 8.2A ni 8.2B.

---

# 17. Plan revisado de Fase 9

El §9 de `SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md` queda reemplazado para ejecución por esta secuencia:

## 9.1 — Preflight transversal

**Estado:** COMPLETADO.

- inventario real;
- patrones repetidos;
- inconsistencias;
- candidatos de normalización.

## 9.2 — Contrato + fuente primaria

**Estado:** COMPLETADO CON ESTA FUENTE.

- format;
- size;
- kind;
- Footer;
- Buttons;
- IconButtons;
- Drawer de Detalle de propuesta;
- plan revisado.

## 9.3 — Foundation AdminDialog

**Estado:** CERRADA / VALIDADA TÉCNICAMENTE.

Implementado:

- `AdminDialogVariant` retirado de la primitive;
- nueva API `format + size + kind`;
- unión TypeScript que impide combinar Drawer con `size`, `kind` o geometría de Dialog;
- `drawerMaxWidth` reservado a `format="drawer"`;
- consumidores existentes migrados mecánicamente:
  - `variant="wide"` → `size="wide"`;
  - `variant="drawer"` → `format="drawer"`;
- `kind` preparado como clase estructural propiedad de `AdminDialog`;
- Footer pasa a ser estrictamente explícito;
- retirada la generación automática del botón `Cerrar`;
- la X del Header permanece como cierre común;
- lifecycle Drawer, transición, reduced-motion, focus, stack, Escape, backdrop, inert y scroll lock preservados;
- anchos de Drawers existentes preservados;
- CSS estructural existente conservado para evitar cambios visuales prematuros;
- añadida cobertura dirigida de Fase 9.3.

No se ha migrado todavía:

- Detalle de propuesta a Drawer — corresponde a 9.4;
- `kind="confirmation"`, `task` y `management` en consumidores — corresponde a 9.5;
- Buttons/IconButtons/Footer — corresponde a 9.6;
- consolidación visual — corresponde a 9.7.

La validación técnica de 9.3 fue reportada por el usuario como completada con éxito: suite, lint, build y `git diff --check`. La fase queda cerrada.

## 9.4 — Formato Drawer

**Estado:** CERRADA / VALIDADA TÉCNICA Y VISUALMENTE.

Inventario implementado:

1. Repeticiones — `format="drawer"`, 520 px;
2. Cronología — `format="drawer"`, 560 px;
3. Detalle diario — `format="drawer"`, 620 px;
4. Detalle de propuesta — `format="drawer"`, 720 px.

Implementación de Detalle de propuesta:

- reemplazado `size="wide"` por `format="drawer"`;
- fijado `drawerMaxWidth={720}`;
- Body, Footer, lógica funcional, estados, notices y nesting preservados;
- sin cambios backend ni de contratos;
- sin cambios CSS adicionales: reutiliza la geometría Drawer ya validada;
- cobertura dirigida actualizada para exigir los cuatro Drawers y sus anchos.

Validación reportada por el usuario como completada con éxito:

- suite completa;
- lint;
- build;
- `git diff --check`;
- validación visual;
- responsive;
- nesting;
- foco;
- scroll;
- transición;
- Footer del nuevo Drawer.

La normalización de botones, copy y eliminación de `Cerrar` redundante sigue reservada para 9.6.

### 9.4D — Refinamiento visual de Detalle de propuesta

**Estado:** CERRADA / VALIDADA TÉCNICA Y VISUALMENTE.

Este refinamiento posterior no reabre la lógica funcional de Fase 7 ni modifica el contrato Drawer ya validado. Aprovecha el formato vertical de 720 px para mejorar jerarquía, estabilidad visual y lectura responsive.

La segunda pasada reemplaza la composición visual de la primera donde exista contradicción.

Decisiones implementadas:

- Header:
  - título = producto;
  - descripción = `C. interno {código}`.
- El badge de Tipo se elimina del Drawer:
  - el tipo ya se entiende por el contenido de `Cambio propuesto`;
  - solo se mantiene el badge de Estado.
- Todo Drawer muestra una superficie de estado inmediatamente después del Header:
  - stale → warning de evidencia más reciente;
  - pendiente automática → instrucción de revisar/aprobar o ignorar;
  - pendiente administrativa → instrucción de revisar/aprobar;
  - aprobada publicable → lista para publicación;
  - aprobada bloqueada → motivo concreto del bloqueo;
  - aprobada sin estado publicable definitivo → notice informativo;
  - ignorada → evidencia suprimida/reactivable;
  - publicada → propuesta ya incorporada al Catálogo.
- `Cambio propuesto`:
  - heading + badge de Estado en la misma línea;
  - actual → nuevo usa una composición **siempre vertical**;
  - precio, nombre y código comparten la misma estructura;
  - nombres largos pueden envolver sin competir por dos columnas;
  - cambios de acción simple conservan una sola celda, sin flecha artificial.
- `Evidencia`:
  - fusiona Origen + Sedes;
  - automática → `Origen` muestra las sedes que generaron la evidencia;
  - administrativa → `Origen = Administrativo`;
  - `Apariciones` solo se muestra para propuestas automáticas;
  - `Primera evidencia` y `Última evidencia` se sustituyen por `Periodo detectado`;
  - `Periodo detectado` solo se muestra para propuestas automáticas;
  - el periodo presenta inicio → fin en Desktop/Tablet y se apila de forma segura en Mobile.
- `C. interno` permanece únicamente en Header.
- El Body mantiene ritmo vertical de 24 px entre bloques principales.
- Los errores/feedback operativos de mutations permanecen cerca de la zona operativa y no sustituyen el notice de estado.
- Footer, acciones y copy de botones permanecen sin cambios; continúan reservados para 9.6.
- Sin cambios backend, contratos, mutations, nesting, foco o geometría de 720 px.

Validación de cierre reportada por el usuario como completada con éxito:

- suite;
- lint;
- build;
- `git diff --check`;
- smoke visual Desktop/Tablet/Mobile;
- propuestas de precio;
- propuestas de nombre/código con textos largos;
- cambios de acción simple;
- origen automático y administrativo;
- estados pendiente/aprobada/ignorada/publicada;
- periodo detectado en automática y ausencia del periodo en administrativa;
- Footer y nesting sin regresiones.

Los ajustes visuales adicionales realizados durante el smoke quedan aceptados como parte del baseline autoritativo de 9.4, siempre que no contradigan los contratos congelados de formato, nesting, foco o backend. No deben reinterpretarse en 9.5 salvo incompatibilidad concreta demostrada.

## 9.5 — Kinds

### 9.5A — Confirmation

Migrar el inventario de §6.

### 9.5B — Task

Migrar el inventario de §7.

### 9.5C — Management

Migrar el inventario de §8.

Cada subfase debe preservar lógica preexistente y no reinterpretar composición funcional congelada.

## 9.6 — Buttons + IconButtons + Footer

Normalizar:

- icono + texto;
- copy 1–3 palabras cuando sea razonable;
- Button vs IconButton;
- Footer opcional;
- eliminación de `Cerrar` redundante;
- orden y tonos de acciones.

## 9.7 — Consolidación visual transversal

Revisar:

- spacing;
- headings;
- context;
- help;
- notices;
- fieldsets/forms;
- secciones;
- Footer;
- densidad;
- responsive;
- excepciones justificadas.

Solo extraer nuevas primitives si la repetición real demuestra beneficio.

Después:

- Fase 10 → cleanup agresivo;
- Fase 11 → revisión global;
- Fase 12 → validación/documentación/cierre.

---

# 18. Validación esperada por fase

Cada implementación debe ejecutar validación proporcional.

Mínimo técnico para cambios estructurales:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Además:

- tests dirigidos de AdminDialog;
- tests de nesting;
- responsive de default/wide/drawer;
- smoke visual de consumidores migrados.

No se considera una subfase cerrada si la evidencia correspondiente no pudo comprobarse.

---

# 19. Documentación vigente, reemplazada e histórica

## Vigente / autoritativa para Fase 9

- `SOLOG_UI_Admin_Dialogs_Normalizacion_Formato_Kind_V1.md` — fuente primaria de Fase 9.
- `SOLOG_UI_Admin_Drawers_Fase8_2A_Composicion_V2.md` — composición de Drawers no reemplazada.
- `SOLOG_UX_AdminDialog_Gestion_Foco_V1.md` — foco/nesting.
- fuentes individuales de Fases 4–8 para comportamiento no reemplazado.

## Reemplazada parcialmente

- `SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
  - reemplazado: Footer obligatorio / Cerrar automático como requisito;
  - reemplazado: modelado de `drawer` dentro de `variant` en la API objetivo;
  - vigente: geometría visual no redefinida.

- `SOLOG_UI_Admin_Dialogs_Fase7_Catalogo_Nesting_V1.md`
  - reemplazado únicamente: Detalle de propuesta `wide → drawer`;
  - resto permanece vigente.

- `SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`
  - reemplazado únicamente: §9 para la secuencia de ejecución;
  - Fases 1–8 y 10–12 permanecen como historial/roadmap salvo deltas posteriores explícitos.

## Histórica

Las reglas previas sustituidas permanecen como trazabilidad; no deben aplicarse sobre esta fuente cuando exista contradicción explícita.

---

# 20. Cierre de Fase 9.2

Queda congelado:

```text
FORMATO
dialog | drawer

TAMAÑO DE DIALOG
default | wide

KIND DE DIALOG
confirmation | task | management

DRAWER
detalle / drill-down
sin kind="detail"

FOOTER
solo cuando aporta acciones globales
sin Cerrar automático

BUTTON
icono + texto breve de acción como patrón preferente

ICONBUTTON
acción compacta/contextual
especialmente apto para abrir Confirmation
```

Detalle de propuesta queda aprobado como Drawer de 720 px; la validación visual de 9.4 confirmará que la geometría congelada no introduce desviaciones.

> **Fase 9.2 — Contrato de normalización: COMPLETADA Y CONGELADA.**
