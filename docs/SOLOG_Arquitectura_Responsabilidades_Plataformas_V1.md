# SOLOG — Arquitectura de responsabilidades entre plataformas V1

**Estado:** CONGELADO  
**Proyecto:** SOLOG  
**Nivel:** C — Arquitectura / contratos entre plataformas  
**Fuente primaria para responsabilidades entre ConeXion, Supabase y SOLOG:** este documento.  
**Prevalencia:** ante contradicciones sobre límites generales de responsabilidad entre ConeXion, Supabase y SOLOG, este documento prevalece sobre documentación anterior. Los contratos funcionales/técnicos posteriores de cada módulo prevalecen dentro de su dominio cuando concretan o sustituyen expresamente una regla de esta V1.
**Revisión de vigencia:** 2026-09-11 — las fronteras generales continúan vigentes; las fases que aquí figuraban como pendientes ya fueron concretadas por contratos posteriores. La antigua capacidad de Grupos para originar propuestas comerciales quedó sustituida por la separación actual Productos/Catálogo.

---

## 1. Objetivo

Definir y congelar las responsabilidades de cada herramienta/plataforma del ecosistema de inventario antes de continuar con la redefinición funcional de los módulos de SOLOG.

La arquitectura debe separar claramente:

1. el **catálogo compartido ConeXion ↔ Supabase**;
2. el **modelo operativo interno Supabase ↔ SOLOG**;
3. la **captura de stock e incidencias**;
4. la **agrupación y estado operativo para conteos**;
5. el **Motor de Conteos**;
6. las responsabilidades de administración y operación.

---

## 2. Principio arquitectónico central

El catálogo compartido entre ConeXion y Supabase contiene únicamente la identidad comercial mínima necesaria para interpretar el Excel y detectar cambios relevantes del POS.

Las propiedades internas que SOLOG necesita para organizar y ejecutar conteos no forman parte del contrato de catálogo compartido.

Por tanto existen dos dominios distintos:

### 2.1. Catálogo compartido — ConeXion ↔ Supabase

Por SKU:

- `c_interno`
- `producto`
- `c_barras`
- `precio`

El `c_interno` es el identificador principal y estable del producto.

No forman parte del objeto SKU compartido:

- marca;
- categoría SOLOG;
- estado `Único` / `Agrupado` / `Excluido`;
- grupo de conteo;
- `grupo_conteo_id`;
- configuración de paquete;
- estados del Motor de Conteos.

### 2.2. Modelo operativo — Supabase ↔ SOLOG

Supabase/SOLOG administra internamente:

- categorías operativas;
- grupos de conteo;
- relación SKU ↔ grupo;
- modalidad `Único` / `Agrupado`;
- configuración de paquetes;
- exclusiones operativas;
- stocks vigentes;
- estado operativo de los grupos;
- cobertura;
- sesiones;
- conteos;
- reconteos;
- diferencias;
- resolución de diferencias.

Estas propiedades no deben aumentar innecesariamente el artefacto consumido por ConeXion.

---

## 3. Exclusiones en el catálogo compartido

Las exclusiones se transportan como una estructura separada del catálogo de productos.

Formato conceptual:

```json
{
  "productos": [
    {
      "c_interno": 20211,
      "producto": "1 HIELO 1.5KG",
      "c_barras": "...",
      "precio": 9.00
    }
  ],
  "excluidos": [
    {
      "c_interno": 21286,
      "producto": "ACIDO SACASARRO SAPOLIO 3.6LT"
    }
  ]
}
```

Reglas:

- `c_interno` es el identificador autoritativo del excluido.
- `producto` se incluye como referencia humana y para facilitar una eventual recuperación.
- ConeXion debe excluir esos SKU del flujo operativo normal.
- La exclusión no se representa mediante un campo `estado` dentro de cada producto.

---

## 4. Responsabilidad de ConeXion

ConeXion es responsable de transformar el Excel del POS en un snapshot normalizado y enviar incidencias detectadas.

### 4.1. Entrada

ConeXion recibe:

- un archivo Excel del POS con aproximadamente 1000 SKU;
- la versión vigente del catálogo compartido;
- la lista de SKU excluidos.

### 4.2. Validación contra catálogo

ConeXion utiliza principalmente:

- `c_interno`;
- `producto`;
- `c_barras`;
- `precio`;

para reconocer productos y detectar cambios respecto al catálogo vigente.

### 4.3. Exclusiones

Antes de construir el snapshot:

- omite los SKU presentes en la lista `excluidos`.

### 4.4. Snapshot enviado

Para productos con stock distinto de cero, ConeXion trabaja conceptualmente con:

- `c_interno`;
- `producto`;
- `c_barras`;
- `precio`;
- `stock`.

No es requisito persistir en Supabase nombre, código de barras y precio repetidos dentro de cada fila histórica de stock, porque el snapshot está asociado a una versión del catálogo.

### 4.5. Stock cero

ConeXion no necesita enviar individualmente todos los SKU cuyo stock es cero.

Debe enviar el resumen correspondiente, incluyendo la cantidad de SKU en cero, mientras Supabase reconstruye el snapshot lógico completo usando la versión de catálogo asociada.

### 4.6. Incidencias

ConeXion detecta y envía incidencias cuando encuentra inconsistencias relevantes, por ejemplo:

- producto nuevo;
- producto desaparecido;
- cambio de nombre;
- cambio de código de barras;
- cambio de precio;
- otras anomalías definidas por el contrato de ingestión.

ConeXion no administra:

- grupos de conteo;
- categorías SOLOG;
- cobertura;
- sesiones;
- estados del Motor de Conteos;
- reconteos;
- resolución administrativa.

---

## 5. Responsabilidad de Supabase

Supabase es la autoridad persistente y transaccional del sistema.

### 5.1. Recepción de snapshots

Al recibir un snapshot confirmado, Supabase debe:

1. guardar metadatos del snapshot;
2. reconstruir y guardar el stock lógico completo del snapshot;
3. registrar incidencias;
4. actualizar el último stock conocido por SKU;
5. actualizar el estado operativo agregado por grupo;
6. permitir al Motor de Conteos reaccionar ante snapshots posteriores cuando corresponda.

### 5.2. Nivel 1 — snapshot histórico

La capa equivalente a `snapshot_stock` responde:

> ¿Qué stock tenía cada SKU en un snapshot específico?

Su unidad conceptual es:

`[snapshot_id + c_interno]`

Es histórico.

### 5.3. Nivel 2 — stock vigente por SKU

La capa equivalente a `stock_actual` responde:

> ¿Cuál es el último stock informado por ConeXion para este SKU en esta sede?

Su unidad conceptual es:

`[sede_id + c_interno]`

Regla:

- si el stock recibido cambia, actualizar el stock vigente;
- si no cambia, no debe interpretarse por sí mismo como un nuevo estado operativo.

`Cambio_reciente` no pertenece conceptualmente al SKU individual.

### 5.4. Nivel 3 — estado operativo por grupo

La capa equivalente a `estado_stock_grupo` responde:

> ¿Cuál es el stock agregado y el estado operativo del grupo para esta sede?

Su unidad conceptual es:

`[sede_id + grupo_conteo_id]`

Supabase agrega los SKU utilizando la estructura interna de grupos de SOLOG.

Aquí viven conceptos como:

- stock agregado actual;
- `Cambio_reciente`;
- `Contado`;
- cobertura del período;
- último conteo relacionado;
- grupo activo/inactivo.

### 5.5. Cambio de stock

Al aplicar un snapshot:

- Supabase recalcula el stock agregado de cada grupo;
- si cambia respecto al stock agregado anterior, el grupo pasa a `Cambio_reciente`;
- si no cambia, conserva su estado operativo salvo otra regla explícita.

### 5.6. Cambio de período

La quincena operativa no se reinicia solo porque cambie la fecha.

El primer snapshot confirmado del nuevo período debe:

- establecer el nuevo período operativo;
- marcar los grupos activos como `Cambio_reciente`;
- establecer `cobertura_periodo = false`.

Después, los conteos físicos válidos recuperan la cobertura correspondiente.

### 5.7. Agrupación

La agrupación se resuelve en Supabase/SOLOG, no en ConeXion.

Supabase utiliza:

- estructura de grupos;
- integrantes;
- categorías operativas;
- configuración de paquetes;

para preparar la información que consume SOLOG.

---

