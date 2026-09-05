# SOLOG — Corrección Cajero Smoke E2E V1

**Estado:** CONGELADO para implementación frontend  
**Fecha:** 2026-09-04  
**Proyecto:** SOLOG  
**Nivel:** C — delta funcional con dependencia backend ya resuelta  
**Backend requerido:** `SOLOG_Backend_Contratos_Optimizacion_Global_V7.md`  
**API contract version:** `2`

---

## 1. Propósito

Este documento congela las correcciones funcionales y de UI/UX detectadas durante el smoke humano del módulo **Cajero** después de completar técnicamente I1–I2, C1–C4, D1–D3, A1–A6, G1 y G2.

Es un **delta** sobre las decisiones previamente congeladas. No reemplaza la especificación completa del Cajero.

Todo comportamiento anterior que no sea modificado explícitamente por este archivo **permanece vigente**.

---

## 2. Autoridad y prioridad documental

Para esta implementación, la jerarquía es:

1. **`SOLOG_Correccion_Cajero_Smoke_E2E_V1.md`** — fuente primaria del delta frontend descrito aquí.
2. `SOLOG_Backend_Contratos_Optimizacion_Global_V7.md` — fuente primaria para contratos backend/frontend.
3. `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` — decisiones funcionales globales.
4. `SOLOG_Plan_Implementacion_Optimizacion_Global.md` — trazabilidad del plan general.
5. Documentación histórica anterior, solo cuando no contradiga las fuentes anteriores.

Ante contradicción:

- este delta prevalece para los cambios de UI/UX y comportamiento local descritos aquí;
- V7 prevalece para payloads, respuestas, errores, idempotencia, revisiones, atomicidad y estado autoritativo backend.

---

## 3. Estado backend antes de frontend

El backend requerido por este delta ya fue desplegado y validado.

Migración:

`20260904123039_solog_cashier_review_batch_v7`

Cambios relevantes de V7:

- `review_queue` incluye:
  - `grupo_id`;
  - `detalle_id`;
  - `ultima_diferencia`;
  - `contado_at`.
- `review_queue` se ordena:
  - `contado_at ASC`;
  - `detalle_id ASC` como desempate.
- nueva acción:
  - `rpc_solog_cashier_mutate_v2('recount_save_batch', ...)`.
- `recount_save_batch`:
  - es transaccional;
  - es idempotente por `operation_id`;
  - congela el reconteo al momento del envío usando la sesión vigente;
  - aplica Motor V3 en backend;
  - devuelve estado autoritativo completo.
- `recount_start` y `recount_save` quedan solo como compatibilidad temporal y **no deben ser usados por el frontend nuevo**.

No se requieren cambios adicionales en Supabase para implementar este delta.

---

# 4. Cambios comunes a las vistas Cajero

Aplican a **Inicio**, **Conteo diario**, **Revisar** e **Historial**, salvo donde se indique otra cosa.

## 4.1. Eliminar label técnico

Eliminar de la UI el label:

`Sesión congelada`

La sesión continúa congelada técnicamente. Solo se elimina su exposición visual al usuario final.

## 4.2. Eliminar botón `Actualizar`

Eliminar el botón manual `Actualizar`.

No debe existir una acción visual que sugiera que el usuario puede adoptar un snapshot, catálogo o estado maestro nuevo dentro de una sesión congelada.

## 4.3. `Finalizar conteo`

`Finalizar conteo` se muestra **solo en Inicio**.

Ubicación:

- dentro de la sección/tarjeta de estado de stock;
- junto a `Continuar conteo`.

Reglas:

- antes de iniciar una sesión: **no mostrar**;
- con sesión iniciada: mostrar como acción secundaria;
- no mostrar en Conteo diario;
- no mostrar en Revisar;
- no mostrar en Historial;
- no mostrar dentro de modales de captura.

La lógica backend de `finish` no cambia.

---

# 5. Inicio

## 5.1. KPI `Conteo diario`

El KPI debe reflejar también el progreso local todavía no enviado.

Fórmula visual:

```text
pendientes_visibles =
pendientes_backend
-
pendientes_envio_conteo
```

Donde:

- `pendientes_backend` es el valor autoritativo recibido del backend;
- `pendientes_envio_conteo` son únicamente drafts de conteo normal todavía no enviados;
- los drafts de reconteo no se restan de este KPI.

