# SOLOG — Sistema Visual V1

**Archivo:** `SOLOG_UI_Sistema_Visual_V1.md`  
**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel C — sistema visual / arquitectura UI frontend  
**Fecha:** 2026-09-14

---

# 1. Propósito

Este documento congela el sistema visual común de SOLOG después de:

1. la auditoría global de Home, Login, Admin, Cajero y Detalles;
2. la revisión transversal de identidad, densidad y responsive;
3. el preflight técnico del CSS;
4. el refactor de arquitectura CSS V1;
5. la validación técnica y visual del estado actual.

Su objetivo es definir **cómo debe verse y comportarse visualmente SOLOG como producto**, sin imponer una composición idéntica a todos los módulos.

Principio central:

> **SOLOG debe sentirse como un único producto, con una identidad común y tres familias de interfaz adaptadas a responsabilidades distintas.**

Este documento define el lenguaje visual.  
No autoriza por sí solo a cambiar lógica, contratos, backend ni comportamiento funcional.

---

# 2. Fuentes primarias y prioridad

## 2.1. Fuente primaria visual

Este documento es la **fuente primaria para el sistema visual, lenguaje UI, jerarquía, densidad, patrones de controles y reglas de coherencia visual de SOLOG V1**.

## 2.2. Fuentes relacionadas

- `docs/SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`
- `docs/SOLOG_Refactor_CSS_Plan_Implementacion_V1.md`
- `docs/SOLOG_UI_Sistema_Visual_Auditoria_Checkpoint_V1.md`
- contratos funcionales/backend vigentes de cada módulo.

## 2.3. Prioridad ante contradicciones

1. Contratos funcionales, backend, Motor, permisos y reglas de negocio vigentes.
2. Este documento para decisiones visuales y de composición UI.
3. `SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md` para ownership, carga y arquitectura CSS.
4. Documentos específicos posteriores aprobados como delta para un módulo.
5. El checkpoint de auditoría queda como fuente histórica de diagnóstico.

Una mejora visual no puede reinterpretar una regla funcional congelada.

---

# 3. Estado metodológico

Este sistema visual pasa a estado:

> **APROBADO Y CONGELADO**

Queda congelado:

- identidad visual base;
- separación en tres familias de interfaz;
- principios de color, superficies, tipografía, densidad y geometría;
- reglas comunes para controles, estados y overlays;
- lenguaje visual de Admin;
- lenguaje visual de Cajero y Detalles;
- lenguaje visual de Home/Login;
- criterios responsive;
- orden de implementación posterior.

No quedan autorizados todavía cambios concretos de implementación en cada módulo.

Cada módulo debe pasar por su propio bloque de definición/preflight antes de modificar código.

---

# 4. Identidad visual SOLOG

SOLOG no debe rediseñarse desde cero.

La identidad visual congelada es:

- tecnológica;
- moderna;
- limpia;
- luminosa;
- sobria;
- operativa;
- precisa;
- con estructura oscura cuando corresponde;
- con superficies claras para contenido;
- con color reservado para orientación, interacción, estado y énfasis.

SOLOG debe transmitir:

```text
control
claridad
trazabilidad
precisión
tecnología práctica
```

Debe evitar:

- exceso de decoración;
- gradientes dominantes;
- sombras pesadas;
- saturación de colores;
- cards innecesarias;
- interfaces excesivamente “dashboard” cuando el flujo no lo necesita;
- convertir operaciones simples en experiencias visualmente complejas.

---

# 5. Familias de interfaz

El sistema visual no es universal en densidad.

Se congelan tres familias.

## 5.1. Público — Home y Login

Responsabilidad:

```text
presentar
orientar
dar acceso
```

Características:

- baja densidad;
- abundante espacio negativo;
- marca protagonista;
- lenguaje tecnológico y limpio;
- composición editorial;
- animaciones discretas;
- pocas acciones simultáneas.

Home y Login deben sentirse relacionados entre sí y distintos de un panel operativo.

---

## 5.2. Operacional — Cajero y Detalles

Responsabilidad:

```text
ejecutar
consultar
seguir estado
```

Características:

- densidad media;
- información relevante visible sin saturación;
- controles táctiles claros;
- navegación inmediata;
- estados semánticos visibles;
- fuerte legibilidad;
- jerarquía funcional antes que decorativa.

