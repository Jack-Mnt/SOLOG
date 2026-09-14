# SOLOG — Plan aprobado de implementación del refactor CSS V1

**Archivo:** `SOLOG_Refactor_CSS_Plan_Implementacion_V1.md`  
**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel C — arquitectura frontend/CSS  
**Fecha:** 2026-09-13

---

# 1. Propósito

Este documento congela el plan técnico que se seguirá para implementar la arquitectura CSS aprobada de SOLOG.

La implementación debe reorganizar ownership, carga y dependencias de estilos **sin rediseñar la aplicación ni modificar comportamiento funcional**.

Objetivo del bloque:

> **Mantener la misma aplicación y la misma UI intencional, reduciendo acoplamiento y carga de CSS irrelevante entre superficies.**

---

# 2. Fuentes primarias y prioridad

## 2.1. Arquitectura

Fuente primaria para decisiones de arquitectura CSS:

`docs/SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`

Estado:

**APROBADA Y CONGELADA**

Arquitectura congelada:

```text
GLOBAL
├─ foundations.css
└─ shared.css

OPERACIONAL
├─ operational.css
├─ cajero.css
└─ detalles.css

ADMIN
└─ admin.css

PÚBLICO
└─ Home/Login inicialmente sin optimización agresiva
```

## 2.2. Plan de ejecución

Este documento es la **fuente primaria para el orden, fases, validaciones y criterios de cierre de la implementación del refactor CSS V1**.

## 2.3. Prioridad ante contradicciones

1. Los contratos funcionales, backend, Motor y decisiones funcionales congeladas prevalecen siempre.
2. `SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md` prevalece para arquitectura y ownership CSS.
3. Este documento prevalece para el orden y método de implementación.
4. El checkpoint UI/UX vigente continúa aplicando para diagnóstico visual no reemplazado por estos documentos.
5. Ninguna idea exploratoria posterior modifica estas decisiones salvo aprobación explícita mediante delta o nueva versión.

---

# 3. Restricciones globales de implementación

Durante todo el bloque está prohibido:

- modificar backend;
- modificar Supabase;
- modificar tablas, funciones, RPC, Edge Functions, RLS o permisos;
- modificar contratos frontend/backend;
- cambiar lógica de negocio;
- modificar navegación funcional salvo necesidad técnica mínima demostrada;
- rediseñar Home, Login, Admin, Cajero o Detalles;
- reinterpretar decisiones UI/UX congeladas;
- realizar refactors generales no relacionados;
- renombrar masivamente clases;
- extraer componentes React por limpieza estética únicamente;
- activar `admin.v2.css`;
- eliminar CSS solo porque parezca legacy;
- corregir anomalías preexistentes que no bloqueen el refactor;
- debilitar pruebas para hacer pasar la migración.

Debe preservarse cualquier cambio preexistente del repositorio que no pertenezca a este alcance.

---

# 4. Regla central de migración

La primera implementación debe buscar:

> **equivalencia visual razonable con el baseline actual.**

Orden de prioridad:

```text
preservar funcionalidad
→ preservar apariencia intencional
→ reorganizar ownership
→ aislar carga
→ medir
```

No deben mezclarse en una misma fase:

```text
movimiento CSS
+
rediseño
+
renombrado general
+
refactor de componentes
```

La regla es:

> **Mover primero. Renombrar o rediseñar solo en bloques posteriores si existe una razón aprobada.**

---

# 5. Baseline técnico congelado

Baseline previo al refactor:

```text
bun run build
✓ tsc -b
✓ vite build

bun run lint
✓

git diff --check
✓
```

Build de producción:

## CSS

| Artefacto | Raw | Gzip |
|---|---:|---:|
| `index-*.css` | 155.10 kB | 26.36 kB |
| `admin.v2-*.css` | 30.99 kB | 5.30 kB |

Carga administrativa actual aproximada:

```text
155.10 kB global
+
30.99 kB Admin
=
186.09 kB raw
```

## JS relevante

| Artefacto | Raw | Gzip |
|---|---:|---:|
| entry | 202.02 kB | 63.81 kB |
| `protected-app` | 234.97 kB | 62.48 kB |
| Cajero app | 29.48 kB | 8.46 kB |
| Cajero | 57.14 kB | 14.91 kB |
| Detalles | 31.50 kB | 9.09 kB |
| Admin app | 68.78 kB | 16.92 kB |