No se modifica Supabase ni se simula `save_batch`.

Al ejecutar `save_batch` con éxito o replay:

- se reemplaza el estado local con el `state` autoritativo backend;
- desaparecen los drafts confirmados;
- el KPI se recompone desde el nuevo estado.

## 5.2. KPI `Revisar`

Cambiar el texto actual `N casos` por:

```text
n/N casos
```

Donde:

- `n` = reconteos realizados localmente y pendientes de envío;
- `N` = casos pendientes de Revisar según el estado backend/sesión.

Ejemplo:

```text
3/22 casos
```

significa que existen 22 casos pendientes y 3 ya tienen un reconteo local capturado aún no enviado.

## 5.3. KPI `Pendientes de envío`

Se conserva el KPI existente.

Puede representar conjuntamente:

```text
pendientes_envio_conteo
+
pendientes_envio_reconteo
```

No se añade otro KPI.

Internamente el store debe distinguir ambos tipos para evitar contaminar los cálculos específicos de Conteo diario y Revisar.

---

# 6. Conteo diario

## 6.1. Tarjetas de categorías

Reemplazar el texto:

`N pendientes`

por:

```text
n/N contados
```

No crear una segunda lógica de progreso.

La tarjeta debe reutilizar exactamente la misma derivación que ya utiliza correctamente el header del modal de Conteo.

Debe incluir los conteos locales todavía no enviados.

Ejemplo:

```text
4/8 contados
```

Si todos los grupos de la categoría fueron capturados localmente pero todavía no enviados:

```text
8/8 contados
```

---

# 7. Modal de Conteo

## 7.1. Diferencia en la lista de grupos

Después de capturar localmente un grupo, la columna `Diferencia` debe actualizarse inmediatamente.

Fórmula:

```text
diferencia_preview =
stock_fisico_local
-
stock_teorico_congelado
```

Reglas:

- grupo no contado: `—`;
- grupo contado localmente: diferencia preview;
- después del envío: usar el estado autoritativo recibido del backend.

Convención:

- negativo = faltante;
- positivo = sobrante.

## 7.2. Calculadora

La calculadora debe actualizar en tiempo real:

- `Diferencia`;
- `Valorizado`.

No debe esperar a `Continuar` ni a `Enviar conteo`.

### Diferencia

```text
diferencia_preview =
conteo_local
-
stock_teorico_congelado
```

### Valorizado sin paquete

Si:

- `unidades_por_paquete = null`;
- `precio_paquete = null`;

usar:

```text
valorizado_preview =
diferencia_preview
×
precio
```

### Valorizado con paquete

Si existen ambos:

- `unidades_por_paquete > 1`;
- `precio_paquete > 0`;

usar exactamente la misma regla backend:

```text
cantidad = abs(diferencia_preview)

paquetes_completos =
floor(cantidad / unidades_por_paquete)

unidades_sueltas =
cantidad % unidades_por_paquete

valorizado_preview =
sign(diferencia_preview)
×
(
  paquetes_completos × precio_paquete
  +
  unidades_sueltas × precio
)
```

Ejemplo:

```text
Diferencia          -14
Unidades/paquete     12
Precio paquete       20
Precio unitario       2

Valorizado          -24
```

### Datos inválidos

Si solo existe uno de:

- `unidades_por_paquete`;
- `precio_paquete`;

o la configuración no es válida:

```text
Valorizado = —
```

No inventar una fórmula alternativa.

### Fuente de precios

La preview usa exclusivamente datos congelados de la sesión:

- `precio`;
- `unidades_por_paquete`;
- `precio_paquete`.

No consultar valores maestros actuales.

### Autoridad

La valorización frontend es solo preview.

Después de persistir, backend continúa siendo autoritativo.

---

# 8. Revisar — tabla principal

## 8.1. Última diferencia

La columna `Última diferencia` debe mostrar:

`review_queue.ultima_diferencia`

No realizar una consulta adicional por fila.

No reconstruirla desde historial.

## 8.2. Diferencia actual

Antes de capturar un reconteo local:

`—`

Después de capturarlo localmente:

```text
diferencia_actual =
reconteo_local
-
stock_teorico_reconteo
```

Esta es una preview local.

## 8.3. Orden

La tabla debe respetar exactamente el orden recibido de `review_queue`.

