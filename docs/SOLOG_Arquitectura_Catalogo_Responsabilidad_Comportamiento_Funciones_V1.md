# SOLOG — Catálogo: responsabilidad, comportamiento y funciones V1

**Estado:** CONGELADO  
**Proyecto:** SOLOG  
**Módulo:** Admin > Catálogo  
**Clasificación:** Nivel C — Arquitectura / lógica / backend / integración  
**Fecha de congelación:** 2026-09-10  
**Fuente primaria del módulo Catálogo:** este documento.

---

## 1. Prevalencia y fuentes relacionadas

Este documento es la **fuente primaria para el comportamiento funcional, responsabilidades y funciones del módulo Admin > Catálogo de SOLOG**.

Ante contradicciones sobre este módulo, prevalece sobre:

- implementaciones legacy del frontend y backend de Catálogo;
- reglas anteriores de `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` que entren en conflicto con esta redefinición;
- cualquier documento anterior que mezcle responsabilidades de Catálogo y Grupos.

Este documento **no reemplaza ni modifica** el contrato externo ConeXion ↔ Supabase. Para esa integración continúan siendo autoritativos:

1. `Contrato_backend_ConeXion.md`;
2. `SOLOG_Integracion_ConeXion_Supabase_Contrato_V2.md`;
3. `SOLOG_Arquitectura_Responsabilidades_Plataformas_V1.md`.

Regla de compatibilidad:

> Catálogo puede modificar la forma en que SOLOG prepara, valida y publica una nueva versión, pero no puede alterar sin una decisión independiente el contrato ConeXion ↔ Supabase V2 ya congelado.

---

# 2. Propósito del módulo

Catálogo administra el ciclo completo de modificaciones que afectan el catálogo compartido con ConeXion y coordina los requisitos internos estrictamente necesarios para que una nueva versión pueda publicarse de forma coherente.

Su responsabilidad se divide en dos áreas principales:

```text
CATÁLOGO
│
├── Propuestas
│   └── qué debe cambiar en una próxima versión
│
└── Productos
    └── estado y preparación de los SKU que forman esa versión
```

Catálogo es responsable de:

- recibir y consolidar propuestas comerciales originadas desde incidencias de ConeXion;
- recibir propuestas administrativas originadas desde SOLOG;
- revisar, aprobar, ignorar y retirar aprobaciones;
- preparar nuevos SKU antes de incorporarlos;
- administrar exclusión y reincorporación de SKU;
- resolver bloqueos de precio que impidan publicar;
- validar una próxima versión;
- publicar versiones del catálogo compartido;
- conservar versionado, idempotencia, historial y auditoría.

Catálogo **no es propietario general de Grupos**. Puede invocar o preparar cambios de Grupos únicamente cuando sean una dependencia directa de una publicación de Catálogo.

---

# 3. Frontera con ConeXion

El catálogo compartido V2 continúa exponiendo exclusivamente:

## 3.1. SKU incluidos

```text
c_interno
producto
c_barras
precio
```

## 3.2. SKU excluidos

```text
c_interno
producto
```

No se comparte con ConeXion:

```text
marca
categoría SOLOG
Único / Agrupado
grupo_conteo_id
unidades_por_paquete
precio_paquete
cobertura
estado operativo
Motor
sesiones
conteos
reconteos
```

Las publicaciones posteriores a V6 continúan utilizando:

```text
schema_version = 2
```

El rediseño de Catálogo no cambia:

- `rpc_conexion_auth_state`;
- payload de autenticación;
- payload/response de snapshots V2;
- `stock[]`;
- `eliminados[]`;
- tipos de incidencias V2;
- reconstrucción de stock;
- `catalogo_version_skus` incluido/excluido;
- formato lógico `.prcatalog`;
- hash, Storage o versionado externo.

---

# 4. Estructura funcional del módulo

La navegación interna de Catálogo tendrá dos áreas:

```text
[ Propuestas ] [ Productos ]
```

## 4.1. Propuestas

Administra el ciclo de vida de modificaciones pendientes o históricas.

Vistas:

```text
[ Pendientes ] [ Aprobados ] [ Ignorados ] [ Incorporados ]
```

