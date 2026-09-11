# SOLOG — Arquitectura de Grupos: responsabilidad, comportamiento y funciones V1

**Estado:** CONGELADO  
**Proyecto:** SOLOG  
**Módulo:** Grupos  
**Nivel:** C — Arquitectura funcional / lógica de negocio / integración con Motor  
**Fecha de congelación:** 2026-09-11  
**Fuente primaria funcional de Grupos:** este documento.  

## 1. Prevalencia documental

Este documento es la **fuente primaria para el comportamiento funcional del módulo Grupos**.

Se complementa con:

- `SOLOG_Arquitectura_Responsabilidades_Plataformas_V1.md`, que prevalece para los límites generales entre ConeXion, Supabase y SOLOG.
- `SOLOG_Arquitectura_Catalogo_Responsabilidad_Comportamiento_Funciones_V1.md`, que prevalece para las operaciones propias de Catálogo.
- El futuro contrato técnico de backend de Grupos, que deberá implementar esta definición sin reinterpretarla.

Ante una contradicción:

1. la responsabilidad general entre plataformas se resuelve con `SOLOG_Arquitectura_Responsabilidades_Plataformas_V1.md`;
2. una operación comercial o de ciclo de vida del SKU se resuelve con la fuente primaria de Catálogo;
3. una operación sobre estructura de conteo se resuelve con este documento;
4. una incompatibilidad técnica real debe volver a definición y aprobación antes de modificar estas decisiones.

Las implementaciones legacy de Grupos no prevalecen sobre esta definición.

---

## 2. Objetivo

Redefinir Grupos como el módulo responsable de **cómo los SKU ya incluidos se organizan para ser contados en SOLOG**, eliminando clasificaciones manuales redundantes y asegurando que cualquier cambio de composición mantenga coherencia con el Motor de Conteos.

La intención es que el administrador gestione **acciones reales sobre grupos e integrantes**, mientras los estados `Único` y `Agrupado` se deriven automáticamente de la composición.

---

## 3. Principio de responsabilidad

### 3.1. Catálogo

Catálogo es autoridad sobre la **identidad, existencia y propiedades comerciales del SKU**.

Incluye:

- `c_interno`;
- nombre comercial del producto;
- código de barras;
- precio unitario;
- alta;
- inclusión/exclusión;
- reincorporación;
- eliminación;
- publicación/versionado del catálogo compartido.

### 3.2. Grupos

Grupos es autoridad sobre la **estructura de conteo de los SKU ya incluidos**.

Incluye:

- pertenencia SKU ↔ grupo;
- composición de grupos;
- estado derivado `Único` / `Agrupado`;
- nombre o máscara operativa del grupo;
- categoría operativa;
- configuración de valorización por paquete;
- operaciones de agrupar, mover y separar SKU incluidos.

### 3.3. Motor

El Motor es autoridad sobre el **estado operativo resultante de esa estructura**.

Incluye, entre otros:

- stock teórico agregado;
- `Cambio_reciente`;
- cobertura;
- gates por falta de observaciones válidas;
- compatibilidad de reconteos;
- estado operativo por grupo y sede.

### 3.4. Cajero

Cajero consume la estructura y el estado operativo vigentes. No redefine Catálogo ni Grupos.

---

## 4. Límite Catálogo ↔ Grupos

La frontera funcional se congela así:

> **Catálogo define qué producto existe y cuáles son sus propiedades comerciales. Grupos define cómo ese producto incluido se representa y organiza para el conteo.**

Grupos **no puede**:

- crear un SKU comercial;
- eliminar un SKU comercial;
- incluir o excluir un SKU;
- reincorporar un SKU;
- cambiar el nombre comercial del producto;
- cambiar el código de barras;
- cambiar el precio unitario;
- publicar una versión de catálogo.

Catálogo puede preparar cambios de estructura de grupo **solo cuando sean necesarios para completar atómicamente una operación propia**, por ejemplo:

- alta de un SKU;
- reincorporación;
- resolución de un cambio de precio que exige separar o actualizar un grupo;
- preparación de la configuración de valorizado asociada a una publicación comercial.

Fuera de esas dependencias, la administración general de la estructura pertenece a Grupos.

---

## 5. Pantalla principal de Grupos

Grupos tendrá una única experiencia centrada en **grupos de conteo**.

Se elimina la pestaña legacy:

```text
[ Productos ]
```

También se elimina cualquier flujo cuyo objetivo sea clasificar manualmente un SKU como:

```text
Único / Agrupado
```

Esos estados son consecuencia de la composición y no decisiones administrativas independientes.

La pantalla deberá permitir, como mínimo:

