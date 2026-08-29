# SOLOG — Implementación de Conteo Quincenal/Diario con Modal y Calculadora

**Versión:** 1.0  
**Fecha:** 2026-08-29  
**Estado:** especificación técnica cerrada para implementación por Codex  
**Ámbito:** Panel Cajero — módulos `Conteo` y `Conteo diario`

---

# 1. Objetivo

Rediseñar la experiencia operativa de conteo del Panel Cajero para tablet, reutilizando una misma experiencia de captura en:

```text
Conteo quincenal
Conteo diario
```

La implementación debe optimizar:

- rapidez de uso;
- claridad para el trabajador;
- uso táctil en tablet vertical;
- mínima cantidad de llamadas a Supabase;
- corrección de conteos antes del envío;
- reutilización de componentes entre ambos módulos;
- preservación de la lógica backend y de batching ya existente.

La unidad operativa continúa siendo `grupo_conteo`.

---

# 2. Principio de implementación

Este documento es la **fuente de verdad funcional y técnica** para esta implementación.

El flujo de trabajo será:

```text
ChatGPT define
→ este documento congela decisiones
→ Codex analiza el repositorio una sola vez
→ Codex propone su propio plan de implementación
→ Codex implementa por fases
→ validación local por fase
→ una única revisión global al final
```

Codex es responsable de definir el plan de implementación después de inspeccionar el repositorio.

No debe reinterpretar ni rediseñar estas decisiones salvo que encuentre una incompatibilidad técnica real.

Si encuentra un bloqueo debe detenerse y reportar:

1. bloqueo;
2. por qué impide continuar;
3. cambio mínimo propuesto.

---

# 3. Alcance

Incluye:

- pantalla principal de `Conteo`;
- pantalla principal de `Conteo diario`;
- navegación visual por tipo de stock en Conteo quincenal;
- navegación visual por categorías;
- modal compartido por categoría;
- Vista 1 del modal: resumen de grupos;
- Vista 2 del modal: conteo individual;
- calculadora táctil integrada;
- almacenamiento local de expresión y conteo;
- edición previa al envío;
- envío manual desde pantalla principal;
- envío inmediato de seguridad al alcanzar 80 observaciones pendientes;
- eliminación del resto de disparadores automáticos de envío;
- adaptación tablet vertical, tablet horizontal y móvil secundaria.

---

# 4. Fuera de alcance

No modificar en esta implementación:

- Supabase remoto;
- DDL;
- RLS;
- RPC;
- Edge Functions;
- Storage;
- Auth;
- triggers;
- Cron;
- lógica administrativa;
- Dashboard;
- Inicio;
- Revisar;
- Historial;
- modelo `S0 → F0 → S1`;
- reglas de cobertura;
- clasificación de diferencias;
- saldo operativo vigente.

Si Codex determina que necesita un cambio backend, debe documentarlo en:

```text
docs/supabase-required-changes.md
```

sin modificar Supabase.

---

# 5. Contratos backend ya disponibles

## 5.1 Conteo quincenal

Existe una carga compacta mediante:

```ts
rpc_solog_state("groups", {
  vista: "conteo",
  device_token
})
```

El dataset permite resolver localmente:

- stock positivo;
- stock cero;
- stock negativo;
- categorías;
- grupos;
- cobertura pendiente.

Campos disponibles relevantes:

```text
grupo_id
nombre
categoria_id
categoria
categoria_orden
precio
stock_teorico
cubierto_quincena
pendiente_quincena
stock_cero
stock_negativo
```

No volver a usar una llamada por categoría para el nuevo flujo.

## 5.2 Conteo diario

Se mantiene:

```text
groups(vista: "conteo_diario")
```

La respuesta se carga una vez y las categorías se derivan en frontend.

Cambiar de categoría no debe generar nuevas llamadas backend.

---

# 6. Arquitectura funcional compartida

Ambos módulos compartirán la misma experiencia de categoría y captura.

```text
Conteo quincenal
  ↓
Tipo de stock
  ↓
Categoría
  ↓
Modal compartido
  ├── Vista 1 — Resumen
  └── Vista 2 — Conteo individual + calculadora

Conteo diario
  ↓
Categoría
  ↓
Modal compartido
  ├── Vista 1 — Resumen
  └── Vista 2 — Conteo individual + calculadora
```