Cajero y Detalles comparten lenguaje operacional, pero no la misma composición.

### Cajero

Debe sentirse:

- activo;
- accionable;
- orientado a tarea;
- rápido;
- tablet-first.

### Detalles

Debe sentirse:

- consultivo;
- tranquilo;
- informativo;
- orientado a lectura y exploración.

Detalles **no debe parecer “Cajero limitado”**.

---

## 5.3. Administración — Admin

Responsabilidad:

```text
supervisar
analizar
configurar
autorizar
gestionar
```

Características:

- alta densidad;
- desktop-first;
- información estructurada;
- herramientas compactas;
- tablas y filtros eficientes;
- jerarquía clara;
- estados y acciones consistentes.

Admin no debe adoptar la escala táctil del Cajero ni la composición editorial de Home.

---

# 6. Marca y color

## 6.1. Colores de marca fijos

Se preservan:

- Azul SOLOG: `#0A63F8`
- Violeta SOLOG: `#7A00FF`
- Verde SOLOG: `#10B981`

Estos colores pertenecen a la identidad SOLOG y no deben redefinirse por módulo.

## 6.2. Apariencia seleccionable

Se mantiene la separación conceptual:

```text
marca fija
≠
apariencia de interfaz seleccionable
```

La selección de apariencia puede modificar el color primario de interacción dentro de las variantes ya soportadas.

No debe cambiar:

- significado semántico;
- jerarquía funcional;
- branding SOLOG;
- estados de peligro/éxito/advertencia.

## 6.3. Navy estructural

La superficie oscura principal cercana a `#071126` continúa siendo el Navy estructural del producto.

Uso preferente:

- sidebar Admin;
- header operacional;
- superficies estructurales de alto contraste.

No debe usarse como fondo dominante de todo el contenido.

## 6.4. Regla de color

El color primario se utiliza para:

- acción principal;
- selección;
- foco;
- navegación activa;
- énfasis controlado;
- orientación.

No debe utilizarse para colorear grandes áreas sin función.

---

# 7. Estados semánticos

Los colores semánticos son independientes de la paleta seleccionada.

Se preservan conceptualmente:

- éxito;
- advertencia;
- peligro;
- información.

Regla:

> **El color semántico debe comunicar estado, no decorar.**

Un estado crítico no debe adquirir el color primario de la apariencia.

Las diferencias positivas, negativas, cero, pendientes, confirmadas o descartadas deben mantener significado consistente dentro del módulo que las utilice.

---

# 8. Superficies

Se congelan cuatro niveles conceptuales.

## 8.1. Fondo general

Fondo claro gris-azulado.

Función:

- separar la aplicación del contenido;
- reducir fatiga visual;
- evitar blanco absoluto en toda la pantalla.

## 8.2. Workspace

Superficie clara de trabajo.

Debe dominar en Admin, Cajero y Detalles.

## 8.3. Surface

Blanco o superficie equivalente para:

- cards;
- tablas;
- dialogs;
- bloques de contenido;
- controles agrupados.

## 8.4. Surface secundaria

Para:

- agrupaciones internas;
- filtros;
- estados suaves;
- cabeceras secundarias;
- bloques de menor jerarquía.

Regla:

> No crear una card cuando el espaciado y una separación simple resuelven la jerarquía.

---

# 9. Bordes y sombras

La interfaz debe depender primero de:

```text
espaciado
+
contraste de superficie
+
borde
```

y solo después de sombra.

Se preservan:

- bordes finos;
- contraste bajo;
- sombras discretas;
- elevación clara únicamente en overlays o elementos que realmente flotan.

Uso:

- `shadow-default` para separación mínima;
- `shadow-elevated` para overlays/cards elevadas cuando sea necesario;
- evitar múltiples niveles de sombra en una misma superficie.

---

# 10. Geometría

Se preserva la geometría base existente:

- radio pequeño: 8 px;
- control: 12 px;
- panel: 16 px.

Regla de uso:

```text
8 px  → elementos pequeños / detalles
12 px → controles
16 px → paneles / cards / dialogs
```

No se deben introducir radios grandes o “pill” como tratamiento universal.

