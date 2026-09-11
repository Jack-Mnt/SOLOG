# SOLOG — Arquitectura Admin Master Data, Caché y Rutas V1

**Estado:** CONGELADO  
**Proyecto:** SOLOG  
**Ámbito:** Admin — Catálogo / Productos / Grupos / Categorías / navegación / lecturas compartidas  
**Nivel:** C — arquitectura funcional, estrategia de datos y contratos dependientes  
**Fecha de congelación:** 2026-09-11  
**Fuente primaria para este alcance:** este documento

---

## 1. Propósito y prevalencia

Este documento congela la nueva arquitectura administrativa para:

- separar `Productos` de `Catálogo`;
- compartir una única caché de master data entre Productos, Grupos, Categorías y selectores de Catálogo;
- simplificar Grupos;
- incorporar administración mínima de Categorías;
- reorganizar el sidebar;
- reducir lecturas redundantes y egress de Supabase.

Para estos temas, este documento prevalece sobre descripciones anteriores de navegación, pestañas, estrategia de lectura, caché y UI de:

- `SOLOG_Arquitectura_Catalogo_Responsabilidad_Comportamiento_Funciones_V1.md`;
- documentación histórica de UI de Catálogo ya archivada;
- `SOLOG_Arquitectura_Grupos_Responsabilidad_Comportamiento_Funciones_V1.md`;
- `SOLOG_Backend_Grupos_Contrato_Tecnico_V1.md`;
- `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md`;
- cualquier implementación legacy que contradiga este alcance.

La prevalencia es **solo para este alcance**. Las responsabilidades de dominio, reglas comerciales, mutaciones, invariantes, publicación, Motor y seguridad de los documentos anteriores continúan vigentes donde este documento no las modifica.

La nota intermedia usada durante el diseño de lecturas Admin fue archivada. **No es autoritativa y queda reemplazada por este documento.**

---

## 2. Principio arquitectónico

La arquitectura Admin separa:

```text
datos operativos
≠
master data
≠
ciclo de publicación de Catálogo
```

El master data compartido queda compuesto por:

```text
Productos
Grupos
Categorías
Revisiones
```

y tendrá una única autoridad de caché frontend.

Objetivo:

```text
primera entrada a una superficie que necesita master data
→ una carga lazy completa
→ caché compartida en memoria
→ filtros, búsquedas, integrantes y relaciones en frontend
```

No habrá polling del master data.

---

# 3. Nueva organización del Admin

La navegación principal queda:

```text
ADMIN

OPERACIÓN
├── Dashboard
├── Control
└── Incidencias

INVENTARIO
├── Catálogo
├── Productos
└── Grupos

SISTEMA
└── Dispositivos
```

`Categorías` no tendrá ruta propia en V1.

Se administra desde Grupos mediante una acción secundaria:

```text
[ Administrar categorías ]
```

---

# 4. Catálogo

## 4.1 Responsabilidad visible

Catálogo queda centrado en:

- Propuestas;
- aprobación / ignorado / retiro;
- preparación y staging;
- resolución de precio;
- preview;
- publicación y versionado.

Se elimina de Catálogo la pestaña administrativa:

```text
[ Productos ]
```

La separación es de **información y navegación**, no de autoridad de dominio.

Catálogo continúa siendo autoridad para:

- nombre comercial;
- barcode;
- precio unitario;
- inclusión / exclusión / reincorporación;
- altas;
- eliminación;
- publicación.

---

## 4.2 Selectores de Catálogo

Cuando Catálogo necesite:

- categorías;
- grupos compatibles;
- productos;
- valorizado actual;
- relaciones grupo ↔ SKU;

debe reutilizar la caché master compartida si ya está cargada.

Si todavía no está cargada, podrá solicitarla lazy en ese momento.

Entrar a `Catálogo > Propuestas` **no obliga** a descargar el master data completo si ninguna acción abierta lo necesita.

Las propuestas continúan con su estrategia lazy por estado.

---

# 5. Productos

## 5.1 Ruta propia

Productos pasa a una ruta independiente:

```text
/admin/productos
```

Deja de ser una pestaña de Catálogo.