La única diferencia estructural principal es:

```text
Conteo quincenal
→ tiene Nivel 1 por valor del stock

Conteo diario
→ no tiene Nivel 1
→ entra directamente a categorías
```

---

# 7. Conteo quincenal — Nivel 1

La pantalla principal mostrará siempre tres tarjetas:

```text
Stock positivo
Stock 0
Stock negativo
```

## 7.1 Reglas

- las tres tarjetas siempre permanecen visibles;
- pueden utilizar iconos;
- muestran cantidad pendiente;
- una tarjeta puede estar seleccionada, disponible o bloqueada;
- si tiene `0 pendientes`, permanece visible pero su `onClick` queda bloqueado;
- la selección filtra las categorías del Nivel 2;
- no genera llamadas adicionales a Supabase.

## 7.2 Clasificación

```text
stock_teorico > 0  → Stock positivo
stock_teorico = 0  → Stock 0
stock_teorico < 0  → Stock negativo
```

La clasificación se deriva completamente en frontend del dataset ya cargado.

---

# 8. Conteo quincenal — Nivel 2

Las categorías se mostrarán en una **grilla de dos columnas**.

Cada tarjeta podrá incluir:

- icono;
- nombre de categoría;
- cantidad pendiente.

## 8.1 Reglas

- las categorías dependen del tipo de stock activo;
- las categorías con `0 pendientes` permanecen visibles pero bloqueadas;
- pulsar una categoría abre el modal compartido;
- no se realizan nuevas llamadas al backend;
- el diseño principal está optimizado para tablet vertical.

---

# 9. Conteo diario — Categorías

Conteo diario utiliza directamente el nivel de categorías.

## 9.1 Reglas

- no mostrar filtro `Stock positivo / Stock 0 / Stock negativo`;
- mostrar las categorías derivadas de los grupos pendientes diarios;
- utilizar la misma grilla de dos columnas y el mismo lenguaje visual del Conteo quincenal;
- cada categoría abre exactamente el mismo modal compartido;
- no realizar consultas al cambiar de categoría;
- reutilizar el dataset/caché en memoria vigente.

---

# 10. Modal compartido de categoría

El modal será reutilizable por Conteo y Conteo diario.

## 10.1 Tamaño

En tablet vertical:

```text
ancho aproximado: 94–96%
alto aproximado: 92–96%
```

Debe conservar un pequeño margen exterior para mantener la percepción de modal.

En móvil puede aproximarse a fullscreen.

## 10.2 Header

Formato:

```text
← Cervezas                    4 / 12  ✕
```

Debe mostrar:

- acción de regreso;
- nombre de categoría;
- grupos registrados / total;
- cierre explícito.

## 10.3 Progreso

Debajo del header:

```text
████████░░░░░░░░░░░  33%
```

El progreso representa grupos con un conteo válido guardado localmente.

Reglas:

```text
campo vacío → no registrado
conteo 0    → registrado
conteo > 0  → registrado
```

---

# 11. Modal — Vista 1: resumen de grupos

Mostrar una lista compacta con estructura:

```text
Nombre    Stock TumiSoft    Diferencia    >
```

Ejemplo:

```text
Pilsen 473 ml      24      -     >
Corona 355 ml      15      0     >
Cusqueña 330 ml    18     -4     >
Heineken 330 ml    12     +3     >
```

## 11.1 Interacción

- toda la fila es accionable;
- al pulsarla se abre la Vista 2 para ese grupo;
- una fila ya contada sigue siendo accionable para permitir corrección;
- no usar iconos dentro de las filas;
- no reordenar grupos durante el trabajo.

## 11.2 Diferencia

```text
sin conteo            → "-"
diferencia = 0         → verde
diferencia < 0         → rojo
diferencia > 0         → azul
```

La fila ya contada puede recibir un cambio visual ligero de fondo/acento.

No teñir toda la fila según el signo de la diferencia.

---

# 12. Modal — Vista 2: conteo individual

Mantener el mismo header y progreso.

Mostrar un único grupo.

Estructura:

```text
PILSEN 473 ML

Stock TumiSoft            Conteo
24                         [ 38 ]

Diferencia                Valorizado
+14                        +S/ 77.00
```

## 12.1 Reglas visuales