- ver grupos;
- buscar grupos;
- filtrar por categoría;
- filtrar por tipo derivado `Único` / `Agrupado`;
- ver integrantes;
- crear grupos;
- mover integrantes;
- separar integrantes;
- editar nombre/máscara;
- editar categoría;
- consultar el precio unitario;
- configurar el valorizado por paquete.

---

## 6. Normalización automática del tipo de grupo

El backend debe garantizar siempre:

```text
0 integrantes  → grupo inactivo
1 integrante   → Único
2+ integrantes → Agrupado
```

Por tanto:

- no existe una acción manual `Cambiar a Único` que solo cambie una etiqueta;
- no existe una acción manual `Cambiar a Agrupado` que solo cambie una etiqueta;
- la acción funcional es mover, agrupar o separar integrantes;
- el estado resultante se deriva automáticamente.

No puede existir:

- grupo activo vacío;
- grupo `Agrupado` con un solo integrante;
- grupo `Único` con más de un integrante.

---

## 7. Acciones funcionales de Grupos

### 7.1. Consultar grupos

El administrador puede:

- listar grupos activos;
- buscar por nombre/máscara;
- filtrar por categoría;
- filtrar por tipo derivado;
- consultar integrantes;
- consultar precio unitario del grupo;
- consultar configuración de valorizado.

### 7.2. Crear grupo

`Crear grupo` exige **dos o más SKU incluidos y compatibles**.

No se permite crear manualmente:

- grupos activos vacíos;
- grupos nuevos con un único integrante mediante esta acción.

Para dejar un SKU solo se utiliza la acción funcional de separación / conversión a grupo unitario.

### 7.3. Agregar o mover SKU

El administrador puede mover uno o varios SKU incluidos a un grupo existente compatible.

La operación puede cambiar:

- grupo de pertenencia;
- tipo derivado del grupo origen;
- tipo derivado del grupo destino;
- categoría operativa del SKU, cuando el grupo destino pertenece a otra categoría.

### 7.4. Movimiento múltiple

Se permite seleccionar y mover varios SKU en una sola operación.

La operación debe ser **atómica**:

- todos los SKU se mueven;
- o ninguno se mueve.

Todos los SKU deben cumplir las invariantes del grupo destino.

### 7.5. Separar / dejar como Único

El administrador puede retirar un SKU de un grupo y dejarlo como grupo unitario.

La consecuencia es:

```text
SKU separado → grupo con 1 integrante → Único
```

El backend debe reutilizar o reactivar una estructura unitaria compatible cuando corresponda, en lugar de depender siempre de insertar un nuevo grupo.

### 7.6. Agrupar productos

Agrupar consiste en crear o utilizar una estructura con dos o más SKU compatibles.

La consecuencia es:

```text
2+ integrantes → Agrupado
```

---

## 8. Compatibilidad de integrantes

Solo pueden utilizarse como integrantes SKU con estado operativo de catálogo incluido.

Los SKU excluidos:

- no deben mostrarse como candidatos normales en los selectores de composición;
- no pueden reincorporarse indirectamente desde Grupos;
- deben gestionarse desde Catálogo.

Para incorporarse a un mismo grupo, los SKU deben respetar las invariantes vigentes, incluyendo compatibilidad de precio unitario.

Grupos no puede modificar el precio unitario para forzar compatibilidad.

---

## 9. Nombre y máscara operativa

### 9.1. Separación semántica

`catalogo.producto` representa el **nombre oficial/comercial** del SKU.

`grupos_conteo.nombre` representa el **nombre o máscara operativa de conteo**.

Modificar la máscara en Grupos no modifica el nombre comercial del producto.

### 9.2. Grupo Único

Al crear o reconstruir inicialmente un grupo unitario:

```text
nombre del grupo = nombre actual del producto
```

El administrador puede cambiar posteriormente ese nombre por una máscara más clara para el conteo.

Ejemplo:

```text
Producto: RON CARTAVIO BLACK 750ML
Máscara:  Cartavio Black
```

### 9.3. Sincronización ante cambio de nombre comercial

Si Catálogo cambia posteriormente el nombre del producto:

```text
si grupo.nombre == nombre anterior del producto
→ actualizar grupo.nombre al nuevo nombre
```

Si existe una máscara personalizada:

```text
si grupo.nombre != nombre anterior del producto
→ conservar grupo.nombre
```

Esto permite distinguir una máscara personalizada sin introducir un campo adicional.

### 9.4. Grupo Agrupado

Los grupos con dos o más integrantes pueden tener nombre/máscara administrativa editable.

---

## 10. Categoría operativa

Grupos es la autoridad general sobre la categoría operativa de la estructura de conteo.

El administrador puede:

- modificar la categoría de un grupo;
- mover un SKU a un grupo de otra categoría.

Al mover un SKU a un grupo de categoría diferente, la UI debe informar antes de confirmar que la categoría operativa del SKU cambiará a la del grupo destino.

La relación debe permanecer coherente:

```text
grupo.categoria_id
→ categoría de todos sus integrantes
```

Este cambio:

- es interno de SOLOG;
- no cambia el catálogo compartido ConeXion ↔ Supabase;
- no genera por sí mismo una publicación de Catálogo.

---

## 11. Eliminación e inactividad de grupos

No habrá una acción administrativa manual `Eliminar grupo`.

Cuando un grupo queda sin integrantes:

```text
0 integrantes → activo = false
```

El backend debe poder reutilizar/reactivar grupos inactivos compatibles cuando resulte correcto, especialmente al reconstruir un grupo unitario que ya existió anteriormente.

La lógica no debe depender de crear siempre un nuevo UUID con el nombre del producto, porque eso puede provocar conflictos con nombres históricos/inactivos.

---

## 12. Valorización por paquete

### 12.1. Responsabilidad general

La configuración genérica de paquete pertenece a Grupos.

Campos conceptuales:

- `unidades_por_paquete`;
- `precio_paquete`.

La ausencia de configuración es válida:

```text
unidades_por_paquete = NULL
precio_paquete = NULL
```

### 12.2. Modal compartido

Catálogo y Grupos reutilizarán un mismo componente visual:

**Configuración de valorizado**

Estructura funcional:

```text
Valorización por paquete       [switch]

Unidades por paquete
[x6] [x10] [x12] [x20] [Otro]

Precio por paquete
S/ [XX.XX]
```

### 12.3. Switch

Si está desactivado:

```text
unidades_por_paquete = NULL
precio_paquete = NULL
```

Los campos dependientes permanecen ocultos.

Si está activado, ambos valores deben ser válidos.

### 12.4. Unidades rápidas

Se ofrecen accesos directos:

- `x6`;
- `x10`;
- `x12`;
- `x20`;
- `Otro`.

`Otro` habilita un campo numérico.

La cantidad válida debe ser un entero `> 1`.

### 12.5. Precio sugerido

Al seleccionar una cantidad, la UI puede proponer:

```text
unidades × precio unitario
```

La sugerencia es una ayuda y **no una regla de negocio obligatoria**.

El administrador puede modificar libremente el precio por paquete.

Una edición manual del precio no debe ser sobrescrita silenciosamente por recálculos posteriores.

### 12.6. Uso desde Grupos

En Grupos habrá una acción visual de edición, por ejemplo un icono de lápiz junto al valorizado.

Abrirla muestra el modal compartido.

Al confirmar desde Grupos:

- la modificación se aplica inmediatamente;
- puede configurar, modificar o eliminar la valorización;
- no cambia el precio unitario del SKU/grupo.

### 12.7. Uso desde Catálogo

Al aprobar un `cambio_precio`, el flujo de Catálogo puede mostrar la acción:

```text
[ Actualizar valorizado ]
```

Esa acción abre el mismo modal compartido.

La diferencia funcional es:

- desde Catálogo, la decisión queda en staging;
- no modifica inmediatamente la configuración vigente;
- se aplica junto con la publicación del cambio comercial.

Catálogo debe mostrar un mensaje contextual indicando que la modificación se aplicará al publicar.

---

## 13. Componentes compartidos Catálogo ↔ Grupos

Cuando la decisión del usuario sea semánticamente la misma, ambos módulos pueden reutilizar componentes visuales comunes, incluyendo:

- selector de grupo;
- resumen de grupo;
- visualización de integrantes;
- selector de categoría;
- formulario/modal de valorizado.

La reutilización visual **no fusiona responsabilidades backend**.

Los componentes compartidos no deben decidir:

- qué RPC se ejecuta;
- si la modificación es inmediata o staged;
- qué store persiste el cambio;
- qué módulo tiene autoridad sobre la operación.

Cada módulo mantiene su propio contrato y momento de persistencia.

---

## 14. Protección frente a staging activo de Catálogo

Si Catálogo tiene una operación aprobada/preparada cuya publicación depende de un SKU o grupo específico, Grupos debe impedir una modificación incompatible sobre esa misma estructura.

No se bloquea únicamente porque exista una propuesta:

- `Pendiente`;
- `Ignorada`.

El bloqueo aplica cuando existe una preparación efectiva cuya validez pueda quedar comprometida por el cambio de Grupos.

Ante conflicto, el administrador debe resolver primero la preparación de Catálogo o retirarla según las reglas del módulo correspondiente.

---