No se fija un porcentaje obligatorio de reducción.

El resultado se evaluará contra este baseline y por aislamiento real de estilos entre familias.

---

# 6. Hallazgos técnicos congelados para la ejecución

## 6.1. Admin

Admin depende actualmente de una cascada compuesta:

```text
styles.css
+
admin.css
```

Existen selectores y clases presentes en ambos archivos.

Por tanto:

> **No se debe retirar CSS administrativo del global antes de reconstruir la base necesaria dentro de `admin.css`.**

`admin.v2.css` existe pero no participa en la carga activa y **no debe activarse**.

---

## 6.2. Detalles

Detalles reutiliza múltiples estilos y utilidades nominalmente pertenecientes a Cajero.

La migración debe separar primero:

```text
compartido operacional
vs.
propio de Cajero
vs.
propio de Detalles
```

No se debe copiar todo Cajero dentro de Detalles.

---

## 6.3. CSS legacy

La ausencia de coincidencias literales no demuestra que una clase esté muerta.

Debe considerarse:

- interpolación dinámica de clases;
- variantes por estado;
- clases generadas;
- fallbacks;
- consumidores indirectos.

No se eliminará CSS histórico durante este bloque salvo que su ausencia de uso esté demostrada y su retirada sea necesaria para completar la arquitectura. En caso contrario queda para limpieza posterior.

---

## 6.4. Anomalías preexistentes

Se registran, pero quedan fuera del alcance salvo bloqueo real:

- componentes que usan `.spin` mientras existe `.icon-spin`;
- referencias a variables aparentemente no definidas como `--color-warning-strong` y `--color-success-strong`;
- referencias históricas a `--radius-card` y `--shadow-soft`;
- reglas existentes en `admin.v2.css` sin import activo;
- posibles familias históricas sin consumidores actuales.

No deben corregirse aprovechando este refactor.

---

# 7. Orden obligatorio de implementación

La implementación se realizará en este orden:

```text
Fase 1 — Baseline e inventario definitivo
Fase 2 — Foundations + Shared
Fase 3 — Consolidación de Admin
Fase 4 — Extracción de Operational
Fase 5 — Separación de Cajero
Fase 6 — Separación de Detalles y carga Operational definitiva
Fase 7 — Medición final de bundles
Fase 8 — Regresión visual y funcional
Fase 9 — Cierre
```

No debe alterarse este orden sin un bloqueo técnico real.

Si aparece un bloqueo que requiera cambiar una decisión congelada, Codex debe detenerse, explicar:

1. qué bloquea;
2. por qué impide continuar;
3. qué decisión afecta;
4. cuál es el cambio mínimo recomendado.

No debe rediseñar automáticamente.

---

# 8. Fase 1 — Baseline e inventario definitivo

## Objetivo

Establecer una referencia reproducible inmediatamente antes de modificar CSS.

## Trabajo

- confirmar HEAD y estado de Git;
- confirmar cambios preexistentes;
- ejecutar baseline actual;
- identificar imports CSS;
- completar inventario de reglas relevantes;
- clasificar consumidores y destino;
- confirmar clases dinámicas;
- confirmar dependencias de cascada;
- registrar puntos sensibles de responsive;
- preparar baseline visual.

## Archivos

Inicialmente ninguno de producto.

No debe modificar CSS, JSX, DOM ni lógica.

## Inventario mínimo

Cada bloque relevante debe quedar clasificado como:

```text
foundations
shared
operational
cajero
detalles
admin
público
pendiente / legacy por verificar
```

Cuando sea necesario debe registrar:

- selector;
- condición/media query;
- archivo actual;
- orden relativo;
- consumidores;
- destino;
- dependencia de especificidad.

## Validaciones

```text
bun run build
bun run lint
git diff --check
```

Registrar:

- tamaños raw/gzip;
- chunks CSS;
- imports;
- pruebas existentes relacionadas.

## Validación visual

Capturas o comprobación equivalente de:

- `/`;
- `/login`;
- `/admin`;
- `/cajero`;
- `/detalles`.

Incluir estados relevantes:

- loaders;
- errores;
- dialogs;
- overlays;
- estados disabled;
- responsive.

Cajero debe revisarse con prioridad en formato Xiaomi Pad SE vertical.

## Criterio de finalización

No se comienza Fase 2 hasta tener baseline técnico y visual reproducible y todos los bloques a mover clasificados.

## Commit

No es obligatorio si solo se generan evidencias no versionadas.

No mezclar en un commit cambios previos del usuario con la implementación.

---

# 9. Fase 2 — Foundations + Shared

## Objetivo

Extraer del CSS monolítico los fundamentos globales y los estilos genuinamente compartidos.

## Destino

Arquitectura lógica:

```text
GLOBAL
├─ foundations.css
└─ shared.css
```

La ubicación física exacta debe ser coherente con el repositorio y no requiere crear capas adicionales.

## `foundations.css`

Debe recibir, según consumo real:

- tokens `:root`;
- paletas `data-palette`;
- tipografía base;
- `box-sizing`;
- `html`;
- `body`;
- herencia tipográfica de controles;
- focus global;
- reglas globales mínimas;
- reduced motion universal;
- fundamentos de geometría, color y estados.

No debe recibir composición específica de módulos.

## `shared.css`

Debe recibir únicamente estilos con consumidores transversales reales o necesarios antes de resolver la familia final, incluyendo según inventario:

- PanelLoader;
- PageShell/fallbacks actuales;
- botones realmente compartidos;
- `icon-button` si se mantiene transversal;
- base de paleta compartida;
- feedback realmente común.

## Regla importante

Las listas mixtas de selectores deben separarse sin cambiar valores.

## No modificar

- diseño;
- tokens;
- comportamiento de paletas;
- composición pública;
- componentes React.

## Riesgos

- perder una propiedad aportada por un selector agrupado;
- alterar orden de focus;
- mover selectores específicos junto con una regla global;
- modificar reduced motion del loader.

## Validaciones

- build;
- lint;
- `git diff --check`;
- pruebas del loader;
- pruebas de lazy loading/fallbacks;
- verificación de que `shared.css` no arrastre familias específicas.

## Validación visual

- Home;
- Login;
- fallback de autenticación;
- loader global;
- loader contenido;
- error de acceso;
- paletas;
- focus por teclado.

## Criterio de finalización

- foundations contiene solo fundamentos;
- shared contiene solo reglas justificadamente transversales;
- sin diferencias visuales nuevas.

## Commit

Sí. Fase independiente.

---

# 10. Fase 3 — Consolidación de Admin

## Objetivo

Hacer que Admin sea autocontenido respecto a estilos administrativos.

## Arquitectura objetivo

```text
foundations
+
shared
+
admin.css
```

Admin no debe depender de reglas administrativas alojadas en el CSS global.

## Trabajo

Trasladar desde el CSS global hacia `admin.css`:

- base de workspace;
- sidebar;
- header;
- tabs;
- responsive;
- dialogs;
- filtros;
- controles;
- tablas;
- estilos históricos todavía consumidos;
- notices si son exclusivos de Admin.

Preservar la cascada efectiva actual:

```text
base histórica necesaria
→ overrides Admin vigentes
```

## No hacer

- no activar `admin.v2.css`;
- no dividir Admin por módulo;
- no normalizar visualmente Admin;
- no cambiar componentes;
- no cambiar navegación;
- no cambiar siete módulos lazy.

## Riesgos

- invertir overrides;
- perder sticky;
- romper sidebar colapsado;
- romper dialogs;
- perder variables locales;
- retirar bases compartidas que siguen siendo necesarias.

## Validaciones

- build;
- lint;
- `git diff --check`;
- pruebas administrativas relevantes;
- comprobar que el global deja de contener composición Admin activa.

## Validación visual

Revisar:

- Dashboard;
- Control;
- Catálogo;
- Productos;
- Grupos;
- Incidencias;
- Dispositivos;
- sidebar expandido;
- sidebar colapsado;
- header contextual/global;
- filtros;
- tablas;
- dialogs;
- overlays.

## Criterio de finalización

Admin funciona con su CSS propio y ya no depende de CSS administrativo contenido en el global.

## Commit

Sí. Fase independiente.

---

# 11. Fase 4 — Extracción de Operational