Pills/chips quedan reservados a:

- estados;
- filtros;
- selecciones compactas;
- tags.

---

# 11. Espaciado

SOLOG debe seguir un ritmo visual consistente basado principalmente en múltiplos de 4 px.

Escala preferente:

```text
4
8
12
16
20
24
32
40
48
```

No es obligatorio reemplazar inmediatamente todos los valores históricos.

Durante normalización:

- usar la escala preferente para nuevos ajustes;
- conservar excepciones existentes cuando tengan justificación visual;
- evitar crear valores nuevos arbitrarios sin necesidad.

La coherencia del ritmo importa más que forzar una tokenización perfecta.

---

# 12. Tipografía

## 12.1. Familia

Tipografía principal congelada:

> **Plus Jakarta Sans**

Fallback:

```text
"Segoe UI", system-ui, sans-serif
```

## 12.2. Principios

La jerarquía debe depender de:

- tamaño;
- peso;
- contraste;
- espaciado;

no de múltiples colores.

## 12.3. Roles

### Display / Hero

Solo Home y superficies de presentación.

### Page title

Título principal de una vista o módulo.

### Section title

Subdivisión funcional clara.

### Body

Texto operativo o explicativo.

### Secondary / metadata

Información auxiliar.

### Numeric emphasis

KPIs, cantidades, diferencias y valores importantes.

Los valores numéricos deben conservar números tabulares cuando favorezca comparación.

---

# 13. Iconografía

Se preserva el lenguaje actual basado principalmente en iconos lineales.

Reglas:

- icono + texto cuando la acción no sea universalmente evidente;
- icon-only únicamente para acciones compactas y reconocibles;
- todo botón icon-only debe tener nombre accesible;
- no mezclar estilos de iconos incompatibles dentro de la misma superficie;
- el icono acompaña la jerarquía, no la reemplaza.

---

# 14. Controles

## 14.1. Acción primaria

Una superficie debe tener una acción principal clara cuando exista.

Debe evitarse mostrar varias acciones con el mismo peso visual.

## 14.2. Acción secundaria

Para:

- alternativas;
- consulta;
- navegación complementaria;
- operaciones reversibles.

## 14.3. Acción peligrosa

Debe usar semántica de peligro y no competir con la acción primaria.

## 14.4. Botón de icono

Tratamiento común para:

- cerrar;
- expandir;
- acciones de toolbar;
- controles compactos.

Debe mantener:

- target suficiente;
- focus visible;
- hover;
- disabled cuando corresponda.

## 14.5. Disabled

Debe seguir siendo legible.

No debe desaparecer visualmente ni parecer un elemento roto.

---

# 15. Campos, búsqueda y filtros

Reglas comunes:

- label claro cuando el significado no sea obvio;
- focus visible;
- estados de error legibles;
- búsqueda diferenciada de filtros;
- filtros agrupados por función;
- acciones de limpiar/restablecer solo cuando sean necesarias.

Admin puede usar controles más compactos.

Cajero debe priorizar targets táctiles mayores.

---

# 16. Chips, badges y estados

## Badge

Representa estado o clasificación.

No debe comportarse como botón si no es interactivo.

## Chip

Puede representar:

- filtro;
- selección;
- resumen compacto.

Si es interactivo debe tener:

- hover;
- focus;
- estado activo.

No utilizar chips como sustituto universal de texto o tablas.

---

# 17. Cards y paneles

Una card debe representar una unidad real de información o acción.

Debe evitarse:

- card dentro de card sin necesidad;
- convertir cada métrica en una card;
- bordes y sombras redundantes;
- múltiples estilos de card dentro del mismo módulo sin jerarquía clara.

Las familias pueden variar en densidad:

- Home → cards aireadas;
- Cajero → cards táctiles;
- Detalles → cards informativas;
- Admin → cards compactas solo cuando el dominio lo requiera.

---

# 18. Tablas y listas

## Admin

Las tablas son una primitive principal.

Deben mantener:

- encabezados claros;
- densidad compacta;
- alineación consistente;
- números comparables;
- estados visibles;
- acciones controladas;
- paginación coherente.

## Cajero / Detalles

Las listas pueden reemplazar tablas cuando:

- la pantalla sea táctil;
- el detalle expandible sea más importante;
- el ancho disponible sea limitado.

No forzar una tabla desktop en una experiencia móvil/tablet.

---

# 19. Overlays

## 19.1. Dialog

Para:

- decisión focal;
- edición;
- confirmación;
- consulta breve.

Debe incluir:

- título claro;
- cierre;
- foco inicial;
- cierre por acción explícita;
- Escape cuando corresponda;
- overlay estable.

## 19.2. Drawer

Solo cuando la exploración lateral prolongada beneficie el flujo.

No debe usarse por defecto.

## 19.3. Pop-up / modal en Incidencias

Se mantiene la decisión existente:

> **Incidencias conserva pop-ups; no se convierte a drawer.**

---

# 20. Feedback

Toda familia debe tener variantes consistentes de:

- loading;
- empty;
- error;
- warning;
- success/confirmación cuando corresponda.

Principio:

> El usuario debe saber siempre si el sistema está cargando, no tiene datos, falló o espera una acción.

Los estados vacíos deben explicar el estado y, cuando exista, la siguiente acción útil.

---

# 21. Motion

Las microinteracciones deben ser:

- cortas;
- discretas;
- funcionales.

Duración base aproximada actual:

```text
170 ms
```

Permitido:

- hover;
- focus;
- apertura/cierre suave;
- cambios de selección;
- loaders;
- entrada ligera de Home/Login.

Evitar:

- animaciones largas;
- movimiento constante decorativo;
- transformaciones que dificulten uso táctil;
- animaciones imprescindibles para entender estado.

`prefers-reduced-motion` debe seguir respetándose globalmente.

---

# 22. Focus y accesibilidad

El focus visible es parte del diseño y no debe eliminarse.

Todo elemento interactivo debe:

- ser identificable;
- responder a teclado cuando aplique;
- mantener contraste suficiente;
- conservar nombre accesible en icon-only;
- diferenciar activo, hover, focus y disabled.

Los cambios visuales no deben reducir accesibilidad existente.

---

# 23. Lenguaje visual de Admin

Admin debe consolidarse alrededor de una gramática común.

## 23.1. Estructura conceptual

Primitivas visuales objetivo:

```text
AdminPage
AdminPageHeader
AdminSection
AdminToolbar
AdminFilterBar
AdminFilterField
AdminSearch
AdminActions
AdminTable
AdminBadge
AdminResultCount
AdminPagination
AdminLoading
AdminEmpty
AdminNotice
AdminError
AdminDialog
```

Estos nombres describen **responsabilidades visuales**, no obligan a crear componentes React con esos nombres.

## 23.2. Header Admin

Se congelan dos variantes.

### Módulo contextual por sede

```text
[Módulo]                         [Sede / selector]
```

La sede debe permanecer visible para reducir errores operativos.

### Módulo global

```text
[Módulo]                         [Puerto Rico]
```

No usar artificialmente `Todas las sedes` cuando el módulo es institucional/global.

## 23.3. Densidad

Admin debe ser:

- compacto;
- legible;
- eficiente;
- orientado a desktop.

No aumentar espacios o tamaños simplemente para parecer más “moderno”.

## 23.4. Especialización

No uniformar las composiciones funcionales.

Se preserva:

- Dashboard → cards/resumen por sede;
- Control → análisis tabular;
- Catálogo → propuestas/publicación;
- Productos → inventario tabular;
- Grupos → gestión estructural;
- Incidencias → excepciones;
- Dispositivos → cards/autorización.

La coherencia debe venir de controles, ritmo y estados compartidos.

---

# 24. Lenguaje visual de Cajero

Cajero es la referencia de interfaz operacional táctil de SOLOG.

Debe conservar:

- header Navy;
- contexto de sede;
- navegación inferior;
- cobertura protagonista;
- acciones claras;
- targets táctiles;
- cards operativas;
- selección visual;
- captura/modal;
- Historial expandible.

Principios:

```text
acción antes que decoración
progreso visible
estado inmediato
pocas decisiones simultáneas
```

La futura normalización debe ser mínima y controlada.

No rediseñar Cajero para hacerlo parecer Admin.

---

# 25. Lenguaje visual de Detalles

Detalles se define como:

> **panel de consulta operativo**