- sin iconos dentro de la tarjeta;
- `Conteo` actúa como display del valor guardado;
- no depender del teclado numérico nativo del dispositivo;
- Diferencia y Valorizado se recalculan inmediatamente al guardar un nuevo resultado.

---

# 13. Calculadora integrada

Debajo de la información del grupo:

```text
12 + 6 + 20
                         38

[ 7 ] [ 8 ] [ 9 ] [  C  ]
[ 4 ] [ 5 ] [ 6 ] [  ×  ]
[ 1 ] [ 2 ] [ 3 ] [  +  ]
[ 0 ] [   Guardar   ] [ ⌫ ]
```

## 13.1 Operaciones permitidas

```text
0–9
+
×
C
⌫
Guardar
```

No incluir:

```text
−
÷
.
%
()
```

## 13.2 Resultado en vivo

Mientras la expresión sea válida, mostrar el resultado en vivo debajo de la expresión.

El resultado debe tener un peso tipográfico ligeramente mayor.

Ejemplo:

```text
12 × 6 + 3
75
```

## 13.3 Guardar

`Guardar`:

- toma el resultado válido actual;
- lo carga al display `Conteo`;
- actualiza el estado local del grupo;
- recalcula Diferencia;
- recalcula Valorizado;
- actualiza el progreso;
- no realiza ninguna llamada a Supabase.

`Guardar` no es navegación ni envío remoto.

---

# 14. Validación numérica

Conteo válido:

```text
0 <= integer <= 99999
```

`0` es un conteo físico válido.

Si el resultado excede `99999`:

```text
Cantidad muy alta
```

Reglas:

- no guardar resultados fuera de rango;
- no permitir resultados negativos;
- no permitir decimales;
- una expresión incompleta no se considera conteo válido.

---

# 15. Estado local

Por cada grupo pendiente basta conservar:

```ts
grupo_id -> {
  conteo: 38,
  expresion: "12 + 6 + 20",
}
```

Además se debe preservar cualquier identificador estable requerido por el batching existente, especialmente `client_observation_id`.

La expresión es información exclusivamente local.

No enviarla a Supabase.

## 15.1 Persistencia

El estado debe integrarse con el almacenamiento local/sessionStorage existente del buffer para soportar:

- navegación entre grupos;
- navegación entre categorías;
- regresar a Inicio y volver;
- recarga cuando sea compatible con el contrato actual;
- corrección antes del envío.

No crear infraestructura de persistencia adicional si no es necesaria.

---

# 16. Corrección previa al envío

Mientras una observación no haya sido enviada exitosamente:

- puede abrirse nuevamente;
- puede modificarse su expresión;
- puede usarse `C`;
- puede usarse `⌫`;
- puede calcularse otro resultado;
- puede pulsarse `Guardar` nuevamente;
- el último conteo guardado localmente reemplaza al anterior.

Después de un envío exitoso esa observación deja de ser editable desde este flujo.

---

# 17. Navegación en Vista 2

Acciones:

```text
[ Anterior ]     [ Regresar ]     [ Siguiente ]
```

Funciones:

```text
Anterior
→ grupo anterior

Regresar
→ Vista 1 de la categoría

Siguiente
→ grupo siguiente
```

En el último grupo:

```text
[ Anterior ] [ Regresar ] [ Siguiente categoría ]
```

## 17.1 Regla fundamental

Estas acciones son exclusivamente navegación.

Nunca deben:

- guardar automáticamente;
- confirmar automáticamente;
- enviar automáticamente;
- convertir un campo vacío en 0;
- evaluar una expresión incompleta como conteo.

Si existe una expresión local incompleta, puede conservarse para cuando el trabajador vuelva al grupo, pero el grupo sigue figurando como no registrado.

---

# 18. Categoría completada

Cuando todos los grupos tengan un conteo válido guardado localmente:

```text
12 / 12
100%
```

Reglas:

- no cerrar automáticamente el modal;
- no enviar automáticamente por completar la categoría;
- permitir revisar y corregir;
- ofrecer `Siguiente categoría` como navegación.

---

# 19. Enviar conteo

La acción `Enviar conteo` vive únicamente en la pantalla principal de `Conteo` / `Conteo diario`, a la altura del título.

Ejemplo conceptual:

```text
Conteo                  18 conteos por enviar
                        [ Enviar conteo ]
```

No existe `Enviar conteo` dentro del modal.

## 19.1 Envío manual

