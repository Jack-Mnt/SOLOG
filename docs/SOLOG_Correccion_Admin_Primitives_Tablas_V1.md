# SOLOG — Corrección Admin — Primitives y Tablas V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — corrección frontend post-revisión  
**Fecha:** 2026-09-15  
**Fuente primaria de este delta:** este documento.

---

# 1. Propósito

Congelar únicamente las correcciones detectadas después de implementar y revisar F1–F4 de composición de tablas Admin.

Este delta no reabre el diseño funcional de los módulos y no sustituye las decisiones que no modifica expresamente.

Fuentes relacionadas:

1. `docs/SOLOG_UI_Admin_Composicion_Tablas_V1.md`
2. `docs/SOLOG_UI_Admin_Composicion_Tablas_Plan_Implementacion_V1.md`
3. `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`

Ante contradicción puntual sobre las correcciones descritas aquí, este delta prevalece.

---

# 2. Estado técnico previo

F1–F4 fueron implementadas y la revisión global técnica confirmó:

- suite global: 361 tests aprobados;
- lint correcto;
- build correcto;
- `git diff --check` correcto;
- sin cambios de backend;
- sin cambios de Supabase;
- sin cambios de RPC;
- sin nuevas consultas derivadas de las StateView de Incidencias.

La corrección de navegación accesible de StateView de Incidencias también fue integrada posteriormente.

---

# 3. QuickFilterChip — corrección congelada

## 3.1 Referencia visual

La referencia autoritativa es **Control**.

La primitive genérica QuickFilterChip debe reutilizar el lenguaje visual ya consolidado allí:

- geometría;
- altura;
- padding;
- radio;
- borde;
- fondo;
- tipografía;
- hover;
- focus;
- estado activo;
- separación;
- contador visible;
- color semántico cuando aporta significado;
- responsive ya definido.

No debe existir una segunda versión visual paralela por módulo.

## 3.2 Módulos afectados

Aplicar la primitive común a:

### Productos

```text
Todos N | Únicos N | Agrupados N | Excluidos N
```

### Grupos — Integrantes

```text
Todos N | Único N | 2+ SKU N
```

### Grupos — Valorizado

```text
Todos N | Configurado N | Sin valorizado N
```

Control se preserva como referencia y no debe cambiar visualmente.

## 3.3 Datos

Los contadores se calculan en frontend con el dataset ya cargado.

Reglas:

- no crear RPC;
- no crear consultas nuevas;
- no modificar contratos remotos;
- conservar filtros y lógica existentes;
- los contadores deben representar el conjunto disponible dentro del contexto/filtros restantes del módulo, sin aplicar la selección del propio QuickFilterChip.

---

# 4. StateView — corrección congelada

## 4.1 Referencia visual

La referencia autoritativa es **Catálogo**.

La primitive genérica StateView debe reutilizar:

- geometría;
- altura;
- padding;
- radio;
- borde;
- fondo;
- separación;
- tipografía;
- estado activo;
- contador;
- hover;
- focus;
- semántica tabs;
- responsive ya definido.

Catálogo debe conservar su apariencia actual como referencia.

## 4.2 Incidencias

Las vistas siguen siendo exactamente:

```text
Pendientes | Suprimidas | Resueltas
```

La vista inicial continúa siendo:

```text
Pendientes
```

No agregar `Todos`.

Cada StateView debe mostrar su contador visible:

```text
Pendientes N | Suprimidas N | Resueltas N
```

Los contadores se derivan del mismo `summary` ya descargado.

Reglas:

- no crear consultas nuevas;
- respetar el filtro de Tipo y el ámbito/sede actualmente activos;
- cada contador debe ignorar únicamente la selección de StateView para poder mostrar simultáneamente las cantidades de los tres estados;
- mantener la tabla y acciones provisionales actuales;
- no definir todavía columnas ni acciones específicas por estado.

---

# 5. Catálogo — accesibilidad de Cambio

La presentación visual aprobada se mantiene:

```text
anterior → nuevo
```

La relación anterior → nuevo es semántica.

Si la flecha visual permanece con `aria-hidden="true"`, debe existir una equivalencia accesible que comunique explícitamente:

```text
anterior, cambia a nuevo
```

Aplica a:

- precio;
- nombre;
- código.

No modificar el payload ni el normalizador remoto.

---

# 6. IconButton — reconciliación documental

La semántica vigente queda:

```text
Default | Primary | Danger
```

`Primary` corresponde a la variante previamente denominada **Info/Primary**.

Uso aprobado en este bloque:

- reincorporar producto → Primary;
- excluir producto → Danger.

No se crea una cuarta variante.

---

# 7. Alcance técnico

Cambios esperados únicamente en frontend, principalmente:

- `src/features/solog/admin/admin.css`;
- Productos;
- Grupos;
- Incidencias;
- Catálogo;
- pruebas relacionadas.

Se debe preferir mover reglas comunes a las primitives/clases compartidas en lugar de duplicar estilos específicos por módulo.

---

# 8. Fuera de alcance

No modificar:

- backend;
- Supabase;
- RPC;
- Edge Functions;
- contratos remotos;
- Table Shell;
- Thead surface;
- Toolbar;
- Result Count;
- geometría congelada de Button/IconButton;
- responsive general ya congelado;
- columnas de las tablas salvo lo ya implementado;
- modales/dialogs;
- workflow funcional;
- tablas específicas futuras de Incidencias;
- nuevas funcionalidades;
- refactors generales.

---

# 9. Validación requerida

Ejecutar como mínimo:

1. pruebas dirigidas de Productos, Grupos, Incidencias y Catálogo;
2. `bunx tsc -b`;
3. `bun run lint`;
4. `bun run build`;
5. `git diff --check`.

Además comprobar:

- Control no cambia visualmente;
- Catálogo no cambia visualmente como referencia de StateView;
- Productos y Grupos comparten QuickFilterChip;
- Incidencias comparte StateView;
- contadores cambian coherentemente con filtros ya existentes;
- no aparecen nuevas consultas;
- navegación accesible de StateView continúa funcionando;
- lector de pantalla conserva significado anterior → nuevo en Catálogo.

---

# 10. Criterio de cierre

Este delta queda listo cuando:

1. QuickFilterChip común reproduce el patrón de Control;
2. StateView común reproduce el patrón de Catálogo;
3. Productos, Grupos e Incidencias muestran contadores sin nuevas consultas;
4. Cambio comunica accesiblemente la transición anterior → nuevo;
5. no existen regresiones funcionales;
6. las validaciones técnicas son correctas;
7. queda pendiente únicamente el smoke humano integrado del bloque principal.

---

# 11. Estado final

> **SOLOG — Corrección Admin — Primitives y Tablas V1: APROBADO Y CONGELADO.**

Este delta corrige inconsistencias de implementación y documentación sin reabrir las decisiones funcionales de F1–F4.