## Objetivo

Extraer la base realmente compartida entre Cajero y Detalles.

## Arquitectura

```text
OPERACIONAL
└─ operational.css
```

## Candidatos confirmados

Según inventario real:

- shell;
- header base;
- main/container;
- módulo base;
- estados vacíos;
- loading;
- alertas comunes;
- cobertura/anillo;
- stock base;
- métricas base;
- selección;
- historial compartido;
- estados de diferencia contextualizados;
- responsive compartido.

## Regla de nombres

No se requiere renombrar selectores `cajero-*` durante esta fase.

Ownership y nombre del selector son problemas distintos.

## Condición transitoria aprobada

Durante esta fase se permite **cargar temporalmente `operational.css` de forma global** si es necesario para preservar el orden de cascada mientras Detalles todavía conserva overrides en su ubicación anterior.

Esta carga global:

> **es estrictamente temporal.**

No puede permanecer en el estado final.

Debe retirarse obligatoriamente en Fase 6.

El bloque no podrá considerarse cerrado mientras Operational siga cargándose globalmente.

## No modificar

- JSX;
- DOM;
- utilidades JS;
- comportamiento;
- lógica de Cajero;
- lógica de Detalles.

## Riesgos

- mover variantes exclusivas a Operational;
- invertir orden con `.details-shell`;
- alterar responsive de historial;
- alterar la posición de `.cajero-history-categories`;
- convertir estados contextuales en utilidades globales.

## Validaciones

- build;
- lint;
- `git diff --check`;
- inventario de consumidores;
- pruebas de historial;
- comprobación de orden de imports.

## Validación visual

Comparar Cajero y Detalles:

- shell;
- header;
- cobertura;
- stock;
- métricas;
- selección;
- historial;
- diferencias;
- empty states;
- alertas.

## Criterio de finalización

La base operacional compartida queda extraída sin copiar todo Cajero y sin cambiar visualmente ambas superficies.

## Commit

Sí. Fase independiente.

---

# 12. Fase 5 — Separación de Cajero

## Objetivo

Mover el CSS exclusivo del conteo a la frontera lazy del módulo Cajero.

## Destino

```text
cajero.css
```

## Contenido esperado

- navegación inferior;
- elementos exclusivos del header Cajero;
- indicador interactivo de stock;
- Inicio;
- cobertura accionable cuando la variante sea exclusiva;
- selección operativa;
- envío;
- Conteo;
- Conteo diario;
- Revisar;
- captura;
- modal de captura;
- calculadora;
- drafts;
- acciones y estados exclusivos;
- variantes propias del Historial.

## Preservar

- `operational.css` antes del específico de Cajero;
- safe areas;
- touch targets;
- layouts tablet-first;
- scroll;
- captura;
- grids;
- comportamiento de modales.

## No modificar

- sesiones;
- drafts;
- buffer;
- cálculos;
- envío;
- recuperación;
- rutas;
- textos;
- botones;
- lógica.

## Riesgo principal

Mover a Cajero una regla todavía utilizada por Detalles.

Cada regla debe confirmarse contra consumidores antes de trasladarse.

## Validaciones

- build;
- lint;
- `git diff --check`;
- pruebas de integración Cajero;
- pruebas de captura;
- calculadora;
- historial;
- verificar chunk CSS específico de Cajero;
- verificar ausencia de CSS Admin en la ruta.

## Validación visual

Prioridad:

**Xiaomi Pad SE vertical.**

Revisar:

- Inicio;
- Conteo;
- Conteo diario;
- Revisar;
- Historial;
- calculadora;
- modal;
- navegación;
- disabled;
- errores;
- recuperación;
- stock.

## Criterio de finalización

El CSS exclusivo de Cajero queda fuera del entry global y Detalles sigue funcionando sin depender de `cajero.css`.

## Commit

Sí. Fase independiente.

---

# 13. Fase 6 — Separación de Detalles y carga Operational definitiva

## Objetivo

Aislar los estilos propios de Detalles y convertir Operational en dependencia real de ambas familias lazy.

## Destino

```text
detalles.css
```

## Contenido esperado

- `.details-*`;
- `.export-period__*`;
- overrides consultivos;
- dialog de historial de Detalles;
- responsive exclusivo;
- estilos propios de dispositivo;
- resumen;
- exportación;
- detalle de casos.

