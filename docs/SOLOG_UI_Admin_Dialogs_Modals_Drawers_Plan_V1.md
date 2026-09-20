# SOLOG — UI Admin — Dialogs, Modals y Drawers — Plan de Implementación V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — implementación UI/UX frontend/Admin  
**Fecha:** 2026-09-19  
**Rama de trabajo:** `admin-work`

## 1. Fuente primaria

Este plan implementa el contrato congelado en:

- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`

No reemplaza ese contrato. Si existe contradicción, prevalece la fuente primaria visual.

El contrato funcional y de accesibilidad de foco continúa regido por:

- `docs/SOLOG_UX_AdminDialog_Gestion_Foco_V1.md`

## 2. Estado previo

Las Fases 1–3 ya fueron ejecutadas y validadas localmente:

1. Preflight de ejecución y baseline — cerrado.
2. Normalización global de `AdminDialog` — cerrado.
3. Normalización estructural de los 19 consumidores — cerrado.

Estado consolidado:

- 19 consumidores;
- `default`: 9;
- `wide`: 7;
- `drawer`: 3;
- Footer visual presente en 19/19;
- acciones globales separadas del Body;
- navegación global de Drawers trasladada al Footer;
- Cronología e Incidencias/Repeticiones usan `drawer`;
- Configurar producto usa `default`;
- foco, Escape, nesting y scroll lock centralizados en `AdminDialog`.

## 3. Principio de ejecución restante

Desde Fase 4 se abandona la migración mecánica masiva.

Cada consumidor se revisará según su función visual y operativa, no únicamente según su variante.

Flujo obligatorio por consumidor:

1. inspeccionar estado real;
2. presentar recomendaciones;
3. definir composición con el usuario;
4. congelar esa composición;
5. implementar;
6. ejecutar smoke proporcional;
7. avanzar al siguiente consumidor.

No se debe rediseñar un grupo completo sin revisar previamente cada caso.

## 4. Fase 4 — Default: confirmaciones simples

Consumidores:

1. Ignorar incidencia durante 30 días.
2. Proponer eliminación.
3. Confirmación de dispositivo.
4. Proponer exclusión / reincorporación de producto.

Objetivos:

- jerarquía título/descripción;
- contexto principal;
- advertencias/notices;
- densidad de texto;
- Footer;
- Primary/Secondary/Danger;
- estados pending/error/retry;
- Mobile inset.

Los cuatro pueden compartir patrones, pero no se presupone composición idéntica.

## 5. Fase 5 — Default: formularios y tareas

Consumidores:

1. Descargar ajuste.
2. Editar grupo.
3. Configuración de valorizado.
4. Configurar producto.
5. Configuración pendiente.

Objetivos:

- formularios;
- fieldsets;
- agrupación de campos;
- bloques informativos;
- feedback;
- errores/retry;
- listas pequeñas;
- relación Body/Footer.

`Configuración pendiente` permanece inicialmente en `default`; solo podrá cambiar a `wide` si la revisión visual demuestra una necesidad real.

## 6. Fase 6 — Wide: gestión operativa

Consumidores:

1. Crear grupo.
2. Administrar categorías.
3. Integrantes de grupo.

Objetivos:

- secciones internas;
- divisores;
- encabezados internos;
- tablas/listas;
- búsqueda;
- acciones locales;
- scroll;
- densidad vertical;
- relación Body/Footer.

## 7. Fase 7 — Catálogo y nesting

Consumidores/flujos:

1. Detalle de propuesta.
2. Resolver precio.
3. Publicar catálogo.
4. Integración con Configurar producto.
5. Integración con Valorizado.
6. Smoke de nesting de dos y tres niveles.

Flujos críticos:

```text
Propuesta
└── Configurar producto
```

```text
Propuesta
└── Resolver precio
    └── Valorizado
```

No se reabre la arquitectura de foco/nesting ya congelada.

## 8. Fase 8 — Drawers

Consumidores:

1. Dashboard — detalle diario.
2. Control — Cronología.
3. Incidencias — Repeticiones.

Cada Drawer podrá adoptar un ancho inferior al máximo global de 960 px, incluido un ancho relativo como `50vw`, si su contenido lo justifica.

Evaluar individualmente:

- KPIs/contexto;
- tabla;
- navegación/paginación;
- ancho;
- densidad;
- Footer.

No se exige que los tres Drawers compartan el mismo ancho final.

## 9. Fase 9 — Consolidación visual transversal

Después de revisar los 19 consumidores:

- identificar patrones realmente repetidos;
- evaluar extracción de composiciones/primitives compartidas;
- normalizar spacing, headings, `dl`, notices, fieldsets, forms, tablas y Footer;
- evitar abstracciones prematuras.

Solo se extraerán primitives nuevas si la repetición real lo justifica.

## 10. Fase 10 — Cleanup agresivo

Revisar y retirar:

- CSS muerto;
- clases huérfanas;
- overrides anulados;
- estilos absorbidos;
- aliases redundantes;
- layouts históricos;
- wrappers JSX innecesarios;
- `admin-v2-actions` u otras estructuras sin función restante;
- media queries redundantes.

No reabrir:

- tablas globales;
- Shell;
- Sidebar;
- primitives cerradas fuera de este bloque.

## 11. Fase 11 — Revisión global

Auditoría transversal de los 19 consumidores:

- Header;
- Body;
- Footer;
- variant;
- spacing;
- scroll;
- responsive;
- acciones;
- feedback;
- loading;
- error;
- empty states;
- focus;
- nesting.

Criterios de consistencia:

- Cancelar/Cerrar usa tratamiento secundario;
- acción destructiva usa Danger cuando corresponda;
- CTA principal ocupa la posición final;
- navegación global de Drawer permanece en Footer;
- pending/error/retry no rompen la jerarquía;
- Footer conserva composición coherente entre estados.

## 12. Fase 12 — Validación, documentación y cierre

Validación técnica:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke prioritario:

- 1440;
- 1024/1023;
- 768/767;
- 430;
- 375.

Validar especialmente:

- default Mobile inset;
- wide Mobile fullscreen;
- drawer Mobile fullscreen;
- nested dialogs;
- scroll lock;
- Footer con contenido largo;
- tablas;
- paginación;
- pending/error/retry.

Al cierre se actualizará:

- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`

con composiciones definitivas, excepciones y estado final.

## 13. Secuencia congelada

```text
1. Preflight                              ✅
2. Primitive / normalización global      ✅
3. Consumidores / estructura             ✅
4. Default — confirmaciones             ✅
5. Default — formularios/tareas
6. Wide — gestión
7. Catálogo + nesting
8. Drawers
9. Consolidación visual transversal
10. Cleanup agresivo
11. Revisión global
12. Validación + documentación + cierre
```

> **Plan de Implementación V1: APROBADO Y CONGELADO.**