Backend entrega:

```text
contado_at ASC
→ detalle_id ASC
```

Los casos más antiguos deben aparecer primero.

El frontend:

- no reordena por categoría;
- no reordena por nombre;
- no reordena por diferencia;
- no reordena por valorización;
- no reordena al capturar drafts.

El mismo orden debe usarse en:

- tabla;
- modal;
- contador `1/N`;
- navegación Anterior/Siguiente.

---

# 9. Revisar — flujo de captura y envío

## 9.1. Captura local

Abrir un caso de Revisar no debe escribir en Supabase.

Capturar y pulsar `Guardar`:

- crea/actualiza un draft local de reconteo;
- no ejecuta `recount_start`;
- no ejecuta `recount_save`;
- permite navegar al siguiente caso.

## 9.2. Envío por bloque

Los reconteos se envían por lote, igual que los conteos normales.

Usar:

```text
rpc_solog_cashier_mutate_v2
action = recount_save_batch
```

Contrato según V7.

El frontend debe enviar únicamente los reconteos locales pendientes.

## 9.3. Idempotencia

Una intención de envío crea un `operation_id`.

Si ocurre timeout/error incierto:

- reutilizar el mismo `operation_id`;
- reutilizar exactamente el mismo contenido del lote.

Una intención distinta usa un nuevo UUID.

Si backend devuelve `replay:true`:

- tratar como éxito;
- no duplicar KPI;
- no duplicar efectos;
- reemplazar estado local con `state` autoritativo.

## 9.4. Después de éxito

Al recibir éxito o replay:

- retirar drafts confirmados;
- reemplazar estado de sesión por `state` backend;
- recomponer KPIs;
- recomponer `review_queue`;
- conservar datos no relacionados.

---

# 10. Modal de Revisar

## 10.1. Cola única

Los casos de Revisar forman una única cola.

No tratar cada producto como una categoría independiente.

Contador:

```text
1/N
2/N
...
N/N
```

Donde `N` es la cantidad de casos de Revisar de la sesión.

## 10.2. Navegación

`Anterior`:

- deshabilitado solo en el primer elemento.

`Siguiente`:

- deshabilitado solo en el último elemento.

Navegar:

- no consulta backend;
- no escribe backend;
- usa la cola y datos ya presentes en memoria.

## 10.3. Carga del producto

La información debe salir del estado congelado de la sesión y de `review_queue`.

No debe existir un refresco unitario al abrir cada caso.

No debe aparecer temporalmente:

`Stock TumiSoft = —`

si el dato ya está disponible en la sesión.

## 10.4. Motivo

Eliminar el cuadro:

`Motivo: Recontar`

Todos los elementos de este módulo ya están allí precisamente porque requieren reconteo.

## 10.5. Última diferencia

Eliminar el cuadro independiente `Última diferencia`.

Mostrar la información junto al nombre del grupo.

Ejemplo conceptual:

```text
FRUGO GLORIA NARANJA 1L      Última diferencia: +1
```

## 10.6. Cuadros informativos

Mantener cuatro cuadros:

```text
Stock TumiSoft
Conteo
Diferencia actual
Valorizado
```

No añadir `Motivo`.

No añadir `Última diferencia` como cuadro.

## 10.7. Eliminar resolución backend de la captura

Eliminar mensajes como:

```text
Confirmada · Diferencia final: +1
```

Durante la captura el frontend no debe anticipar ni explicar la resolución de Motor V3.

Los estados finales:

- `Coincide`;
- `Confirmada`;
- `Inconsistente`;

se resuelven en backend al enviar el lote.

## 10.8. Diferencia actual

```text
diferencia_actual =
reconteo_local
-
stock_teorico_reconteo
```

No usar como preview la diferencia final calculada por backend en un caso ya resuelto.

## 10.9. Valorizado

El valorizado del modal de Revisar representa únicamente la **diferencia actual del reconteo**.

Usar la misma función preview definida para Conteo:

- precio unitario;
- o combinación paquete + unidades sueltas;
- usando datos congelados de sesión.

No utilizar la eventual diferencia final de Motor V3 para la preview.

Backend vuelve a calcular el valor persistido después de resolver el caso.

---

# 11. Historial — filtros por categoría

## 11.1. Estado inicial

Por defecto mostrar solo:

```text
Todas
Por categorías
```

