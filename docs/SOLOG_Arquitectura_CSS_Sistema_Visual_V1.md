# SOLOG — Arquitectura CSS del Sistema Visual V1

**Archivo:** `SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`  
**Proyecto:** SOLOG  
**Estado:** CONGELADA  
**Clasificación:** Nivel C — arquitectura frontend/CSS  
**Fecha:** 2026-09-13

---

## 1. Propósito

Este documento congela la arquitectura CSS aprobada para SOLOG después de:

1. auditoría visual de Home, Login, Admin, Detalles y Cajero;
2. revisión transversal del sistema visual;
3. preflight técnico del repositorio;
4. medición de baseline de producción mediante Vite.

Su objetivo es reorganizar la carga y propiedad de estilos sin alterar el comportamiento funcional ni rediseñar las superficies actuales.

La primera implementación de esta arquitectura debe buscar:

> **misma aplicación y misma UI intencional, con CSS organizado por responsabilidad y sin cargar estilos irrelevantes entre superficies.**

---

## 2. Fuente primaria y prioridad

Este documento es la **fuente primaria para la arquitectura CSS y el refactor estructural de estilos de SOLOG V1**.

### Referencias

- `Flujo_de_desarrollo_eficiente_V1.md`
- contratos funcionales/backend vigentes de cada módulo.

### Prioridad ante contradicciones

1. Los contratos funcionales, backend, Motor y decisiones funcionales congeladas prevalecen sobre este documento.
2. Este documento prevalece para la arquitectura CSS, ownership de estilos, estrategia de carga y restricciones del refactor.
3. El checkpoint de auditoría visual continúa vigente para el diagnóstico UI/UX que este documento no reemplace.
4. Cualquier cambio posterior a esta arquitectura debe documentarse como delta o nueva versión.

---

## 3. Estado de las decisiones

### Congelado

- arquitectura CSS por familias;
- separación entre global, operacional y Admin;
- ausencia de optimización agresiva inicial para Home/Login;
- refactor separado del rediseño;
- backend fuera de alcance;
- conservación de clases y DOM salvo necesidad técnica mínima;
- búsqueda de equivalencia visual durante la migración.

### No congelado por este documento

- rediseño visual de Admin;
- diseño definitivo de Detalles;
- refinamientos de Home/Login;
- cambios visuales de Cajero;
- división futura de Admin por módulo;
- renombrado general de clases;
- extracción de componentes React compartidos;
- objetivos porcentuales de reducción de bundle.

---

# 4. Arquitectura aprobada

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

Esta estructura es la arquitectura aprobada.

No debe reinterpretarse como autorización para crear más capas o subdivisiones salvo que el plan técnico demuestre que son necesarias para preservar el comportamiento actual.

---

# 5. Responsabilidad de cada capa

## 5.1. `foundations.css`

Debe contener exclusivamente fundamentos globales y de bajo nivel, como:

- tokens de identidad SOLOG;
- paletas de interfaz;
- colores semánticos;
- neutros;
- superficies;
- bordes;
- focus;
- sombras;
- radios;
- transiciones;
- tipografía base;
- reset/base;
- `box-sizing`;
- reglas globales mínimas de `html` y `body`;
- comportamiento base de controles;
- accesibilidad global;
- `prefers-reduced-motion` cuando corresponda.

No debe contener composición específica de:

- Admin;
- Cajero;
- Detalles;
- Home;
- Login.

---

## 5.2. `shared.css`

Debe contener únicamente estilos que tengan consumidores reales en más de una familia o que necesiten existir antes de resolver el módulo final.

Candidatos confirmados:

- `PanelLoader`;
- fallbacks de autenticación/routing usados por `PageShell`;
- botones realmente compartidos;
- notices/feedback genuinamente compartidos;
- utilidades mínimas transversales.

La existencia actual de una clase en `styles.css` no demuestra que deba pasar a `shared.css`.

Cada regla debe justificar consumidores reales.

---

## 5.3. `operational.css`

Debe contener estilos compartidos únicamente por las superficies operacionales:

- Cajero;
- Detalles.

Su responsabilidad es alojar la base operacional común, especialmente:

- shell;
- header;
- main/container;
- primitivas operacionales que realmente comparten ambas superficies;
- estados o feedback compartidos cuando corresponda.

Durante la primera migración puede contener selectores que todavía utilicen prefijo `cajero-*` si renombrarlos incrementa el riesgo.

El nombre del selector no obliga a renombrar el JSX en esta fase.

---

## 5.4. `cajero.css`

Debe contener únicamente estilos propios de la experiencia de conteo, por ejemplo:

- navegación inferior;
- Inicio operativo;
- cobertura accionable;
- selección táctil;
- Conteo;
- Conteo diario;
- Revisar;
- Historial específico del Cajero;
- send bars;
- drafts;
- captura;
- modal de captura;
- calculadora;
- acciones y estados propios del flujo de conteo.

Cajero es la referencia actual de interfaz operacional touch y debe conservar su comportamiento y composición.

---

## 5.5. `detalles.css`

Debe contener estilos propios de la superficie de consulta:

- Modo consulta;
- estado de dispositivo;
- resumen de sede;
- métricas consultivas;
- historial de sede;
- exportación;
- detalle de casos;
- estados exclusivos de Detalles.

La primera migración CSS no debe rediseñar Detalles.

Las mejoras visuales aprobadas o futuras se implementarán en un bloque posterior.

---

## 5.6. `admin.css`

Admin debe quedar autocontenido respecto de estilos administrativos.

Debe incluir:

- shell;
- sidebar;
- header;
- contexto de sede;
- primitivas administrativas;
- filtros;
- tablas;
- dialogs;
- módulos administrativos;
- responsive correspondiente a Admin.

Después de la migración, Admin no debe depender de reglas `admin-*` alojadas en el CSS global.

### No aprobado en V1

No se exige inicialmente dividir Admin en:

- `dashboard.css`;
- `control.css`;
- `catalogo.css`;
- etc.

La división interna de Admin queda pospuesta hasta medir el resultado de esta arquitectura.

---

## 5.7. Público — Home/Login

Home y Login no son prioridad de optimización agresiva en esta primera arquitectura.

La implementación puede conservar inicialmente su estrategia de carga actual si eso reduce riesgo.

No se exige:

- lazy loading adicional de Home;
- lazy loading adicional de Login;
- separación obligatoria de ambos en chunks CSS independientes.

Cualquier optimización posterior debe justificarse mediante medición real.

---

# 6. Baseline técnico congelado

Baseline de producción obtenido antes del refactor:

```text
bun run build
vite v8.2.1
2018 módulos transformados
```

### CSS

| Artefacto                            |       Raw |     Gzip |
| ------------------------------------ | --------: | -------: |
| CSS global `index-*.css`             | 155.10 kB | 26.36 kB |
| CSS adicional Admin `admin.v2-*.css` |  30.99 kB |  5.30 kB |

Admin recibe actualmente aproximadamente:

```text
155.10 kB global
+
30.99 kB Admin
=
186.09 kB raw
```

sin considerar caché del navegador.

### JS relevante

| Artefacto       |       Raw |     Gzip |
| --------------- | --------: | -------: |
| JS entry        | 202.02 kB | 63.81 kB |
| `protected-app` | 234.97 kB | 62.48 kB |
| Cajero app      |  29.48 kB |  8.46 kB |
| Cajero          |  57.14 kB | 14.91 kB |
| Detalles        |  31.50 kB |  9.09 kB |
| Admin app       |  68.78 kB | 16.92 kB |

Este baseline se utilizará para comparar el resultado del refactor.

No se congela un porcentaje mínimo de reducción.

---

# 7. Validaciones de baseline

Antes del refactor:

```text
bun run build
✓
```

El script incluye:

```text
tsc -b && vite build
```

Por lo tanto:

- TypeScript/typecheck: aprobado;
- Vite build: aprobado.

También:

```text
bun run lint
✓

git diff --check
✓
```

El intento de ejecutar `tsc` directamente desde PowerShell falló porque `tsc` no está disponible globalmente en `PATH`.

Esto **no constituye un fallo del proyecto**, ya que `tsc -b` ejecutado mediante el script de build fue exitoso.

---

# 8. Hallazgos técnicos que condicionan la migración

## 8.1. Admin

Admin depende actualmente de la cascada combinada:

```text
styles.css
+
admin.css
```

Existen clases presentes en ambos archivos.

La migración debe reconstruir primero dentro de Admin la cascada efectiva necesaria y retirar después las reglas administrativas del global.

No debe eliminarse primero la base Admin de `styles.css`.

---

## 8.2. Detalles

Detalles depende actualmente de múltiples clases y utilidades nominalmente pertenecientes a Cajero.

La migración debe distinguir:

```text
compartido operacional
vs.
propio de Cajero
vs.
propio de Detalles
```

antes de aislar `detalles.css`.

---

## 8.3. Legacy

`styles.css` contiene estilos históricos, pero algunos siguen siendo consumidos por fallbacks reales como `PageShell`.

No debe eliminarse una regla solo por parecer antigua.

Cada eliminación requiere evidencia de ausencia de consumidores.

---

# 9. Estrategia de migración aprobada

La migración debe seguir conceptualmente este orden:

```text
1. Confirmar baseline del repositorio
2. Extraer foundations/shared
3. Consolidar Admin fuera del CSS global
4. Extraer base operational común
5. Separar Cajero
6. Separar Detalles
7. Medir bundles nuevamente
8. Ejecutar regresión visual/funcional
9. Cerrar el bloque de arquitectura CSS
```

Codex puede proponer fases técnicas más detalladas, pero no debe alterar este orden lógico sin explicar el bloqueo.

---

# 10. Restricciones de implementación

Durante este refactor está prohibido:

- modificar backend;
- modificar Supabase;
- modificar contratos RPC;
- cambiar lógica de negocio;
- cambiar navegación funcional;
- cambiar reglas de autorización;
- reinterpretar UX aprobada;
- rediseñar módulos;
- realizar refactors generales no relacionados;
- renombrar masivamente clases sin necesidad;
- extraer componentes React por limpieza estética solamente;
- modificar comportamiento para justificar una estructura CSS.

Debe preservarse cualquier cambio preexistente del repositorio que no pertenezca al alcance.

---

# 11. Regla de equivalencia visual

La primera implementación debe aspirar a:

> **pixel-equivalencia razonable respecto del baseline actual.**

Las diferencias permitidas son únicamente las indispensables para:

- corregir una cascada accidental durante la migración;
- preservar el comportamiento existente;
- resolver una incompatibilidad técnica demostrada.

Una mejora visual deseable pero no necesaria debe quedar para el bloque UI/UX posterior.

---

# 12. Criterios de éxito

El refactor será técnicamente exitoso cuando:

1. `styles.css` deje de actuar como contenedor de todas las superficies.
2. Cajero no cargue CSS administrativo.
3. Detalles no dependa accidentalmente de cargar todo el CSS específico de Cajero.
4. Admin sea autocontenido respecto de estilos administrativos.
5. foundations/shared contengan únicamente estilos realmente transversales.
6. la aplicación conserve su comportamiento funcional;
7. la apariencia intencional actual se mantenga;
8. build, typecheck, lint y `git diff --check` continúen aprobados;
9. los bundles CSS finales puedan compararse contra el baseline;
10. se realice regresión visual proporcional en las superficies afectadas.

---

# 13. Métrica de rendimiento

Baseline principal:

```text
CSS global actual:
155.10 kB raw
26.36 kB gzip
```

La métrica de éxito no es alcanzar un porcentaje arbitrario.

La evidencia esperada es:

```text
/cajero
→ foundations/shared + operational + cajero
→ sin CSS Admin

/detalles
→ foundations/shared + operational + detalles
→ sin CSS Admin ni todo Cajero

/admin/*
→ foundations/shared + admin
→ sin CSS específico de Cajero/Detalles
```

Home/Login podrán seguir participando inicialmente del entry común si el plan técnico demuestra que separarlos en esta fase aporta poco valor o aumenta el riesgo.

---

# 14. Validación posterior requerida

Como mínimo:

- `bun run build`;
- `bun run lint`;
- `git diff --check`;
- comparación de tamaños de bundles antes/después;
- inspección de chunks CSS producidos por Vite;
- prueba de navegación por rutas;
- revisión visual de Home;
- revisión visual de Login;
- revisión visual de Admin;
- revisión visual de Detalles;
- revisión visual de Cajero;
- prioridad especial a Xiaomi Pad SE vertical para Cajero.

Las pruebas visuales deben detectar:

- pérdida de reglas por orden de carga;
- cambios de especificidad;
- estilos faltantes;
- estilos filtrados entre módulos;
- breakpoints rotos;
- overlays/dialogs dañados;
- focus/hover/disabled distintos;
- regresiones de densidad.

---

# 15. Cambios UI/UX posteriores — fuera de este bloque

Después de cerrar el refactor CSS se abordarán por separado los cambios visuales/funcionales derivados de la auditoría.

Entre ellos ya existe una decisión aprobada para Detalles:

- `Solo lectura` pasa conceptualmente a **`Modo consulta`**.
- Cuando el dispositivo esté autorizado para la sede, debe existir un CTA **`Ir al panel Cajero`** hacia `/cajero`.

Estos cambios **no forman parte del refactor CSS estructural V1**.

La propuesta `Comprobar acceso` para solicitudes pendientes continúa en estado de propuesta hasta aprobación explícita.

---

# 16. Estado final

**Arquitectura CSS V1: APROBADA Y CONGELADA.**

El siguiente paso es entregar esta fuente primaria a Codex para:

1. establecer/confirmar baseline local;
2. inspeccionar dependencias específicas de implementación;
3. generar un plan técnico por fases;
4. detenerse y esperar aprobación del usuario antes de modificar código.

Codex no debe implementar todavía al recibir la solicitud de planificación.