## 6. Responsabilidad de SOLOG Admin

SOLOG Admin administra el sistema, pero sus módulos deben respetar los límites entre catálogo compartido y modelo interno.

Responsabilidades generales:

- administrar y crear nuevas versiones del catálogo consumido por ConeXion;
- revisar y resolver incidencias;
- administrar grupos de conteo;
- administrar dispositivos;
- consultar información creada por los conteos;
- consultar estados, cobertura, diferencias y cronologías;
- originar propuestas cuando un cambio detectado desde otro módulo deba terminar afectando el catálogo compartido.

SOLOG Admin no debe duplicar el procesamiento de snapshots ni sustituir al Motor de Conteos.

Las responsabilidades detalladas de cada módulo se definirán y congelarán por separado.

---

## 7. Responsabilidad del módulo Catálogo

A nivel de frontera arquitectónica, Catálogo es propietario del contrato compartido ConeXion ↔ Supabase.

Debe ser el módulo responsable de:

- administrar las versiones del catálogo compartido;
- revisar propuestas que afecten el catálogo compartido;
- aprobar/rechazar dichas propuestas;
- preparar y publicar una nueva versión;
- mantener la coherencia del artefacto consumido por ConeXion.

Las propiedades compartidas relevantes de un SKU son:

- `c_interno`;
- `producto`;
- `c_barras`;
- `precio`.

No se define una operación de “cambiar código interno”.

Si el POS reutiliza un mismo código interno para otro producto, los cambios observados en:

- nombre;
- código de barras;
- precio;

son suficientes para detectar que la identidad comercial asociada al código cambió y resolverlo mediante incidencias/propuestas.

La exclusión o reincorporación de un SKU afecta lo que ConeXion debe procesar, por lo que debe terminar como propuesta/aprobación de Catálogo.

---

## 8. Responsabilidad del módulo Grupos

A nivel de frontera arquitectónica, Grupos es propietario de la estructura interna de conteo Supabase ↔ SOLOG.

Puede modificar directamente:

- grupos de conteo;
- integrantes;
- modalidad derivada `Único` / `Agrupado`;
- categoría operativa SOLOG;
- unidades por paquete;
- precio por paquete;
- demás configuración exclusivamente interna del conteo.

Los cambios anteriores no requieren una nueva versión del catálogo compartido mientras no alteren las propiedades compartidas del SKU.

### Vigencia posterior

La redefinición funcional posterior de Grupos y la separación de `Productos` como superficie administrativa independiente sustituyen la antigua idea de que Grupos origine propuestas comerciales.

En el diseño vigente, Grupos **no es una superficie para proponer ni gestionar**:

- nombre comercial del SKU;
- código de barras;
- precio unitario;
- exclusión;
- reincorporación.

Esas acciones pertenecen al ciclo de vida administrado por Productos/Catálogo o a las incidencias/candidatos que alimentan Catálogo. Grupos puede aportar contexto estructural o bloquear cambios incompatibles con staging activo, pero no crea una vía comercial paralela.

---

## 9. Responsabilidad de SOLOG Cajero

SOLOG Cajero es responsable de realizar:

- conteos del período;
- conteos diarios;
- reconteos;
- captura de cantidades físicas;
- interacción con el flujo operativo definido por el Motor de Conteos.

Al iniciar un conteo:

1. Supabase toma el estado operativo vigente;
2. agrupa los SKU según la estructura interna;
3. entrega los grupos aplicables a la sesión;
4. se congela el contexto necesario para esa sesión;
5. los conteos físicos generan registros en `conteo_detalle`.

SOLOG Cajero no administra:

- catálogo compartido;
- versiones;
- grupos maestros;
- incidencias administrativas;
- dispositivos administrativos.

---

## 10. Responsabilidad del Motor de Conteos

El Motor de Conteos empieza conceptualmente cuando existe una observación física registrada para un grupo.

Su flujo parte de:

`conteo físico → conteo_detalle`

y administra:

- stock teórico;
- stock físico;
- diferencia;
- valorización;
- snapshots posteriores;
- estado de diferencia;
- reconteos;
- resolución;
- actualización del estado operativo del grupo;
- cobertura cuando corresponda.

El Motor no debe definir el catálogo compartido ni la estructura maestra de grupos.