Las tarjetas individuales de categorías permanecen ocultas.

## 11.2. `Por categorías`

`Por categorías` actúa como disclosure/toggle.

Al abrirlo:

- mostrar tarjetas de categorías existentes.

Al cerrarlo:

- ocultarlas.

Si al cerrarlo existía una categoría seleccionada:

- volver automáticamente a `Todas`.

No debe quedar un filtro activo invisible.

---

# 12. Historial — cabecera

Eliminar:

- `Sesión congelada`;
- `Actualizar`;
- `Finalizar conteo`;
- textos técnicos como `America/Lima` expuestos como metadata de implementación.

Subtítulo recomendado:

`Consulta tus conteos recientes`

La conversión de horarios a `America/Lima` sigue siendo obligatoria internamente.

---

# 13. Historial — detalle expandido

Se elimina el campo visual `Estado`.

El backend continúa conservando y entregando el estado; solo deja de mostrarse como una celda.

## 13.1. Estado `Coincide`

Mostrar solo la primera fila:

```text
Hora de conteo
Stock TumiSoft
Conteo
```

No mostrar segunda fila.

## 13.2. Estado `Recontar`

Mostrar solo la primera fila:

```text
Hora de conteo
Stock TumiSoft
Conteo
```

No mostrar segunda fila.

## 13.3. Estado `Confirmada`

Primera fila:

```text
Hora de conteo
Stock TumiSoft
Conteo
```

Segunda fila:

```text
Hora de reconteo
Stock posterior
Reconteo
```

## 13.4. Estado `Inconsistente`

Mostrar las mismas dos filas que `Confirmada`.

Adicionalmente:

- valor numérico de `Conteo`: rojo + tachado;
- valor numérico de `Reconteo`: rojo + tachado.

Aplicar tachado mediante línea intermedia.

No tachar labels.

No cambiar los datos originales.

## 13.5. Horas

Mostrar en formato:

```text
h:mm AM/PM
```

Ejemplos:

```text
1:39 AM
4:04 AM
5:09 PM
```

Reglas:

- sin cero inicial;
- convertir a `America/Lima`;
- no mostrar timezone como texto al usuario.

---

# 14. Store local

El store debe distinguir al menos conceptualmente:

```text
drafts_conteo
drafts_reconteo
```

Ambos son exclusivamente memoria.

No persistir drafts operativos en backend antes de `Enviar conteo`.

No añadir almacenamiento persistente nuevo salvo que un requisito posterior lo apruebe.

## 14.1. Recarga

Si el usuario recarga antes de enviar:

- los drafts locales pueden perderse conforme al contrato vigente;
- backend permanece intacto;
- la UI vuelve al estado autoritativo.

Este delta no cambia esa decisión.

---

# 15. Fuera de alcance

No forma parte de este delta:

- rediseñar navegación global;
- cambiar Auth;
- modificar Detalles;
- modificar Admin;
- modificar Index;
- modificar Motor V3;
- cambiar estados funcionales;
- cambiar fórmula backend de valorización;
- añadir nuevas tablas;
- añadir persistencia de drafts;
- eliminar RPC legacy del backend;
- ejecutar S10;
- refactors generales no relacionados;
- cambios estéticos fuera de las pantallas afectadas salvo los estrictamente necesarios para integrar este delta.

---

# 16. Restricciones para Codex

Codex debe:

- usar este archivo como fuente primaria del delta;
- usar V7 como fuente primaria contractual;
- establecer baseline antes de implementar;
- preservar cambios preexistentes;
- no modificar Supabase/backend;
- no usar `recount_start`;
- no usar `recount_save`;
- no introducir consumidores v1;
- no acceder directamente a `inventario`;
- no reconstruir `ultima_diferencia` mediante N+1;
- no recalcular Motor V3;
- no inventar nuevos estados/KPI;
- no realizar refactors generales no relacionados;
- detenerse si detecta un bloqueo backend real;
- reportar archivos, pruebas, desviaciones y consumidores legacy.

---

# 17. Validaciones mínimas de implementación

## 17.1. Unitarias / integración

Cubrir como mínimo:

- KPI Conteo diario con drafts normales;
- KPI Revisar `n/N`;
- KPI Pendientes de envío combinado;
- categorías `n/N contados`;
- diferencia preview Conteo;
- valorización unitario;
- valorización paquete + sobrantes;
- valorización inválida → `—`;
- diferencia en lista de modal Conteo;
- orden Revisar por `contado_at`;
- navegación `1/N`;
- drafts de reconteo sin RPC;
- `recount_save_batch`;
- timeout + replay;
- éxito batch;
- error batch;
- actualización autoritativa posterior;
- Historial categorías ocultas por defecto;
- cierre de categorías vuelve a `Todas`;
- visibilidad condicional segunda fila;
- estilo Inconsistente;
- formato horario Lima AM/PM.

## 17.2. Browser simulado

Validar:

- Inicio;
- Conteo diario;
- modal Conteo;
- Revisar;
- modal Revisar;
- Historial.

Comprobar específicamente que:

- no existe botón `Actualizar`;
- no existe label `Sesión congelada`;
- `Finalizar conteo` solo aparece en Inicio con sesión activa;
- abrir Revisar no produce llamada de mutación;
- navegar casos no produce llamadas;
- un solo envío puede contener varios reconteos;
- no hay N+1;
- no aparecen flashes de `Stock TumiSoft = —` cuando el dato ya está disponible;
- no se muestra resolución Motor V3 durante captura.

## 17.3. Validaciones técnicas

Ejecutar:

- suite completa;
- lint;
- TypeScript;
- build;
- `git diff --check`.

Ejecutar regresiones representativas de:

- Index;
- Detalles;
- Admin;
- Cajero previo.

---

# 18. Smoke humano / E2E pendiente

Después de implementar y validar técnicamente este delta:

1. disponer de snapshot confirmado y vigente;
2. usar dispositivo real autorizado;
3. iniciar sesión Cajero;
4. verificar Inicio corregido;
5. capturar conteos normales;
6. verificar:
   - KPI local;
   - `n/N`;
   - diferencia preview;
   - valorización preview;
7. enviar conteos normales por `save_batch`;
8. finalizar sesión;
9. disponer de snapshot posterior para habilitar casos `Recontar`;
10. iniciar nueva sesión;
11. verificar que Revisar:
    - está ordenado por antigüedad;
    - muestra `ultima_diferencia`;
    - navega `1/N`;
    - no escribe al abrir/guardar localmente;
12. capturar múltiples reconteos;
13. verificar KPI `n/N casos`;
14. enviar mediante un solo `recount_save_batch`;
15. comprobar estado autoritativo posterior;
16. finalizar sesión;
17. revisar Historial:
    - categorías plegables;
    - filas condicionales;
    - AM/PM;
    - estilo de Inconsistente.

Las simulaciones automatizadas no sustituyen este E2E.

---

# 19. Gate de cierre

Este delta puede considerarse:

- **Implementado técnicamente** cuando Codex complete código + validaciones automáticas/browser.
- **Validado funcionalmente** cuando el smoke humano final apruebe el comportamiento real.
- **Cerrado** solo después de:
  - smoke humano aprobado;
  - revisión proporcional final;
  - confirmación de que no queda un bloqueo contractual.

G3 permanece abierto hasta ese punto.

S10 continúa diferido.

---

# 20. Estado congelado final

Quedan congelados en esta V1:

- eliminación de `Actualizar`;
- eliminación de `Sesión congelada`;
- nueva ubicación/visibilidad de `Finalizar conteo`;
- progreso local en KPI Conteo diario;
- KPI Revisar `n/N`;
- reutilización del KPI Pendientes de envío;
- categorías `n/N contados`;
- diferencia y valorización preview en Conteo;
- valorización con paquetes;
- última diferencia backend en Revisar;
- orden Revisar por antigüedad;
- drafts locales de reconteo;
- envío de reconteos por batch V7;
- eliminación de mutaciones unitarias desde UI;
- modal Revisar con cola única y navegación completa;
- eliminación de Motivo;
- última diferencia junto al nombre;
- cuatro cuadros informativos;
- eliminación de resolución Motor V3 visible durante captura;
- valorización de diferencia actual en Revisar;
- categorías plegables en Historial;
- eliminación visual de Estado en detalle;
- filas condicionales por estado;
- Conteo/Reconteo rojos y tachados en Inconsistente;
- horas AM/PM en `America/Lima`.

Cualquier cambio posterior sobre este bloque debe realizarse mediante un nuevo delta.
