# SOLOG — UX Admin — Paginación Local de Tablas V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — comportamiento transversal de renderizado y navegación local  
**Fecha:** 2026-09-17

## 1. Fuente primaria

Este documento es la **fuente primaria para la paginación local de las tablas principales de SOLOG Admin**.

En caso de contradicción con documentación anterior, este documento prevalece únicamente sobre:
- tamaño de página;
- visibilidad del paginador;
- orden entre filtrado/ordenamiento y paginación;
- comportamiento de página ante cambios de filtros;
- tratamiento específico de Catálogo.

El resto de decisiones congeladas de Admin permanece vigente.

Este bloque no modifica ni reemplaza `SOLOG_UI_Admin_Correcciones_Consistencia_V1.md`.

## 2. Objetivo

Limitar la cantidad de filas renderizadas simultáneamente en tablas administrativas que pueden crecer de forma relevante, manteniendo:
- datasets completos ya cargados en frontend;
- búsqueda local sobre el conjunto completo;
- filtros locales sobre el conjunto completo;
- ordenamiento local sobre el conjunto completo;
- contadores derivados del conjunto completo;
- rendimiento predecible en dispositivos de capacidades diferentes.

La paginación definida aquí es principalmente una estrategia de **renderizado frontend**, no una estrategia de carga parcial desde backend.

## 3. Regla general

La secuencia obligatoria es:

```text
Dataset completo
→ búsqueda
→ filtros
→ ordenamiento
→ contadores / derivados globales
→ paginación local
→ renderizado
```

No se permite paginar antes de filtrar, buscar u ordenar.

Los cambios de página nunca deben alterar, truncar ni reinterpretar el dataset completo almacenado o cacheado.

## 4. Productos — referencia funcional

`Productos` es la referencia funcional para la paginación local de:
- Control;
- Grupos;
- Incidencias.

Se conserva su enfoque actual:
- estado de página local;
- dataset completo procesado antes de paginar;
- corrección de páginas fuera de rango;
- navegación Anterior / Siguiente;
- información de página y rango visible.

No se exige copiar literalmente su implementación interna. Codex puede extraer o reutilizar helpers/primitives si reduce duplicación sin cambiar el comportamiento aprobado.

## 5. Tamaño de página estándar

Para las tablas principales siguientes:

- **Productos:** 50 filas por página.
- **Control:** 50 filas por página.
- **Grupos:** 50 filas por página.
- **Incidencias:** 50 filas por página.
- **Dashboard — detalle diario:** 50 filas por página.

El paginador se muestra únicamente cuando el resultado procesado contiene **más de 50 filas**.

Por tanto:
- 0–50 filas → sin paginador;
- 51 o más filas → paginación local.

## 6. Cambios de filtros, búsqueda y orden

Cuando una interacción cambia el universo visible, la vista debe volver a la primera página.

Aplica al menos a:
- búsqueda;
- filtros;
- estado;
- categoría;
- modalidad/tipo;
- ordenamiento;
- sede o alcance cuando afecte el conjunto visible;
- cualquier otro control equivalente que cambie el resultado procesado.

Si una actualización de datos reduce el número total de páginas y la página actual deja de existir, la página debe corregirse a una página válida.

## 7. Catálogo — regla específica

Catálogo conserva la separación semántica existente entre:
- **Urgentes**;
- **Emergentes**.

No deben fusionarse para paginar.

Cada sección tiene su propia paginación independiente:

- **Urgentes:** 25 propuestas por página.
- **Emergentes:** 25 propuestas por página.

Cada paginador se muestra únicamente cuando su propia sección contiene **más de 25 propuestas**.

Por tanto, Catálogo puede renderizar como máximo:
- 25 propuestas urgentes;
- 25 propuestas emergentes;
- máximo teórico simultáneo: 50 propuestas.

Cambiar el estado de propuestas o cualquier control que cambie el conjunto consultado debe devolver ambas secciones a su primera página.

La paginación de una sección no debe mover ni alterar la página de la otra.

## 8. Alcance

Este bloque incluye únicamente:

1. Productos — normalizar visibilidad del paginador con el límite vigente de 50.
2. Control — pasar la tabla principal de 100 a 50 filas por página.
3. Grupos — añadir paginación local de 50 a la tabla principal.
4. Incidencias — añadir paginación local de 50 a la tabla principal.
5. Catálogo — añadir paginación independiente de 25 para Urgentes y Emergentes.
6. Dashboard — añadir paginación local de 50 únicamente al diálogo de detalle diario (`DailyDrawer`).