Al pulsar `Enviar conteo`:

1. reunir observaciones locales pendientes;
2. utilizar el `save_batch` existente;
3. mantener idempotencia;
4. procesar resultados parciales;
5. eliminar únicamente éxitos / `already_saved`;
6. eliminar también su expresión local;
7. conservar fallos para reintento posterior.

---

# 20. Envío inmediato de seguridad en 80

Se conserva **un único disparador automático**:

```text
pendientes locales >= 80
→ envío inmediato de seguridad
```

Objetivo:

- evitar acumulaciones excesivas en memoria/sessionStorage;
- limitar el riesgo de pérdida de trabajo local;
- mantener un tamaño razonable del buffer.

## 20.1 Reglas

Cuando el buffer alcance 80 observaciones pendientes:

- ejecutar inmediatamente el mismo flujo de `save_batch` utilizado por `Enviar conteo`;
- enviar el buffer pendiente completo coherente con el contrato actual;
- respetar idempotencia y resultados parciales;
- eliminar únicamente observaciones confirmadas/already_saved;
- eliminar sus expresiones locales;
- conservar fallos.

No mostrarlo al trabajador como una acción que deba decidir.

Debe funcionar como mecanismo de seguridad interno.

---

# 21. Disparadores automáticos eliminados

Eliminar del flujo operativo cualquier envío automático asociado a:

```text
salir de la vista con >= 40 pendientes
inactividad
cambio de categoría
cerrar modal
navegar entre grupos
completar una categoría
```

El envío remoto queda limitado a:

```text
1. Enviar conteo — acción manual
2. Seguridad inmediata al alcanzar 80 pendientes
```

No introducir otros thresholds ni nuevos mecanismos automáticos.

---

# 22. Frescura y lecturas backend

Este rediseño no elimina las lecturas necesarias para validar el estado operativo.

Mantener la filosofía event-driven vigente para:

- bootstrap;
- entrada a módulo;
- focus/visibility cuando corresponda al contrato actual;
- validación previa al envío;
- detección de snapshot nuevo.

No introducir polling.

Dentro de la interacción del modal deben producirse `0` llamadas adicionales por:

```text
abrir categoría
abrir grupo
Anterior
Regresar
Siguiente
Siguiente categoría
usar calculadora
Guardar
corregir conteo
```

---

# 23. Caché

Mantener la filosofía vigente:

```text
dataset operativo → memoria
buffer pendiente  → sessionStorage/local mechanism existente
```

No crear:

- IndexedDB nueva;
- caché persistente adicional;
- worker;
- polling;
- nueva dependencia de estado global

salvo que exista una necesidad técnica real demostrable.

---

# 24. Diferencia y valorizado

Fórmula:

```text
Diferencia = Conteo - Stock TumiSoft
```

Valorizado:

```text
Diferencia × precio
```

Semántica visual:

```text
Diferencia = 0  → verde
Diferencia < 0  → rojo
Diferencia > 0  → azul
sin conteo       → "-"
```

No utilizar el color de tema para reemplazar estos colores semánticos.

---

# 25. Responsive

Prioridad:

```text
1. Tablet vertical
2. Tablet horizontal
3. Móvil
4. Desktop compatible
```

## 25.1 Tablet vertical

Debe ser la referencia principal para:

- grilla de categorías;
- tamaño del modal;
- botones de calculadora;
- navegación inferior de Vista 2;
- targets táctiles.

## 25.2 Tablet horizontal

Aprovechar el ancho sin crear una arquitectura distinta.

## 25.3 Móvil

Adaptación secundaria.

El modal puede acercarse a fullscreen.

## 25.4 Desktop

Compatible, sin variante específica.

---

# 26. Reutilización obligatoria

El modal, calculadora, Vista 1 y Vista 2 deben ser compartidos entre Conteo y Conteo diario siempre que la arquitectura existente lo permita.

Evitar duplicar:

- cálculo;
- navegación;
- validación;
- estilos;
- gestión de expresión;
- presentación de grupos;
- lógica de progreso.

Las diferencias entre módulos deben resolverse mediante datos/props/contexto, no mediante dos implementaciones independientes.

---

# 27. Restricciones técnicas