No existe vista `Todas`.

## 4.2. Productos

Administra el estado maestro y la preparación de los SKU respecto a Catálogo.

Desde esta vista se podrá:

- consultar todos los SKU;
- identificar incluidos y excluidos;
- proponer exclusión;
- proponer reincorporación;
- completar configuración de productos nuevos aprobados;
- completar configuración de reincorporaciones cuando sea necesaria;
- revisar contexto de grupo/categoría cuando afecte la preparación del SKU.

---

# 5. Ciclo de vida de propuestas

Los estados funcionales son:

```text
Pendiente
Aprobado
Ignorado
Incorporado
```

Flujo normal:

```text
Pendiente
   ├── Aprobar  → Aprobado → Publicar → Incorporado
   └── Ignorar  → Ignorado
```

Reglas:

1. **Aprobar no publica.**
2. `Aprobado` significa que la decisión fue aceptada y está disponible para una próxima publicación.
3. `Incorporado` significa que el cambio ya fue aplicado en una versión publicada.
4. Una propuesta aprobada puede retirar su aprobación mientras todavía no haya sido publicada.
5. Retirar una aprobación debe eliminar también cualquier resolución o configuración pendiente dependiente de esa propuesta.
6. Una propuesta ignorada continúa siendo una decisión histórica aunque desaparezca la incidencia que la originó.
7. Un cambio incorporado debe seguir visible históricamente aunque la incidencia original sea eliminada o archivada.

---

# 6. Autoridad histórica de las propuestas

`inventario.cambios_catalogo` será la autoridad persistente de todos los cambios que ya recibieron una decisión o fueron incorporados.

`inventario.catalogo_candidatos()` será únicamente el generador de candidatos automáticos todavía no persistidos.

Modelo funcional:

```text
cambios_catalogo
├── aprobados
├── ignorados
├── incorporados
└── pendientes persistidos/manuales

catalogo_candidatos()
└── candidatos automáticos nuevos cuyo fingerprint aún no existe
```

Una propuesta automática que pase a aprobada o ignorada debe persistir suficiente contexto para sobrevivir independientemente de la incidencia origen, incluyendo cuando corresponda:

- origen;
- sedes;
- apariciones;
- primera detección;
- última detección.

No debe depender de que la incidencia original permanezca indefinidamente en `inventario.incidencias`.

---

# 7. Origen automático: `inventario.catalogo_candidatos()`

La función conserva un propósito único:

> Transformar incidencias comerciales de ConeXion en candidatos normalizados de Catálogo.

Debe transformar exclusivamente:

| Incidencia ConeXion | Propuesta Catálogo |
|---|---|
| `producto_nuevo` | `agregar_producto` |
| `nombre_modificado` | `nombre` |
| `precio_modificado` | `precio` |
| `codigo_barras_modificado` | `codigo` |
| `codigo_barras_agregado` | `codigo` |
| `codigo_barras_eliminado` | `codigo` |

No debe convertir automáticamente en propuestas de Catálogo:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

`producto_ausente` significa stock lógico 0 dentro del contrato V2; no significa eliminación comercial automática.

La eliminación de un producto requiere una acción administrativa explícita.

---

# 8. Canonicalización de fingerprints

Los valores de precio deben canonicalizarse numéricamente antes de formar fingerprints.

Regla:

```text
1.5 == 1.50 == 1.500
```

No pueden existir propuestas o familias distintas únicamente por diferencias de escala decimal.

La canonicalización debe aplicarse en todos los puntos donde el precio forme parte de la identidad de una incidencia/propuesta, incluyendo como mínimo:

- fingerprint de incidencias en el flujo de snapshot;
- fingerprint de `catalogo_candidatos()`;
- cualquier fingerprint derivado de resoluciones de precio.

La corrección es interna y no modifica el contrato ConeXion V2.

---

# 9. Propuestas desactualizadas

Una propuesta aprobada no se considera automáticamente publicable para siempre.

Si aparece una propuesta más reciente y distinta para el mismo:

```text
c_interno + tipo
```

la propuesta aprobada anterior debe poder quedar marcada funcionalmente como:

```text
publicable = false
motivo = propuesta_desactualizada
```

No se crea un nuevo estado de ciclo de vida.

La publicación debe bloquear la propuesta obsoleta y exigir revisión humana.

No se reemplaza automáticamente una decisión aprobada por la evidencia nueva.

---

# 10. Clasificación operativa: Urgentes y Emergentes

La clasificación se basa en el **impacto operativo de retrasar la publicación**, no únicamente en la naturaleza del cambio.

## 10.1. Urgentes

```text
Agregar producto
Cambiar precio
Reincorporar producto
```

Motivos:

- **Agregar producto:** mientras no se publique, ConeXion no puede incorporarlo al universo operativo esperado.
- **Cambiar precio:** afecta directamente la valorización de futuros conteos.
- **Reincorporar producto:** no vuelve al universo operativo hasta publicar y recibir stock fresco.

Tabla de Pendientes / Urgentes:

```text
Tipo | Nombre | C. Interno | Precio | Acciones
```

Para `Cambiar precio`, la columna Precio debe poder mostrar transición:

```text
S/ actual → S/ nuevo
```

## 10.2. Emergentes

```text
Eliminar producto
Excluir producto
Cambiar nombre
Cambiar código de barras
```

Motivos:

- eliminar normalmente corresponde a un SKU ya abandonado o sin stock;
- excluir corresponde a un SKU que se decide retirar del conteo por baja relevancia;
- nombre y barcode no modifican stock ni valorización mientras `c_interno` siga siendo autoritativo.

Tabla de Pendientes / Emergentes:

```text
Tipo | Nombre | Actual | Nuevo valor | Acciones
```

Ejemplos:

```text
Eliminar producto    Incluido → Eliminado
Excluir producto     Incluido → Excluido
Cambiar nombre       Nombre actual → Nombre propuesto
Cambiar código       Barcode actual → Barcode propuesto
```

**Emergente no significa ausencia de consecuencias.** Significa que retrasar su publicación normalmente no perjudica la operación actual.

---

# 11. Comportamiento de Aprobados

No se busca acumular cambios urgentes durante largos periodos.

Para cambios urgentes, el flujo debe conducir al administrador hacia una publicación próxima:

```text
Urgente pendiente
→ Aprobar
→ resolver requisitos si aplica
→ Listo para publicar
→ Revisar publicación
```

Los cambios emergentes sí pueden permanecer aprobados y acumularse hasta que una publicación futura sea necesaria.

Cuando se publique una versión, se incorporan todos los cambios aprobados que formen parte del conjunto publicable y no estén obsoletos/bloqueados.

No se publica automáticamente al aprobar.

---

# 12. Producto nuevo

La aprobación comercial y la preparación operativa quedan separadas.

Flujo:

```text
producto_nuevo
      ↓
Agregar producto
      ↓
Aprobar
      ↓
Aprobado · configuración SOLOG pendiente
      ↓
Productos
      ↓
Completar configuración
      ↓
Listo para publicar
```

La aprobación inicial de un producto nuevo no debe exigir:

```text
marca
categoría
grupo
modalidad
```

Esos datos internos se completan posteriormente en `Productos` cuando sean necesarios.

La configuración de un nuevo SKU queda en staging y **no modifica `inventario.catalogo` hasta la publicación**.

---

# 13. Configuración de producto nuevo

Un nuevo SKU aprobado puede resolverse de dos formas:

## 13.1. Añadir a grupo existente

El administrador selecciona un grupo existente compatible.

El nuevo SKU hereda estructuralmente:

```text
grupo_conteo_id
categoria_id
```

Las propiedades que pertenecen al grupo continúan almacenadas en el grupo, no se copian al SKU:

```text
unidades_por_paquete
precio_paquete
```

Solo se deben ofrecer grupos compatibles con el precio del SKU.

## 13.2. Crear grupo unitario nuevo

Se crea un grupo inicial de un solo SKU.

Puede derivarse:

```text
nombre del grupo = nombre del producto
precio del grupo = precio del producto
estado SKU = Único
activo = true
```

Debe seleccionarse la categoría.