## Orden final esperado

```text
Cajero:
foundations
→ shared
→ operational
→ cajero

Detalles:
foundations
→ shared
→ operational
→ detalles
```

## Obligación crítica

Retirar la carga global temporal de `operational.css` introducida en Fase 4.

Si Operational continúa global:

> **Fase 6 NO está completada.**

## Preservar

- `.details-shell`;
- overrides consultivos actuales;
- historial compartido;
- `icon-button` compartido si corresponde;
- orden de cascada;
- entrada directa a `/detalles`.

## No modificar

No implementar todavía:

- `Modo consulta`;
- CTA `Ir al panel Cajero`;
- cambios de autorización;
- rediseño de métricas;
- correcciones visuales derivadas de auditoría;
- cambios de exportación;
- cambios de historial.

Estos pertenecen al bloque UI/UX posterior.

## Riesgos

- Detalles funciona solo después de visitar Cajero;
- FOUC;
- estilos acumulados en navegación SPA;
- orden tardío de Operational;
- pérdida de overrides.

## Validaciones

- build;
- lint;
- `git diff --check`;
- pruebas de Detalles;
- entrada fría a `/detalles`;
- grafo de imports;
- recursos cargados;
- navegación cruzada.

## Validación visual

- dispositivo;
- métricas;
- cobertura;
- stock;
- exportación;
- historial;
- casos;
- dialogs;
- errores;
- Cajero → Detalles;
- Detalles → Cajero;
- recarga directa.

## Criterio de finalización

- Operational ya no está global;
- Detalles tiene CSS propio;
- Detalles no depende de `cajero.css`;
- ambas familias cargan Operational correctamente.

## Commit

Sí. Fase independiente.

---

# 14. Fase 7 — Medición final de bundles

## Objetivo

Demostrar que la arquitectura modifica realmente ownership y carga.

## Validaciones

Ejecutar:

```text
bun run build
bun run lint
git diff --check
```

Registrar:

- CSS raw;
- CSS gzip;
- chunks;
- recursos por ruta;
- imports;
- carga fría;
- navegación SPA.

## Verificaciones esperadas

```text
/cajero
→ foundations/shared + operational + cajero
→ sin CSS Admin

/detalles
→ foundations/shared + operational + detalles
→ sin CSS Admin ni CSS exclusivo de Cajero

/admin/*
→ foundations/shared + admin
→ sin CSS específico de Cajero/Detalles
```

Home/Login pueden seguir compartiendo carga inicial según arquitectura aprobada.

## No hacer

- no modificar `manualChunks`;
- no cambiar minificación;
- no mover dependencias solo para mejorar cifras;
- no perseguir porcentajes arbitrarios.

## Criterio de finalización

Existe comparación documentada contra el baseline y el aislamiento CSS se demuestra por ruta.

## Commit

Opcional si se versionan evidencias.

---

# 15. Fase 8 — Regresión visual y funcional

## Objetivo

Confirmar equivalencia visual y funcional con el baseline.

## Regla

Solo pueden corregirse regresiones introducidas por el refactor.

No deben corregirse defectos visuales preexistentes salvo que impidan validar equivalencia.

## Matriz mínima

### Rutas

- `/`
- `/login`
- `/cajero`
- `/detalles`
- `/admin`
- subrutas administrativas;
- subrutas de Cajero;
- recarga directa.

### Público

- Home desktop;
- Home móvil;
- Login desktop;
- Login móvil;
- errores;
- disabled;
- submit.

### Admin

- siete módulos;
- sidebar expandido/colapsado;
- paletas;
- filtros;
- tablas;
- dialogs;
- overlays.

### Cajero

- Xiaomi Pad SE vertical;
- Inicio;
- Conteo;
- Diario;
- Revisar;
- Historial;
- navegación inferior;
- captura;
- calculadora;
- envío;
- estados operativos.

### Detalles

- dispositivo;
- métricas;
- stock;
- exportación;
- historial;
- casos.

### Interacción

- focus;
- hover;
- active;
- disabled;
- teclado;
- backdrop;
- Escape;
- scroll;
- dialogs.

### Responsive