## 9. Fuera de alcance

No se añade paginación por defecto a:
- Dashboard fuera del diálogo de detalle diario (`DailyDrawer`);
- Dispositivos;
- Categorías;
- cronologías;
- integrantes de grupos;
- pickers;
- modales secundarios;
- otras tablas o listas que difícilmente o nunca superan el umbral acordado.

No se modifica:
- backend;
- Supabase;
- contratos RPC/API;
- estrategia de carga completa ya vigente;
- caché existente;
- Cajero;
- Detalles;
- composición visual congelada de las tablas;
- semántica de filtros, estados o contadores.

Si una superficie fuera de alcance demuestra posteriormente un volumen real que justifique paginación, se tratará como un delta independiente.

## 10. Comportamiento visible

Para las superficies paginadas:
- `Anterior` queda deshabilitado en la primera página;
- `Siguiente` queda deshabilitado en la última página;
- la información visible debe permitir identificar la página actual;
- cuando sea aplicable, puede conservarse el rango visible y el total, siguiendo Productos como referencia;
- los controles deben usar el tratamiento visual normal de paginación de Admin;
- no deben aparecer controles de paginación cuando solo existe una página.

## 11. Criterios de aceptación

1. Productos conserva 50 filas máximas y oculta el paginador con ≤50 resultados.
2. Control renderiza como máximo 50 filas en su tabla principal.
3. Grupos renderiza como máximo 50 filas en su tabla principal.
4. Incidencias renderiza como máximo 50 filas en su tabla principal.
5. Catálogo renderiza como máximo 25 filas por sección.
6. Urgentes y Emergentes conservan paginación y estado independientes.
7. Búsqueda, filtros, ordenamiento y contadores operan sobre el dataset completo antes de paginar.
8. Cambiar un control que altere el conjunto visible devuelve la vista correspondiente a la primera página.
9. Una reducción del dataset no puede dejar la interfaz en una página inexistente.
10. No se realizan nuevas peticiones backend únicamente por cambiar de página.
11. No se introduce paginación en superficies fuera del alcance aprobado.
12. Dashboard `DailyDrawer` renderiza como máximo 50 filas y oculta el paginador con ≤50 resultados.
13. No se modifica backend, Supabase, Cajero ni Detalles.

> **Decisiones de paginación local de SOLOG Admin congeladas.**


## 12. Delta aprobado — Dashboard DailyDrawer

**Fecha:** 2026-09-19

Nueva evidencia de uso confirma que el detalle diario de Dashboard puede superar ampliamente las 50 filas, llegando a más de 400 conteos en un día.

Por tanto:
- `DailyDrawer` deja de estar fuera de alcance;
- utiliza paginación local estándar de **50 filas**;
- reutiliza `paginateAdminRows` y `AdminPagination`;
- el paginador aparece únicamente con **más de 50 filas**;
- el dataset completo permanece cargado y disponible;
- cambiar de página no genera una nueva petición backend;
- no se modifica el Dashboard principal, la grilla quincenal, tarjetas, métricas, columnas ni composición visual del diálogo.

Este delta reemplaza únicamente la exclusión previa de `DailyDrawer`. El resto del documento permanece vigente.

## 13. Reconciliación posterior — Dashboard DailyDrawer optimizado

**Fecha:** 2026-09-26  
**Estado:** VIGENTE — REEMPLAZA ÚNICAMENTE EL CONTRATO DE PAGINACIÓN DEL DAILYDRAWER

La regla histórica de este documento que definía para:

```text
Dashboard — detalle diario
→ paginación local de 50 filas
```

quedó reemplazada por la optimización backend posterior consolidada en:

```text
SOLOG_Backend_Contratos_Runtime_Actual_V2.md
```

El runtime vigente del Drawer diario utiliza:

```text
daily_detail_bootstrap
daily_detail_page
page_size = 25
```

Por tanto, para **Dashboard DailyDrawer** la regla actual es:

```text
paginación backend de 25 filas por página
```

Este delta no modifica el resto del contrato de este documento.

Permanecen vigentes:

- Productos → 50 filas locales;
- Control → 50 filas locales;
- Grupos → 50 filas locales;
- Incidencias → 50 filas locales;
- Catálogo → 25 propuestas por sección;
- filtrado, búsqueda, ordenamiento y contadores antes de paginar donde la paginación continúa siendo local.

La referencia de 50 filas para Dashboard debe considerarse **histórica/reemplazada únicamente en esa superficie**.