No se permite crear desde este flujo un grupo `Agrupado` vacío ni un grupo `Agrupado` de un solo SKU.

La configuración de paquete puede permanecer:

```text
unidades_por_paquete = NULL
precio_paquete = NULL
```

---

# 14. Marca

`marca` se conserva en `inventario.catalogo` por posible utilidad futura.

No tiene responsabilidad operativa actual.

Reglas:

- no forma parte del catálogo compartido;
- no es requerida para aprobar un SKU;
- no es requerida para configurar un SKU;
- no es requerida para publicar;
- los valores actuales se preservan;
- para nuevos SKU puede ser `NULL`;
- no se guarda `''`, `"Sin marca"` ni un valor inferido automáticamente;
- puede quedar disponible como campo opcional en detalle/edición de `Productos`.

El backend debe permitir `marca IS NULL` preservando la validación de no-vacío cuando exista un valor.

---

# 15. Vista Productos

La vista `Productos` trabaja con el catálogo maestro completo.

Columnas funcionales iniciales recomendadas:

```text
Producto | C. Interno | Precio | Estado | Grupo | Acciones
```

`Estado` comunica principalmente:

```text
Incluido
Excluido
```

`Único/Agrupado` puede mostrarse como contexto de estructura, pero no como el estado principal del catálogo compartido.

Desde `Productos`:

```text
Incluido → Proponer exclusión
Excluido → Proponer reincorporación
```

Estas acciones generan propuestas; no modifican el maestro inmediatamente.

---

# 16. Exclusión

Excluir significa:

```text
el SKU continúa existiendo en inventario.catalogo
pero en la próxima versión pasa de productos[] a excluidos[]
```

Es reversible.

Flujo:

```text
Productos
→ Proponer exclusión
→ Pendiente
→ Aprobar
→ staging
→ Publicar
→ Incorporado
→ SKU pasa a excluidos[]
```

Ni proponer ni aprobar exclusión modifica el maestro.

La modificación se aplica atómicamente durante la publicación.

---

# 17. Reincorporación

Reincorporar significa volver a introducir un SKU excluido al universo incluido.

Flujo:

```text
Productos
→ Proponer reincorporación
→ Pendiente
→ Aprobar
→ configurar estructura operativa
→ staging
→ Publicar
→ Incorporado
```

La reincorporación debe resolver antes de publicar:

```text
grupo existente compatible
ó
grupo unitario nuevo
```

Ni proponer ni aprobar modifica el maestro.

La reincorporación se aplica durante la publicación.

---

# 18. Eliminación

Eliminar y excluir son operaciones distintas.

## Excluir

- conserva el SKU en el maestro;
- lo mueve a `excluidos[]`;
- es reversible mediante reincorporación.

## Eliminar

- retira el SKU del catálogo maestro activo;
- debe originarse de una decisión humana explícita;
- `producto_ausente` por sí solo no es autorización para eliminar.

La eliminación también queda en staging y se aplica durante publicación.

Si se intenta eliminar un SKU con stock operativo significativo, el preview debe advertir/bloquear según la regla técnica que se defina durante implementación; no se asume que todo eliminado tiene stock cero.

---

# 19. Cambios de nombre y código de barras

Son propuestas emergentes.

No requieren cambios de Grupos.

Se aprueban como modificación comercial y se aplican durante publicación.

`c_interno` sigue siendo el identificador autoritativo y no puede cambiar mediante Catálogo.

No existe propuesta `cambiar_codigo_interno`.

---

# 20. Cambio de precio

`Cambiar precio` es una propuesta **Urgente** porque afecta el valorizado de futuros conteos.

Flujo general:

```text
Cambio de precio
→ Aprobar
→ comprobar impacto de grupo
→ resolver si existe incompatibilidad
→ resolver precio xN si aplica
→ Listo para publicar
→ Publicar
```

Un cambio de precio no modifica inmediatamente el maestro.

Todas sus resoluciones dependientes permanecen en staging hasta publicar.

---

# 21. Resolución de precio de grupo

Aunque la estructura pertenece a Grupos, Catálogo puede resolver conflictos de precio cuando bloquean directamente una publicación.

Opciones funcionales:

```text
Actualizar precio de todo el grupo
Separar SKU como Único
```

Catálogo actúa como **orquestador de la resolución**, no como propietario general de Grupos.

La resolución:

- se prepara;
- se valida en preview;
- no modifica inmediatamente el maestro ni Grupos;
- se aplica atómicamente con la publicación.

Si se retira la aprobación del cambio de precio antes de publicar, la resolución preparada asociada deja de tener efecto.

---

# 22. `Actualizar precio xN`

Se mantiene en Catálogo **exclusivamente como operación complementaria de `Cambiar precio`**.

Motivo:

`precio_paquete` participa directamente en la valorización de diferencias y puede quedar desactualizado si cambia el precio unitario.

No es:

- una propuesta independiente de Catálogo;
- un dato del catálogo compartido;
- un campo enviado a ConeXion.

Es una dependencia operativa interna vinculada al cambio de precio.

Si el grupo tiene configuración `xN`, la resolución debe exigir una decisión explícita:

```text
Precio x12 actual: S/ 55

○ Mantener S/ 55
○ Actualizar a: [ S/ ____ ]
```

No se recalcula proporcionalmente de forma automática.

Si se elige actualizar, el nuevo `precio_paquete` queda en staging y se aplica en la misma transacción que la publicación.

Si se retira la aprobación del precio, también se descarta el cambio xN pendiente.

Al separar un SKU como Único, el grupo original conserva su `precio_paquete`; el nuevo grupo unitario no hereda automáticamente esa configuración.

---

# 23. Valorización y sesiones abiertas

La función de valorización utiliza:

```text
precio unitario
unidades_por_paquete
precio_paquete
```

Los conteos y sesiones ya iniciados conservan el contexto congelado con el que comenzaron.

Por tanto:

```text
Sesión abierta antes de una nueva versión
→ conserva precio/configuración congelados

Nueva versión publicada
→ maestro usa precio/configuración nueva

Nueva sesión
→ consume la configuración nueva
```

No se revalorizan retroactivamente conteos históricos ni sesiones ya congeladas.

---

# 24. Composición de grupos y estado operativo

Cualquier publicación que modifique la composición de un grupo debe aplicar las reglas operativas congeladas.

Casos incluidos:

```text
nuevo SKU → grupo existente
reincorporación → grupo existente
exclusión
ausencia por eliminación
separación por conflicto de precio
movimientos estructurales derivados
```

Regla general:

```text
composición modificada
→ recalcular estructura y stock cuando sea posible
→ estado = Cambio_reciente
→ cobertura_periodo = false
```

Si existe una observación `Recontar` pendiente para una composición que deja de ser válida, se aplica la política de invalidación funcional ya congelada para Grupos/Motor.

---

# 25. Nuevo/reincorporado sin stock fresco

Un SKU nuevo no entra en `stock_actual` hasta que sea incorporado y aparezca en un snapshot posterior válido.

Un SKU reincorporado puede conservar stock histórico antiguo que no debe tratarse como vigente.

Por tanto, cuando un grupo recibe un SKU nuevo o reincorporado sin observación fresca:

```text
estado = Cambio_reciente
cobertura_periodo = false
requiere_snapshot_completo = true
```

Mientras `requiere_snapshot_completo = true`:

- el grupo no debe ofrecerse como operable al Cajero;
- no debe construirse stock teórico incompleto;
- no se debe reutilizar stock histórico obsoleto del SKU reincorporado.

Después de un snapshot completo y válido posterior:

```text
snapshot válido
→ stock completo del grupo
→ requiere_snapshot_completo = false
→ grupo vuelve a ser operable
```

La implementación física de esta bandera/estado puede variar, pero el comportamiento es obligatorio.

---

# 26. Publicación y staging

La regla central es:

> Toda modificación que cambie el catálogo compartido o una dependencia estructural requerida por esa publicación se prepara primero y se aplica atómicamente al publicar.

Por tanto no modifican inmediatamente el maestro:

```text
configuración de SKU nuevo
exclusión
reincorporación
eliminación
cambio de nombre
cambio de barcode
cambio de precio
resolución de precio de grupo
precio xN asociado
```