Revisar ambos lados de breakpoints afectados.

### Semántica

- success;
- warning;
- error;
- positivo;
- cero;
- negativo;
- valor descartado.

### Accesibilidad

- reduced motion;
- loaders;
- fallbacks previos a lazy loading.

### Aislamiento

Navegar entre familias y confirmar que estilos cargados previamente no contaminan visualmente la superficie posterior.

## Criterio de finalización

No quedan regresiones atribuibles al refactor.

## Commit

Sí para correcciones necesarias de equivalencia.

---

# 16. Fase 9 — Cierre

## Objetivo

Cerrar formalmente el bloque de arquitectura CSS.

## Comprobaciones

- arquitectura final alcanzada;
- `operational.css` no queda global;
- Admin es autocontenido;
- Cajero aislado;
- Detalles aislado;
- global reducido a foundations/shared + carga pública permitida;
- no quedaron imports transitorios;
- build aprobado;
- lint aprobado;
- `git diff --check` aprobado;
- bundles medidos;
- regresión completada;
- cambios preexistentes preservados.

## No incluir

No aprovechar el cierre para:

- limpiar legacy adicional;
- rediseñar;
- renombrar selectores;
- introducir abstracciones nuevas;
- ejecutar mejoras UI/UX.

## Criterio de finalización

El bloque se declara explícitamente:

> **SOLOG — Refactor arquitectura CSS V1: IMPLEMENTADO, VALIDADO Y CERRADO.**

## Commit

Sí si corresponde al cierre/documentación final.

---

# 17. Pruebas acopladas a la ubicación CSS

Se identificaron pruebas que inspeccionan directamente `src/styles.css`, incluyendo:

- `tests/index-phase2.test.ts`;
- `tests/s10-frontend.test.ts`;
- `tests/cajero-integration-phase3.test.ts`.

Durante la migración:

> **se permite actualizar únicamente la fuente/archivo CSS que leen.**

Debe preservarse la intención de cada aserción.

Está prohibido:

- eliminar la aserción;
- relajarla sin motivo;
- convertirla en un check trivial;
- cambiar el comportamiento esperado para acomodar el refactor.

---

# 18. Home/Login

Home y Login quedan deliberadamente fuera de una optimización agresiva durante este bloque.

No se exige:

- convertir Home a lazy;
- convertir Login a lazy;
- crear chunks CSS independientes;
- reestructurar su composición.

Si después de medir el resultado existe una oportunidad relevante, deberá abordarse como optimización separada.

---

# 19. Cambios UI/UX pendientes fuera del alcance

Este plan no implementa decisiones posteriores de UI/UX.

Entre ellas:

## Detalles

Ya aprobados para un bloque posterior:

- reemplazar conceptualmente `Solo lectura` por **`Modo consulta`**;
- cuando el dispositivo esté autorizado, mostrar CTA **`Ir al panel Cajero`** hacia `/cajero`.

Continúa como propuesta, no aprobada por este documento:

- botón `Comprobar acceso` para solicitudes pendientes.

## Admin

Queda pendiente la normalización visual derivada de la auditoría.

## Cajero

Queda pendiente únicamente trabajo puntual posterior; no rediseño general.

## Home/Login

Quedan pendientes refinamientos menores posteriores.

---

# 20. Política de avance por fases

El plan completo está aprobado.

Sin embargo, la ejecución debe ser controlada fase por fase.

Después de cada fase Codex debe informar:

1. archivos modificados;
2. reglas movidas;
3. dependencias preservadas;
4. pruebas ejecutadas;
5. build/typecheck;
6. lint;
7. `git diff --check`;
8. validación visual realizada o pendiente;
9. bundles si corresponde;
10. bloqueos o desviaciones.

Si la fase produce un bloqueo que afecta una decisión congelada:

> detener implementación y devolver el problema a ChatGPT/usuario.

No avanzar silenciosamente con un rediseño.

---

# 21. Estado final del plan

**PLAN APROBADO Y CONGELADO.**

Este documento autoriza la implementación por fases del refactor CSS V1 conforme a la arquitectura congelada.

El primer trabajo de Codex debe ser:

> **ejecutar Fase 1 — Baseline e inventario definitivo, reportar resultados y detenerse antes de Fase 2.**
