# Identidad visual de SOLOG

**Proyecto:** SOLOG  
**Documento:** Identidad visual y principios de UI  
**Versión:** 1.0  
**Estado:** Aprobado para implementación

## 1. Objetivo

Este documento define la identidad visual base de SOLOG. Su propósito es dar a Codex un marco consistente para rediseñar la plataforma existente sin sobreespecificar cada componente.

La interfaz debe transmitir:

- modernidad;
- innovación;
- profesionalismo;
- precisión;
- limpieza;
- dinamismo;
- facilidad de uso.

SOLOG no debe parecer un ERP tradicional, un panel administrativo antiguo ni un dashboard genérico compuesto únicamente por tarjetas estáticas.

## 2. Dirección visual

SOLOG utilizará una identidad propia e independiente.

La dirección será la de un producto tecnológico moderno y profesional, con una interfaz visual e interactiva pero contenida.

Principios:

- predominio de superficies claras;
- uso estratégico de superficies oscuras;
- contraste suficiente sin convertir la aplicación en modo oscuro;
- jerarquía visual clara;
- uso moderado del color;
- componentes con respuesta visual a la interacción;
- evitar elementos decorativos sin función;
- evitar exceso de tarjetas, gradientes y sombras;
- priorizar claridad y velocidad operativa.

## 3. Tema híbrido claro / oscuro

SOLOG no utilizará exclusivamente modo claro ni modo oscuro.

### Superficies claras

Se utilizarán principalmente para:

- áreas de trabajo;
- tablas;
- formularios;
- contenido;
- tarjetas;
- paneles de información.

### Superficies oscuras

Se utilizarán estratégicamente para:

- navegación principal;
- sidebar;
- menús;
- dropdowns;
- overlays;
- determinados elementos estructurales o de énfasis.

Las superficies oscuras deben utilizar tonos carbón, azul muy oscuro o equivalentes según la paleta activa. Evitar negro puro como superficie dominante.

## 4. Sistema de paletas

Los colores deben implementarse mediante **design tokens / variables de tema**.

No se deben hardcodear colores de identidad directamente dentro de los componentes.

SOLOG tendrá tres paletas:

1. **Azul eléctrico** — paleta predeterminada.
2. **Violeta** — alternativa tecnológica y sofisticada.
3. **Verde suave** — alternativa equilibrada y tranquila.

La estructura visual y los componentes serán idénticos entre paletas. Solo cambiarán los tokens correspondientes.

La elección de paleta podrá persistirse localmente en el dispositivo, por ejemplo mediante `localStorage`. No requiere persistencia en Supabase.

### 4.1 Tokens mínimos recomendados

```css
--color-primary
--color-primary-hover
--color-primary-active
--color-primary-soft

--color-background
--color-workspace
--color-surface
--color-surface-secondary

--color-dark-surface
--color-dark-surface-secondary
--color-dark-surface-hover

--color-text-primary
--color-text-secondary
--color-text-muted
--color-text-inverse

--color-border
--color-border-strong
--color-focus

--color-success
--color-warning
--color-danger
--color-info
```

Codex puede ampliar los tokens cuando resulte necesario, manteniendo una nomenclatura semántica.

### 4.2 Paleta Azul eléctrico — predeterminada

Valores iniciales de referencia:

```css
--color-primary: #146EF5;
--color-primary-hover: #0B5FE0;
--color-primary-active: #084DB8;
--color-primary-soft: #EAF2FF;

--color-background: #F5F7FA;
--color-workspace: #F8FAFC;
--color-surface: #FFFFFF;
--color-surface-secondary: #F9FAFC;

--color-dark-surface: #0B1424;
--color-dark-surface-secondary: #101C2E;
--color-dark-surface-hover: #16263B;

--color-text-primary: #0F172A;
--color-text-secondary: #475569;
--color-text-muted: #94A3B8;
--color-text-inverse: #F8FAFC;

--color-border: #E2E8F0;
--color-border-strong: #CBD5E1;
--color-focus: #146EF5;
```

### 4.3 Paleta Violeta

La paleta violeta deberá mantener el mismo contraste y filosofía de la paleta predeterminada, sustituyendo los colores de identidad y ajustando las superficies oscuras para armonizar con el violeta.

Referencia inicial:

```css
--color-primary: #7C3AED;
--color-primary-hover: #6D28D9;
--color-primary-active: #5B21B6;
--color-primary-soft: #F1EAFF;

--color-dark-surface: #171225;
--color-dark-surface-secondary: #211A32;
```

Codex podrá completar los tokens restantes manteniendo las superficies claras y el contraste establecidos.

### 4.4 Paleta Verde suave

Debe utilizar un verde moderno y contenido, evitando tonos excesivamente saturados o una apariencia ecológica/decorativa.

Codex definirá los valores concretos respetando:

- legibilidad;
- contraste;
- coherencia con el tema híbrido;
- apariencia tecnológica;
- equivalencia funcional con las otras dos paletas.

### 4.5 Colores semánticos

Los colores de estado no deben depender completamente de la paleta de identidad.

Como referencia:

```css
--color-success: #16A36A;
--color-warning: #D99018;
--color-danger: #E5484D;
--color-info: var(--color-primary);
```

Los estados deben poder distinguirse también mediante texto, iconografía, forma o contexto. El color nunca debe ser el único indicador.

**Turquesa queda descartado como color de identidad de SOLOG.**

## 5. Tipografía

La tipografía oficial de SOLOG será:

**Plus Jakarta Sans**

Debe utilizarse como familia principal en toda la plataforma.

Fallback recomendado:

```css
font-family: "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif;
```

Jerarquía inicial:

| Uso | Peso |
|---|---:|
| Títulos principales | 700 |
| Títulos de sección | 600 |
| Botones y acciones | 600 |
| Texto general | 400 |
| Datos y tablas | 500 |
| Métricas, stock y diferencias | 700 |
| Etiquetas pequeñas | 500 |

Principios:

- evitar tipografías decorativas;
- evitar mayúsculas sostenidas en títulos completos;
- utilizar peso, espacio y jerarquía antes que tamaños exagerados;
- mantener excelente legibilidad en tablet y PC;
- dar presencia especial a números operativos importantes.

### Datos numéricos

Stocks, diferencias, porcentajes, horas y otras cifras comparables deben utilizar:

```css
font-variant-numeric: tabular-nums;
```

Esto facilita la comparación y alineación visual.

## 6. Iconografía

SOLOG utilizará **Lucide Icons** como familia principal.

Lucide es apropiada para aplicaciones web y mantiene una estética lineal, geométrica y contemporánea.

Reglas:

- utilizar una sola familia de iconos;
- estilo outline;
- grosor consistente;
- no mezclar iconos de estilos diferentes;
- los iconos deben complementar las etiquetas, no reemplazar texto crítico;
- mantener el mismo icono para la misma función en toda la plataforma.

Tamaños orientativos:

```text
Admin / uso general: 18–20 px
Cajero / acciones táctiles importantes: 22–26 px
```

Codex elegirá el icono específico de Lucide que mejor represente cada función.

## 7. Geometría

La interfaz utilizará geometría moderna, moderadamente redondeada.

Radios recomendados:

```text
Elementos pequeños: 8 px
Inputs y botones: 12 px
Tarjetas y paneles: 16 px
```

Principios:

- bordes sutiles;
- sombras ligeras;
- evitar sombras profundas;
- evitar redondeados excesivos;
- evitar convertir cada bloque de información en una tarjeta;
- utilizar espacio, contraste, agrupación y bordes para crear estructura.

Sombras de referencia:

```css
--shadow-default: 0 1px 3px rgba(15, 23, 42, 0.06);
--shadow-elevated: 0 8px 24px rgba(15, 23, 42, 0.08);
```

Codex puede ajustarlas si el resultado visual lo requiere.

## 8. Espaciado

Escala base recomendada:

```text
4 px
8 px
12 px
16 px
24 px
32 px
48 px
```

No es obligatorio utilizar únicamente estos valores, pero deben constituir la base del sistema.

### 8.1 Cajero

La interfaz del trabajador está orientada principalmente a **tablet horizontal**.

Debe ser:

- espaciosa;
- táctil;
- rápida;
- de lectura inmediata;
- con objetivos táctiles grandes;
- con separación suficiente entre acciones;
- con baja densidad visual;
- con pocas decisiones simultáneas.

La interfaz debe favorecer la operación física del conteo sobre la cantidad de información visible.

### 8.2 Admin

La interfaz administrativa está orientada principalmente a PC.

Debe ser:

- más compacta;
- más informativa;
- eficiente en el uso del espacio;
- apropiada para tablas, filtros, historial y revisión de diferencias;
- densa sin resultar saturada.

Admin y Cajero deben compartir identidad visual, pero **no deben tener la misma densidad ni composición simplemente adaptada a diferentes resoluciones**.

## 9. Interactividad

SOLOG debe sentirse como una aplicación activa, no como un panel estático.

Codex tendrá libertad para resolver:

- hover;
- focus;
- selected;
- pressed;
- expansiones;
- drawers;
- tabs;
- dropdowns;
- feedback de conteo;
- transiciones;
- estados de carga;
- navegación;
- cambios de estado.

Referencia para transiciones:

```text
150–220 ms
```

Las animaciones deben ser rápidas, discretas y funcionales.

Evitar:

- animaciones decorativas prolongadas;
- movimiento constante;
- efectos que distraigan del conteo;
- transiciones que ralenticen el trabajo.

## 10. Componentes y layouts

No se establece un diseño rígido para cada componente.

Codex podrá decidir la mejor solución para:

- botones;
- inputs;
- inputs numéricos;
- cards;
- tablas;
- badges;
- dropdowns;
- tabs;
- drawers;
- tooltips;
- buscadores;
- filtros;
- estados;
- navegación;
- layout de Cajero;
- layout de Admin.

Estas decisiones deben respetar:

1. la lógica funcional de SOLOG;
2. la identidad definida en este documento;
3. la diferencia de densidad entre Cajero y Admin;
4. facilidad de uso;
5. interactividad;
6. coherencia entre componentes;
7. accesibilidad y contraste.

## 11. Principios a evitar

No utilizar como dirección visual:

- turquesa como identidad;
- modo oscuro completo;
- grandes fondos negros;
- apariencia de ERP tradicional;
- dashboard genérico basado en muchas tarjetas KPI;
- tipografías antiguas o excesivamente corporativas;
- gradientes excesivos;
- glassmorphism dominante;
- sombras pronunciadas;
- colores intensos sobre grandes superficies;
- iconografía inconsistente;
- interfaces completamente estáticas;
- exceso de información en Cajero;
- exceso de espacio vacío en Admin.

## 12. Criterio final

Cuando exista una decisión visual no especificada en este documento, Codex debe resolverla por criterio de diseño manteniendo este orden:

```text
facilidad de uso
↓
claridad
↓
coherencia con la lógica de SOLOG
↓
modernidad
↓
interactividad
↓
consistencia visual
```

El objetivo no es reproducir un mockup rígido, sino construir una interfaz coherente que se sienta como un producto tecnológico moderno y profesional.