Flujo:

```text
Propuesta
→ decisión
→ staging/resoluciones
→ preview
→ publicación
→ commit atómico
```

Esto evita que SOLOG opere con un maestro adelantado respecto a la versión todavía activa de ConeXion.

---

# 27. Preview de publicación

El preview debe validar el conjunto completo de cambios aprobados y configuraciones/resoluciones asociadas.

Debe comprobar como mínimo:

- que las propuestas siguen siendo vigentes;
- que no existen conflictos agregar/eliminar/excluir/reincorporar para el mismo SKU;
- que un SKU nuevo tiene configuración operativa suficiente;
- que una reincorporación tiene destino estructural válido;
- que no existen grupos con precios incompatibles;
- que categoría/grupo/cardinalidad serán coherentes después del commit;
- que los cambios de precio con paquete tienen decisión explícita sobre xN cuando corresponda;
- que no existen resoluciones huérfanas por una aprobación retirada;
- que ningún cambio publicado viola el contrato compartido V2;
- que la siguiente versión mantiene `schema_version = 2`.

Una publicación urgente puede incluir también cambios emergentes ya aprobados y válidos.

---

# 28. Publicación atómica

La publicación conserva el patrón actual de:

```text
operation_id estable
→ begin/reserva
→ preview congelado
→ generación artefacto
→ upload Storage
→ commit
→ finish / recovery
```

Se conserva:

- idempotencia;
- recuperación/reintento;
- hash SHA-256;
- Storage privado;
- auditoría;
- `prepared / committed / failed` o equivalente técnico.

En el commit se aplican, en una única operación coherente, según corresponda:

- cambios comerciales de SKU;
- alta de SKU nuevo;
- exclusión/reincorporación;
- eliminación;
- cambios de grupo necesarios para la publicación;
- resolución de precio;
- actualización opcional de `precio_paquete`;
- normalización estructural;
- actualización de estado operativo de grupos;
- registro de la nueva versión;
- `catalogo_version_skus` incluido/excluido;
- paso de propuestas publicadas a `Incorporado`.

---

# 29. Artefacto final

El preview interno puede seguir trabajando con información rica de SOLOG.

La Edge o capa de publicación proyecta únicamente:

```text
productos[]
excluidos[]
```

Forma obligatoria:

```json
{
  "schema_version": 2,
  "catalog_version": 7,
  "generated_at": "...",
  "productos": [
    {
      "c_interno": 20101,
      "producto": "...",
      "c_barras": "...",
      "precio": 1.5
    }
  ],
  "excluidos": [
    {
      "c_interno": 21286,
      "producto": "..."
    }
  ]
}
```

No se filtra información interna adicional al artefacto.

---

# 30. Estrategia de lectura y caché

Para Catálogo se reemplaza la paginación operativa por descarga completa bajo demanda.

## 30.1. Productos

```text
entrar a Productos
→ descargar catálogo completo
→ cachear en memoria
→ buscar / filtrar / ordenar en frontend
```

Con el volumen actual de aproximadamente 1000 SKU, esta estrategia es aceptable.

## 30.2. Propuestas

```text
Pendientes
→ descargar todos los pendientes al abrir

Aprobados
→ descargar completos bajo demanda

Ignorados
→ descargar completos bajo demanda

Incorporados
→ descargar completos bajo demanda
```

Cada vista se conserva en caché hasta:

- mutación relacionada;
- cambio de revisión relevante;
- recarga;
- salida del contexto administrativo según política de caché existente.

No se debe paginar primero y separar Urgentes/Emergentes después.

El backend debe evitar truncamiento silencioso. Si existe un límite de seguridad técnico, la respuesta debe indicar que el conjunto no está completo o fallar explícitamente.

La virtualización de renderizado es compatible si algún listado crece; no equivale a paginación de datos.

---

# 31. Filtros y procesamiento frontend

Después de descargar la vista completa correspondiente, el frontend puede realizar localmente:

- búsqueda por producto;
- búsqueda por `c_interno`;
- separación Urgentes/Emergentes;
- ordenamiento;
- contadores;
- filtros visuales futuros aprobados.