La nueva ruta reutiliza la funcionalidad maestra actual de Productos, pero obtiene sus datos desde la caché master compartida.

---

## 5.2 Responsabilidad

Productos es una **vista administrativa del universo actual de SKU**, no una nueva autoridad backend independiente.

Debe poder mostrar todos los SKU necesarios para administración, incluyendo excluidos.

Mantiene las acciones de ciclo de vida que ya pertenecen a Catálogo, delegándolas a los contratos de Catálogo V3 cuando corresponda.

No crea una vía alternativa para:

- modificar precio unitario;
- publicar;
- incluir/excluir/reincorporar fuera del flujo Catálogo;
- cambiar nombre comercial fuera de Catálogo.

---

## 5.3 Filtros

Búsqueda, filtros, ordenamiento y paginación visual se realizan localmente sobre el dataset cargado.

No generan nuevas consultas a Supabase.

---

# 6. Grupos

## 6.1 Responsabilidad

Grupos continúa siendo autoridad de la topología de conteo:

- composición de grupos;
- mover SKU incluidos;
- separar a Único;
- crear grupos;
- máscara operativa;
- categoría del grupo;
- valorizado por paquete.

Las reglas funcionales congeladas en `SOLOG_Arquitectura_Grupos_Responsabilidad_Comportamiento_Funciones_V1.md` siguen vigentes salvo la UI/lecturas reemplazadas por este documento.

---

## 6.2 Tabla principal

La vista principal de Grupos se simplifica a:

```text
Grupo        Categoría        Integrantes        Valorizado
──────────────────────────────────────────────────────────
Cielo 625ml  Agua             2 SKU [+]           S/ 1.20/u
                                                 Sin paquete     [valor] [✎]

CIELO 7LT    Agua             Único [+]           S/ 9.00/u
                                                 x6 · S/ 48      [valor] [✎]
```

Las columnas principales son:

```text
Grupo
Categoría
Integrantes
Valorizado
```

Se elimina la necesidad de una columna separada `Tipo`.

`Único` / `N SKU` se expresa dentro de `Integrantes`.

---

## 6.3 Acciones por columna

### Grupo

Muestra el nombre/máscara operativa.

### Categoría

Muestra la categoría actual.

### Integrantes

Muestra:

```text
Único [+]
```

o:

```text
N SKU [+]
```

El control abre el modal operativo de integrantes.

Desde el mismo modal se permite:

- ver integrantes;
- buscar candidatos;
- agregar;
- mover;
- separar a Único.

No existe clasificación manual `Único / Agrupado`.

### Valorizado

Muestra siempre el precio unitario como referencia de solo lectura:

```text
S/ X.XX / unidad
```

y debajo:

```text
Sin paquete
```

o:

```text
xN · S/ XX.XX
```

El icono/acción de valorizado abre:

```text
Configuración de valorizado
```

El precio unitario nunca se edita desde Grupos.

### Lápiz

El lápiz queda reservado para:

```text
Editar grupo
```

y permite modificar:

- máscara;
- categoría.

---

## 6.4 Detalle de grupo

Se deja de utilizar un “detalle pasivo” como pieza central de la UX.

La información del grupo y sus integrantes se deriva localmente de la caché compartida.

El modal principal asociado a Integrantes debe ser operativo, no meramente informativo.

---

## 6.5 Búsqueda y filtros

La vista de Grupos realiza en frontend:

- búsqueda por máscara;
- búsqueda por producto integrante;
- búsqueda por `c_interno`;
- filtro de categoría;
- filtro por tipo derivado si se conserva como filtro;
- filtro con/sin valorizado;
- ordenamiento.

Cambiar búsqueda, filtro u orden **no consulta Supabase**.

---

# 7. Categorías

## 7.1 Ubicación

Categorías se administra desde Grupos:

```text
[ Administrar categorías ]
```

Puede abrir:

- modal amplio;
- vista secundaria dentro del módulo.

No tendrá ruta/sidebar independiente en V1.

---

## 7.2 Operaciones V1

Solo se permiten:

```text
Crear categoría
Renombrar categoría
Cambiar orden
```

No se implementan:

```text
activar / desactivar
eliminar
fusionar
```