- React 19 + Vite + TypeScript existentes.
- No nuevas dependencias salvo bloqueo técnico real.
- No nuevo sistema de estado global si el existente es suficiente.
- No acceso directo al schema `inventario`.
- No cambiar contratos backend sin documentar bloqueo.
- No refactors generales.
- No modificar módulos no relacionados.
- No duplicar cálculos autoritativos backend.
- No polling.
- No envío por cada grupo.
- No envío al cerrar modal.
- No envío por navegar.

---

# 28. Casos límite

Codex debe contemplar al menos:

1. categoría con 0 pendientes;
2. tipo de stock con 0 pendientes;
3. grupo con stock teórico negativo;
4. conteo físico 0;
5. conteo exactamente 99999;
6. resultado 100000 o mayor;
7. expresión incompleta;
8. expresión vacía;
9. corrección de un conteo previamente guardado localmente;
10. navegar sin pulsar `Guardar`;
11. último grupo de categoría;
12. categoría completamente registrada;
13. varias categorías con conteos locales simultáneos;
14. buffer alcanza 80;
15. respuesta parcial de `save_batch`;
16. `already_saved`;
17. fallo de red durante envío manual;
18. fallo de red durante envío de seguridad;
19. snapshot cambia antes del envío;
20. volver a una categoría ya trabajada;
21. valor guardado localmente con expresión restaurada.

---

# 29. Criterios de aceptación funcional

La implementación se considera correcta cuando:

### Conteo quincenal

```text
Tipo stock
→ Categoría
→ Modal Vista 1
→ Grupo
→ Vista 2
→ Calculadora
→ Guardar
→ navegar
→ volver/corregir
→ Enviar conteo
```

sin llamadas backend adicionales por navegación interna.

### Conteo diario

```text
Categoría
→ Modal Vista 1
→ Grupo
→ Vista 2
→ Calculadora
→ Guardar
→ navegar
→ volver/corregir
→ Enviar conteo
```

utilizando el mismo modal y componentes compartidos.

### Calculadora

- resultado en vivo válido;
- `Guardar` transfiere el resultado a Conteo;
- `Cantidad muy alta` cuando corresponda;
- rango entero `0–99999`;
- `0` válido;
- expresión recuperable antes del envío.

### Envío

- manual desde pantalla principal;
- automático únicamente al alcanzar 80 pendientes;
- sin envío automático en 40;
- sin envío por inactividad;
- sin envío al navegar/cerrar/completar categoría;
- manejo parcial/idempotente intacto.

---

# 30. Criterios de aceptación técnica

- Supabase no modificado por Codex.
- Sin llamadas por cambio de categoría.
- Sin llamadas por navegación del modal.
- Sin nueva dependencia innecesaria.
- Sin polling.
- Sin duplicar el modal para diario/quincenal.
- Sin regresiones del buffer/idempotencia.
- Sin pérdida de `client_observation_id` estable.
- Sin pérdida de conteos locales al navegar dentro del flujo.
- Expresiones nunca enviadas a Supabase.
- Observaciones enviadas exitosamente dejan de ser editables.

---

# 31. Instrucción para Codex

Codex debe leer este documento como fuente de verdad y luego analizar el repositorio únicamente para:

- comprender la arquitectura actual;
- identificar módulos y archivos afectados;
- validar compatibilidad con el código existente;
- detectar dependencias/riesgos/bloqueos reales;
- diseñar el plan de implementación más eficiente.

Después debe entregar un plan por fases **sin implementar cambios todavía**.

Las fases deben ser suficientemente grandes para evitar fragmentación y consumo innecesario de contexto, pero validables de manera independiente.

No debe realizar una revisión global en cada fase.

La revisión global se realiza una única vez al finalizar toda la implementación.

---

# 32. Principio general de desarrollo

Prioridad de esta implementación:

```text
correctitud
integridad
simplicidad
eficiencia
bajo consumo
mantenibilidad
```

Y para el flujo ChatGPT → Codex:

```text
definir una vez
→ congelar decisiones
→ analizar una vez
→ implementar por fases
→ validar localmente
→ revisar globalmente una sola vez
```

El objetivo es minimizar:

- exploración innecesaria;
- reinterpretación de requisitos;
- cambios de arquitectura durante desarrollo;
- refactors no solicitados;
- relecturas repetidas del repositorio;
- revisiones globales repetidas;
- explicaciones extensas;
- consumo innecesario de contexto y cuota de Codex.