Debe compartir identidad con Cajero sin heredar automáticamente su carácter accionable.

## 25.1. Tono

- más tranquilo;
- menos táctil;
- más informativo;
- orientado a lectura;
- responsive general.

## 25.2. Decisiones aprobadas

Se congela:

- `Solo lectura` pasa conceptualmente a **`Modo consulta`**.
- Si el dispositivo está autorizado para la sede, debe existir CTA:
  **`Ir al panel Cajero`**
  con destino `/cajero`.

## 25.3. No aprobado

La propuesta:

- `Comprobar acceso`

para solicitudes pendientes **no queda congelada** en esta V1.

Permanece en propuesta y requiere aprobación explícita antes de implementarse.

## 25.4. Dirección visual

Detalles debe:

- reducir señales falsas de interacción;
- diferenciar disponibilidad/estado sin reutilizar semántica de éxito incorrectamente;
- tratar historial como consulta;
- mantener exportación separada conceptualmente de historial;
- evitar grids táctiles cuando el elemento sea únicamente un filtro de lectura.

---

# 26. Lenguaje visual de Home

Home debe continuar siendo una portada de producto limpia.

Preservar:

- logo;
- hero;
- claim;
- isotipo tecnológico;
- halo/anillos/partículas;
- azul/violeta/verde;
- mucho espacio negativo;
- capacidades principales;
- CTA hacia Login.

Dirección:

> refinamiento, no rediseño.

No queda congelada todavía ninguna reducción de secciones o CTAs específicos.

Cualquier simplificación posterior deberá aprobarse en el bloque de Home.

---

# 27. Lenguaje visual de Login

Login debe conservar continuidad directa con Home.

Preservar:

- composición split en desktop;
- identidad SOLOG;
- isotipo;
- formulario sobrio;
- acceso role-neutral;
- claim;
- bajo nivel de ruido visual.

Dirección:

> acceso controlado y profesional, sin parecer Admin ni Cajero.

La posibilidad de reforzar de manera sutil el carácter de acceso interno puede explorarse durante el bloque Login, pero no se congela texto nuevo en este documento.

---

# 28. Responsive

El sistema visual no impone el mismo objetivo responsive a todas las familias.

## Home

Universal.

Debe funcionar correctamente en desktop, tablet y móvil.

## Login

Universal.

Especial atención a transición split → columna alrededor de tablet vertical.

## Admin

Desktop-first.

Debe:

- degradar con dignidad;
- mantener acceso a funciones;
- evitar roturas;

pero no necesita convertirse en una experiencia mobile-first.

## Cajero

Tablet-first.

Dispositivo prioritario:

> **Xiaomi Pad SE en vertical**

Debe mantener:

- targets táctiles;
- navegación inferior;
- safe areas;
- scroll estable;
- ausencia de overflow horizontal;
- modals/captura utilizables con teclado.

## Detalles

Responsive general.

Debe ser cómodo en:

- desktop;
- tablet;
- móvil.

---

# 29. Regla de densidad

Se congela la siguiente relación:

```text
Home/Login   → baja densidad
Cajero       → densidad media táctil
Detalles     → densidad media consultiva
Admin        → alta densidad administrativa
```

No intentar “igualar” visualmente estas densidades.

La coherencia debe percibirse por identidad, no por tamaño idéntico de componentes.

---

# 30. Regla de consistencia

Cuando dos elementos representan la misma función dentro de una familia, deben tender a compartir:

- altura;
- radio;
- tipografía;
- iconografía;
- estado;
- hover;
- focus;
- disabled;
- espaciado.

Ejemplo:

> `Descargar ajuste` no debería tener tratamientos visuales arbitrariamente distintos entre superficies administrativas equivalentes.

La normalización debe realizarse sin cambiar el flujo funcional.

---

# 31. Regla de especialización

La consistencia no autoriza a convertir toda la aplicación en un único conjunto de componentes genéricos.

Se permite y se espera especialización cuando:

- el dominio la exige;
- mejora lectura;
- mejora interacción;
- reduce errores.

Antes de abstraer visualmente debe existir más de un consumidor real.

---

# 32. CSS y sistema visual

La arquitectura CSS V1 ya está cerrada y se mantiene vigente.