---

## 7.3 Campo `activo`

La columna backend existente no se elimina en este bloque.

Regla V1:

```text
nueva categoría → activo = true
```

El Admin no expone un control para modificarlo.

Las categorías actuales pueden seguir existiendo aunque no tengan grupos o productos.

---

## 7.4 Visibilidad en Cajero

Cajero no decide la visibilidad de una categoría por un switch administrativo.

La regla funcional es:

```text
categoría con productos/grupos disponibles para contar
→ visible

categoría vacía
→ no visible
```

Una categoría vacía puede existir sin afectar la operación y queda lista para usarse sin una activación previa.

---

## 7.5 Vista de administración

La vista puede mostrar:

```text
Orden
Categoría
N grupos
N productos
```

Los conteos se derivan del master data ya cargado.

No requieren RPC adicional.

---

# 8. Master data compartido

## 8.1 Carga lazy

El master data **no** se carga al entrar a `/admin`.

Se solicita por primera vez al entrar a:

```text
/admin/productos
/admin/grupos
```

o cuando una acción de Catálogo requiera esa información.

Después queda disponible para todas esas superficies mientras viva la sesión Admin.

---

## 8.2 Dataset normalizado

El contrato técnico deberá devolver conceptualmente:

```text
categories[]
groups[]
products[]
revisions
```

La RPC exacta, nombres finales de campos, grants, payload y envelope se congelarán en el contrato backend específico antes de enviar la implementación dependiente a Codex.

---

## 8.3 Categorías

Forma conceptual mínima:

```text
id
nombre
orden
```

`activo` puede existir internamente, pero no forma parte de la UX de administración V1.

---

## 8.4 Grupos

Forma conceptual mínima:

```text
id
nombre
categoria_id
precio
unidades_por_paquete
precio_paquete
member_count
estado derivado / información necesaria
```

Se evita repetir innecesariamente nombres de categoría o relaciones que puedan resolverse desde IDs.

---

## 8.5 Productos

Debe ser el **superset** requerido por Productos y Grupos.

Forma conceptual mínima:

```text
c_interno
producto
c_barras
marca
precio
estado
categoria_id
grupo_id
```

Debe incluir los SKU excluidos necesarios para la vista Productos.

Grupos deriva localmente solo los SKU válidos para composición.

---

# 9. Relaciones derivadas en frontend

El frontend puede resolver:

```text
categoria_id → categories
grupo_id → groups
```

y:

```text
integrantes(grupo)
→ products.filter(product.grupo_id === grupo.id)
```

No se vuelve a pedir `group_detail` para abrir la gestión normal del grupo.

No se vuelve a pedir una página de `products` para cada búsqueda de candidatos.

---

# 10. Estrategia de caché

Existe una sola autoridad frontend para este master data.

No deben coexistir cachés independientes de Productos y Grupos que puedan mantener revisiones distintas de la misma estructura.

La caché vive mientras permanezca válida la sesión/contexto Admin.

---

## 10.1 No invalidan por navegación

Cambiar entre:

```text
Catálogo
Productos
Grupos
```

no produce un refetch si el master data sigue válido.

---

## 10.2 Refetch autoritativo completo

Después de una mutación confirmada que cambie el master:

```text
backend confirma
→ actualizar revisiones autoritativas
→ recargar master data completo
→ reemplazar caché
```

Aplica a:

- mutaciones estructurales de Grupos;
- `valuation_save`;
- crear/renombrar/reordenar categoría;
- publicación de Catálogo;
- otras mutaciones futuras que realmente modifiquen este master.

No se implementa un sistema optimista complejo.

---

## 10.3 Conflictos

Ante conflicto de revisión:

```text
SOLOG_MASTERDATA_REVISION_CONFLICT
```

se descarta la intención inválida, se recarga el master data autoritativo y cualquier nueva acción usa un nuevo `operation_id`.

Ante:

```text
SOLOG_CATALOG_STAGING_CONFLICT
```

no se hace retry automático. Se refresca autoridad y se presenta el bloqueo.

Los retries del mismo payload exacto por transporte/lock conservan su `operation_id` según los contratos ya congelados.

---

## 10.4 Invalidación de sesión