## 15. Reconciliación obligatoria con Motor

Todo cambio de **composición** debe reconciliar el estado operativo en la misma operación transaccional.

Incluye, como mínimo:

```text
normalizar grupos afectados
→ recalcular estado operativo
→ marcar Cambio_reciente
→ cobertura = false
→ invalidar Recontar incompatible
→ recalcular stock agregado desde la última observación autoritativa disponible
→ aplicar gate si faltan observaciones suficientes
```

Aplica a operaciones como:

- crear grupo con integrantes;
- mover SKU;
- mover múltiples SKU;
- agrupar;
- separar / dejar como Único.

Este comportamiento es obligatorio para evitar que `estado_stock_grupo` conserve información correspondiente a una composición anterior.

---

## 16. Cambios que no alteran composición

Modificar únicamente:

- nombre/máscara;
- configuración de valorizado por paquete;

no constituye por sí mismo un cambio de composición.

Por tanto, no debe ejecutar automáticamente el mismo flujo de invalidación estructural del Motor.

La edición de categoría se deberá implementar manteniendo la coherencia entre grupo e integrantes y evaluando en el contrato técnico qué revisiones operativas concretas requiere, sin reinterpretar la regla de composición congelada aquí.

---

## 17. Sesiones de Cajero ya iniciadas

Las sesiones iniciadas deben conservar su snapshot lógico de trabajo.

Una sesión ya iniciada mantiene congelados, según el contrato vigente:

- grupo;
- integrantes;
- categoría;
- precio unitario;
- valorizado por paquete;
- stock teórico y demás datos operativos capturados para la sesión.

Los cambios administrativos posteriores afectan a nuevas sesiones, no reescriben una sesión ya iniciada.

---

## 18. Invariantes funcionales

El backend deberá preservar, como mínimo:

1. no existen grupos activos vacíos;
2. un grupo con un integrante es `Único`;
3. un grupo con dos o más integrantes es `Agrupado`;
4. SKU excluidos no pueden incorporarse mediante Grupos;
5. todos los integrantes respetan la categoría del grupo;
6. todos los integrantes respetan las reglas de compatibilidad de precio;
7. las operaciones múltiples son atómicas;
8. Grupos no puede modificar el precio unitario;
9. una composición modificada no puede dejar estado operativo calculado con la composición anterior;
10. sesiones iniciadas no se alteran retroactivamente;
11. la configuración de paquete es `NULL/NULL` o un par válido completo;
12. los estados `Único` / `Agrupado` nunca son decisiones manuales independientes.

---

## 19. Acciones eliminadas / legacy

Quedan funcionalmente reemplazadas y no deben perpetuarse en el nuevo diseño:

- pestaña administrativa `Productos` dentro de Grupos;
- selector manual de clasificación `Único / Agrupado`;
- cualquier acción que permita `Excluido` desde Grupos;
- eliminación manual de grupos;
- modificación de precio unitario desde Grupos;
- dependencia del patrón legacy de crear siempre un nuevo grupo unitario por nombre.

El futuro backend/frontend debe retirar o aislar estas rutas legacy cuando ya no tengan consumidores.

---

## 20. Alcance técnico diferido

Este documento congela **comportamiento funcional y fronteras de responsabilidad**.

No congela todavía:

- nombres definitivos de RPC;
- payloads y responses exactos;
- códigos de error;
- funciones internas;
- esquema de auditoría;
- estrategia exacta de locks;
- política exacta de revisión/concurrencia;
- permisos/grants;
- detalles de implementación del store frontend;
- composición concreta de archivos o componentes React.

Estas decisiones deberán definirse en el contrato técnico de backend después de implementar y validar Supabase.

---

## 21. Siguiente fase

Con esta definición funcional congelada, el siguiente bloque es:

1. diseñar el contrato técnico de Grupos V1;
2. implementar primero el backend en Supabase mediante ChatGPT;
3. corregir el bloqueo de reconciliación Motor detectado en el preflight;
4. validar con casos sintéticos de composición, valorizado, concurrencia e integración;
5. congelar `SOLOG_Backend_Grupos_Contrato_Tecnico_V1.md`;
6. solo después preparar el baseline y plan de Codex para frontend.

No debe enviarse a Codex una implementación frontend dependiente de contratos backend todavía incompletos o no desplegados.

---

## 22. Estado final del bloque

**Definición funcional de Grupos V1: CONGELADA.**

Cualquier cambio posterior a estas decisiones debe tratarse como:

- delta aprobado;
- corrección por incompatibilidad demostrada;
- o nueva versión del documento.

No se debe reinterpretar o rediseñar este bloque durante la implementación salvo que aparezca evidencia nueva que impida cumplirlo.