```text
GLOBAL
├─ foundations.css
├─ shared.css
└─ styles.css residual/público

OPERACIONAL
├─ operational.css
├─ cajero.css
└─ detalles.css

ADMIN
└─ admin.css
```

El sistema visual no autoriza a volver a mezclar responsabilidades.

Las mejoras visuales deben implementarse dentro de la familia correspondiente.

---

# 33. Qué no forma parte de este sistema visual

Fuera de alcance:

- backend;
- Supabase;
- RPC;
- RLS;
- autenticación;
- Motor;
- lógica de diferencias;
- sesiones;
- exportación como lógica;
- reglas de inventario;
- modelo de datos;
- cambios funcionales no aprobados.

También quedan fuera:

- crear un design system React completo;
- Storybook;
- refactor masivo de componentes;
- renombrado general de clases;
- eliminación global de legacy;
- nueva arquitectura CSS.

Cualquiera de esos trabajos requiere su propio bloque.

---

# 34. Orden de implementación visual posterior

Se congela el siguiente orden:

```text
1. Admin
2. Detalles
3. Home / Login
4. Cajero
5. Validación responsive global
6. Revisión global final
```

Razón:

- Admin concentra la mayor deuda de consistencia.
- Detalles necesita identidad consultiva propia.
- Home/Login ya son maduros y requieren refinamiento.
- Cajero es la referencia operacional actual y debe tocarse al final y mínimamente.

---

# 35. Metodología por módulo

Cada bloque visual debe seguir:

```text
definir cambios concretos
→ preflight funcional/técnico
→ detectar contradicciones
→ congelar fuente específica
→ pedir a Codex baseline + plan
→ aprobar plan
→ implementar por fases
→ validar técnicamente
→ smoke humano
→ cerrar
```

Para un cambio puntual Nivel A puede usarse un prompt dirigido sin crear un plan completo.

No se debe enviar a Codex un “rediseño global” de toda la aplicación en una sola implementación.

---

# 36. Implementación de Admin — restricciones iniciales

El próximo bloque será Admin.

Antes de implementar debe definirse:

- primitives administrativas concretas;
- qué diferencias entre módulos son intencionales;
- qué controles se normalizan;
- jerarquía común;
- tratamiento de filtros;
- acciones;
- tablas;
- paginación;
- dialogs;
- feedback.

Debe preservarse:

- shell;
- navegación;
- contratos;
- datos;
- filtros funcionales;
- módulos;
- contexto de sede;
- lógica actual.

El objetivo será:

```text
misma función
+
misma semántica
+
mismo contrato
+
lenguaje visual administrativo común
```

---

# 37. Criterios de éxito del sistema visual

La implementación posterior será exitosa cuando:

1. SOLOG se perciba como un solo producto.
2. Las tres familias mantengan personalidad adecuada a su responsabilidad.
3. Los controles equivalentes tengan lenguaje consistente.
4. Admin deje de parecer una acumulación de generaciones visuales.
5. Detalles tenga identidad de consulta propia.
6. Home/Login mantengan una presentación coherente y limpia.
7. Cajero conserve su eficiencia táctil.
8. El responsive respete el objetivo de cada familia.
9. No se alteren contratos ni comportamiento funcional.
10. Accesibilidad, focus y estados continúen siendo explícitos.
11. No se reintroduzca acoplamiento CSS entre familias.
12. Las mejoras se validen módulo por módulo y globalmente.

---

# 38. Estado de documentación previa

## Vigente

- `SOLOG_UI_Sistema_Visual_V1.md` — fuente primaria visual.
- `SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md` — fuente primaria de arquitectura CSS.
- contratos funcionales/backend vigentes de cada módulo.

## Histórica / diagnóstico

- `SOLOG_UI_Sistema_Visual_Auditoria_Checkpoint_V1.md`

El checkpoint no se elimina, pero este documento reemplaza sus secciones exploratorias cuando exista una decisión visual congelada aquí.

---

# 39. Estado final

> **SOLOG — Sistema Visual V1: APROBADO Y CONGELADO.**

El siguiente bloque autorizado es:

> **Admin — normalización visual y consolidación de primitives administrativas.**

Antes de implementación debe realizarse definición concreta y preflight del módulo Admin.