La caché se descarta en:

- logout;
- cambio de identidad;
- recarga completa;
- destrucción del contexto Admin;
- incompatibilidad contractual.

No habrá polling.

---

# 11. Egress

Baseline medido durante el preflight:

```text
Catálogo products actual     ≈ 408 KB
Catálogo reference actual    ≈ 114 KB
Grupos page 50               ≈ 13–14 KB por lectura
```

Una representación normalizada conceptual de:

```text
Productos + Grupos + Categorías
```

resultó de aproximadamente:

```text
357 KB
```

con los datos actuales.

El objetivo no es optimizar por byte aislado, sino evitar:

- descargar los mismos grupos/categorías varias veces;
- consultas por filtros;
- consultas por detalle;
- consultas por candidatos;
- caches desincronizadas.

---

# 12. Módulos que NO se consolidan con este master data

La revisión global determinó que no conviene fusionar lecturas de otros módulos solo por reducir el número de RPC.

Se mantienen sus estrategias actuales:

## Dashboard

- `dashboard_cards`: lectura agregada pequeña y live;
- `shift_grid`: lazy por sede/período;
- `daily_detail`: lazy.

La coherencia de cobertura diaria ya fue corregida en backend mediante:

```text
20260911155102_solog_dashboard_daily_coverage_frozen_universe_v1
```

`daily_coverage` usa el mismo universo diario congelado que `shift_grid`.

Este punto queda cerrado y fuera del rebuild de master data.

## Control

Se mantiene:

- dataset por período;
- filtros/paginación frontend donde ya aplica;
- cronología bajo demanda.

## Incidencias

Se mantiene:

- `summary` por ámbito;
- filtros locales;
- `detail` bajo demanda.

## Dispositivos

Se mantiene una carga pequeña de lista completa.

## Propuestas Catálogo

Se mantienen lazy por estado; no se obliga a descargar historial de otros estados al entrar.

---

# 13. Gate backend antes de Codex — COMPLETADO

El gate técnico exigido por esta arquitectura ya fue completado el 2026-09-11.

Fuente técnica vigente:

`SOLOG_Backend_Admin_MasterData_Contrato_Tecnico_V1.md`

Quedaron desplegadas y validadas:

- la lectura `bootstrap` del master data compartido;
- las revisiones `groups`, `catalog` y `categories`;
- las mutaciones `category_create`, `category_rename` y `category_reorder`;
- autorización, idempotencia, locks, conflictos de revisión y egress.

Por tanto, Codex ya puede preparar baseline/plan e implementar el **frontend** contra este contrato. No debe modificar Supabase salvo petición explícita del usuario; una necesidad backend no cubierta debe devolverse a ChatGPT como bloqueo.

---

# 14. Fuera de alcance

No se rediseña en este bloque:

- Motor;
- Cajero;
- Control;
- Incidencias;
- Dispositivos;
- lógica de propuestas;
- reglas comerciales de Catálogo;
- publicación ConeXion;
- reglas de diferencias/reconteo.

No se retiran automáticamente RPC legacy hasta comprobar que no tienen consumidores reales.

---

# 15. Decisiones congeladas

Queda congelado:

```text
Productos deja Catálogo y obtiene /admin/productos.

Catálogo queda centrado en Propuestas + staging + publicación.

Productos, Grupos y Categorías comparten una única carga master lazy.

La caché es normalizada, compartida y autoritativa.

Grupos usa tabla:
Grupo | Categoría | Integrantes | Valorizado.

Integrantes se administra mediante modal operativo.

Valorizado es accesible directamente desde la tabla.

El lápiz edita máscara + categoría.

Categorías se administra dentro de Grupos.

Categorías V1 solo permite:
crear, renombrar y reordenar.

No hay activar/desactivar, eliminar ni fusionar categorías.

Categoría vacía no aparece en Cajero.

Sidebar:
Operación / Inventario / Sistema.

Filtros y búsquedas del master data son frontend.

No hay polling.

Después de mutación/publicación se recarga el master completo.
```

Este documento es la fuente primaria para el próximo bloque Admin relacionado con master data, rutas, caché compartida y reorganización visual.