Las vistas de estado continúan siendo:

```text
Pendientes
Aprobados
Ignorados
Incorporados
```

No se reintroducen filtros legacy de `ámbito`, `tipo` o contadores técnicos como elementos principales de la UI salvo una decisión futura explícita.

---

# 32. Modal de revisión

La acción de una fila es `Revisar propuesta`.

Se utiliza un icono distinto a `Eye`; la opción preferida vigente es `FileSearch` o equivalente semántico ya disponible.

El modal debe ser humano y operacional.

No debe presentar JSON crudo como contenido principal.

## Emergentes

Comparación:

```text
Campo | Actual | Propuesto
```

## Urgentes

Ficha compacta con:

- producto;
- `c_interno`;
- precio actual/propuesto según tipo;
- origen/sedes/apariciones cuando correspondan;
- contexto necesario para decidir.

Acciones de decisión:

```text
Aprobar
Ignorar propuesta
```

Para aprobados:

```text
Retirar aprobación
```

Y, cuando corresponda:

```text
Resolver precio del grupo
Completar configuración
```

---

# 33. Responsabilidad de Grupos frente a Catálogo

Grupos continúa siendo propietario de:

- estructura de grupos;
- nombres de grupo;
- membresía;
- categoría SOLOG;
- modalidad `Único/Agrupado`;
- unidades por paquete;
- precio por paquete;
- normalización estructural.

Catálogo puede preparar cambios sobre esas propiedades únicamente cuando:

1. un producto nuevo/reincorporado necesita estructura para poder publicarse; o
2. un cambio de precio bloquea la publicación.

Fuera de esos casos, la administración normal de Grupos permanece fuera de Catálogo.

Las transiciones:

```text
Incluido → Excluido
Excluido → Incluido
```

no pueden ser ejecutadas directamente por la operación genérica de Grupos. Deben pasar por Catálogo y su ciclo de propuesta/publicación.

---

# 34. Responsabilidad del Motor

El Motor continúa siendo propietario de:

- stock teórico;
- físico;
- diferencia;
- valorización;
- snapshots posteriores;
- reconteos;
- estados de diferencia;
- cobertura;
- estado operacional de grupo.

Catálogo no reimplementa esas reglas.

Cuando una publicación cambia composición o valoración de grupos, Catálogo debe ejecutar la transición/invalidez operativa definida por el Motor mediante contratos backend autoritativos.

---

# 35. Contratos backend que deben preservarse externamente

No se modifica el contrato público ConeXion V2.

La implementación de Catálogo puede modificar o sustituir contratos internos de SOLOG como:

```text
rpc_solog_admin_master_read_v2
rpc_solog_admin_master_v2
inventario.solog_admin_catalog_v2
inventario.catalogo_preparar_publicacion
inventario.catalogo_candidatos
inventario.conexion_admin_catalog
```

siempre que:

- el frontend se alinee al nuevo contrato;
- el backend se despliegue y valide primero;
- la salida final hacia ConeXion siga siendo V2;
- `conexion-admin` conserve o adapte internamente su integración sin cambiar el contrato externo.

Los nombres exactos de nuevas RPC/helpers no quedan congelados por este documento; sí quedan congeladas sus responsabilidades funcionales.

---

# 36. Cambios backend obligatorios derivados de esta especificación

La implementación backend deberá resolver como mínimo:

1. `marca` nullable sin perder datos existentes.
2. Canonicalización de precios antes de fingerprints.
3. Persistencia histórica independiente de incidencias.
4. Lecturas completas sin paginación/truncamiento silencioso para Catálogo.
5. Tipos formales `excluir_producto` y `reincorporar_producto`.
6. Staging de configuración de nuevo SKU.
7. Staging de exclusión/reincorporación/eliminación.
8. Staging reversible de resoluciones de precio.
9. Staging de `precio_paquete` asociado a cambio de precio.
10. Detección de propuestas aprobadas obsoletas.
11. Preview coherente con todos los cambios anteriores.
12. Commit atómico de catálogo + cambios estructurales requeridos.
13. Actualización/invalidación del estado operativo de grupos por composición.
14. Bloqueo temporal de grupos con SKU nuevo/reincorporado sin snapshot fresco.
15. Prohibición de excluir/reincorporar directamente desde la operación genérica de Grupos.
16. Preservación íntegra del contrato ConeXion ↔ Supabase V2.