---

## 11. Flujo completo congelado

```text
POS / Excel
    │
    ▼
ConeXion
    │
    ├── aplica catálogo compartido
    ├── aplica lista de excluidos
    ├── detecta incidencias
    └── construye snapshot
    │
    ▼
Supabase
    │
    ├── snapshots
    ├── snapshot_stock
    ├── incidencias
    ├── stock_actual por SKU
    │
    └── agrega según grupos SOLOG
            │
            ▼
      estado_stock_grupo
            │
            ▼
      SOLOG Cajero
            │
            ▼
       conteo_detalle
            │
            ▼
      Motor de Conteos
            │
            ▼
      Control / consultas Admin
```

En paralelo:

```text
SOLOG Admin / Catálogo
    │
    ├── revisa incidencias/propuestas
    ├── aprueba cambios compartidos
    └── publica nueva versión
            │
            ▼
        ConeXion

SOLOG Admin / Grupos
    │
    └── administra estructura SOLOG

Cambios comerciales del SKU
    │
    └── Productos / Incidencias
            │
            ▼
        Catálogo
```

---

## 12. Límites congelados

Queda expresamente congelado que:

1. **Marca, categoría y grupo de conteo no forman parte del objeto SKU del catálogo compartido.**
2. **El catálogo compartido del SKU usa únicamente `c_interno`, `producto`, `c_barras`, `precio`.**
3. **Las exclusiones viajan separadas como `c_interno + producto`.**
4. **ConeXion no administra agrupación ni lógica del Motor.**
5. **Supabase reconstruye y persiste el snapshot completo lógico.**
6. **Se mantienen tres niveles: snapshot histórico, stock vigente por SKU y estado operativo por grupo.**
7. **`Cambio_reciente` pertenece al estado operativo del grupo, no al SKU individual.**
8. **El primer snapshot confirmado del nuevo período reinicia el estado/cobertura operativa del período.**
9. **SOLOG Cajero consume grupos preparados por Supabase y crea `conteo_detalle`.**
10. **El Motor de Conteos comienza a partir del conteo físico registrado.**
11. **Grupos administra directamente la estructura interna SOLOG.**
12. **Grupos no origina ni administra cambios comerciales del SKU; esas intenciones se canalizan por Productos/Catálogo o por las incidencias/candidatos que alimentan Catálogo.**
13. **Catálogo es propietario de aprobación, versionado y publicación hacia ConeXion.**
14. **No existe una operación funcional de “cambiar código interno”.**
15. **La exclusión/reincorporación de SKU es un cambio propuesto hacia Catálogo.**

---

## 13. Alcance originalmente diferido y estado actual

Esta V1 dejó deliberadamente fuera el detalle de:

- funciones y UX concretas de Grupos;
- UX de Catálogo;
- flujo detallado de propuestas;
- contrato técnico de Catálogo y Grupos;
- SQL/RPC;
- estrategia de lecturas/caché del Admin;
- limpieza de funciones legacy.

Esos puntos **ya no están pendientes de definición** para el bloque actual. Se concretaron posteriormente, principalmente en:

- `SOLOG_Arquitectura_Catalogo_Responsabilidad_Comportamiento_Funciones_V1.md`;
- `SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md`;
- `SOLOG_Arquitectura_Grupos_Responsabilidad_Comportamiento_Funciones_V1.md`;
- `SOLOG_Backend_Grupos_Contrato_Tecnico_V1.md`;
- `SOLOG_Arquitectura_Admin_MasterData_Cache_Rutas_V1.md`;
- `SOLOG_Backend_Admin_MasterData_Contrato_Tecnico_V1.md`;
- `SOLOG_Backend_Contratos_Runtime_Actual_V1.md`.

La limpieza de superficies legacy sigue siendo posterior y solo debe hacerse tras comprobar consumidores reales.

---

## 14. Estado posterior

Este documento permanece como **fuente de frontera entre plataformas**, no como plan de trabajo vigente.

Para el frontend Admin actual, la implementación debe seguir las fuentes funcionales/técnicas posteriores del módulo correspondiente. El bloque inmediato ya no es redefinir Grupos ni diseñar backend: es implementar el frontend contra los contratos congelados, sin reinterpretar estas fronteras.