---

# 37. Fuera de alcance

Este documento no redefine:

- UI completa de Grupos;
- reglas generales de edición de grupos no dependientes de una publicación;
- Motor de Conteos fuera de consecuencias necesarias por una publicación;
- contrato de dispositivos;
- Control;
- Incidencias salvo su relación como origen de propuestas;
- Conteos administrativos;
- diseño completo de futuras columnas opcionales de `Productos`;
- cambios al protocolo ConeXion V2.

---

# 38. Reglas de implementación

Por tratarse de Nivel C:

1. ChatGPT implementará primero los cambios necesarios en Supabase.
2. Se validarán con casos sintéticos y comprobaciones contractuales.
3. No se enviará frontend dependiente a Codex hasta tener el backend desplegado, validado y congelado.
4. Codex no debe modificar el backend salvo solicitud explícita del usuario.
5. Si Codex detecta una necesidad backend adicional, debe detenerse y devolver el bloqueo a ChatGPT.
6. La implementación frontend deberá tomar este documento como fuente primaria funcional.
7. No se permiten refactors generales ni reinterpretaciones del alcance congelado.

---

# 39. Validaciones backend obligatorias

Antes de declarar el backend listo para frontend deben comprobarse, como mínimo:

- `1.5`, `1.50` y `1.500` generan la misma identidad de precio;
- propuesta automática sobrevive como aprobada/ignorada/incorporada aunque se elimine la incidencia origen;
- propuesta aprobada queda bloqueada si aparece una propuesta incompatible más reciente;
- aprobar producto nuevo no modifica `inventario.catalogo`;
- configurar producto nuevo no modifica el maestro antes de publicar;
- exclusión/reincorporación no modifican el maestro antes de publicar;
- retirar aprobación elimina resoluciones dependientes;
- `Actualizar precio de todo el grupo` permanece en staging hasta publicación;
- `Separar SKU como Único` permanece en staging hasta publicación;
- `Actualizar precio xN` permanece en staging hasta publicación;
- el commit aplica todos los cambios dependientes atómicamente;
- un fallo de publicación no deja maestro/grupos/paquetes parcialmente modificados;
- nuevo/reincorporado sin stock fresco no se vuelve operable para Cajero;
- snapshot posterior válido vuelve operable el grupo;
- sesiones ya abiertas conservan su snapshot/precio/paquete/composición congelados;
- exclusión/reincorporación no puede saltarse Catálogo desde Grupos;
- artefacto publicado contiene solo `productos[]` y `excluidos[]` con schema 2;
- ConeXion puede autenticar, descargar, validar y confirmar la nueva versión sin cambios de cliente;
- `rpc_conexion_sync_snapshot` acepta snapshots V2 posteriores sin cambios contractuales.

---

# 40. Estado congelado final

Quedan congelados:

- propósito del módulo;
- responsabilidad frente a ConeXion, Grupos y Motor;
- separación `Propuestas / Productos`;
- estados `Pendiente / Aprobado / Ignorado / Incorporado`;
- clasificación `Urgentes / Emergentes`;
- tipos funcionales de propuesta;
- onboarding de productos nuevos;
- administración de exclusión/reincorporación;
- conservación opcional de `marca`;
- resolución de precio desde Catálogo;
- conservación de `Actualizar precio xN` exclusivamente para `Cambiar precio`;
- staging hasta publicación;
- publicación atómica;
- comportamiento ante grupos sin stock fresco;
- preservación de sesiones históricas/abiertas;
- descarga completa y filtrado frontend;
- persistencia histórica independiente de incidencias;
- canonicalización numérica de fingerprints;
- bloqueo de propuestas aprobadas obsoletas;
- compatibilidad íntegra con ConeXion ↔ Supabase V2.

Cualquier cambio posterior a estas reglas deberá tratarse como un **delta explícito** y conservará vigente todo lo que no reemplace de forma expresa.
