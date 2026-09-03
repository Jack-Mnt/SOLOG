# SOLOG — Decisiones congeladas para optimización e implementación

**Estado:** Fuente de verdad funcional congelada  
**Fecha de cierre:** 3 de septiembre de 2026  
**Propósito:** Entregar a Codex una especificación inequívoca para analizar el repositorio y proponer, sin implementar todavía, un plan dividido en los bloques **Index**, **Cajero**, **Detalles** y **Admin**, cada uno con fases verificables.

---

## 1. Instrucciones para Codex

Este documento complementa las especificaciones congeladas del Motor V3 y del modelo de datos MVP. Para esta optimización, prevalecen las decisiones más recientes contenidas aquí cuando exista una diferencia con documentos o implementaciones anteriores.

Codex deberá:

1. Trabajar inicialmente en modo de análisis y solo lectura.
2. Contrastar esta especificación con el frontend, las RPC, el esquema y las funciones vigentes.
3. Proponer un plan en este orden:
   1. Index.
   2. Cajero.
   3. Detalles.
   4. Admin.
4. Dividir cada bloque en fases suficientemente independientes para implementarse y validarse por separado.
5. Indicar por fase:
   - objetivo;
   - cambios frontend;
   - cambios backend o migraciones;
   - archivos, módulos, RPC, tablas o funciones probablemente afectados;
   - dependencias;
   - riesgos;
   - pruebas y validaciones;
   - criterio de finalización;
   - estrategia de despliegue o compatibilidad cuando corresponda.
6. Incluir una fase final de integración global para comprobar conflictos entre bloques, concurrencia, deadlocks, cachés, contratos obsoletos y egress.
7. No implementar ningún cambio hasta que el plan sea aprobado.

Codex no deberá:

- reinterpretar o rediseñar decisiones congeladas sin una incompatibilidad técnica demostrable;
- realizar refactors generales no necesarios;
- ocultar la advertencia de tamaño del bundle aumentando el límite de Vite;
- alterar el Motor V3 salvo en los puntos preventivos expresamente incluidos en este documento;
- introducir polling agresivo, servicios permanentes o recargas automáticas por navegación o foco de pestaña;
- trasladar al navegador cálculos o filtrados que Supabase pueda resolver de forma más eficiente y consistente.

Si encuentra una incompatibilidad real, deberá detener esa parte del plan y exponer únicamente: bloqueo, evidencia, impacto y cambio mínimo propuesto.

---

## 2. Principios transversales

### 2.1. Responsabilidades de los sistemas

- ConeXion mantiene el flujo POS → Excel → snapshot → Supabase.
- `stock_actual` conserva el stock vigente informado por ConeXion.
- SOLOG consume stock, catálogo y grupos para conteos, diferencias, seguimiento y administración.
- SOLOG no modifica directamente el POS ni `stock_actual`.
- El ajuste POS continúa siendo una salida informativa y descargable, no una escritura automática sobre el POS.

### 2.2. Convención operativa

```text
diferencia = stock_fisico - stock_teorico
```

- Valor negativo: faltante.
- Cero: coincide.
- Valor positivo: sobrante.

La misma convención debe usarse en backend, UI, reportes, valorización y Excel.

### 2.3. Períodos y zona horaria

- El período principal continúa siendo quincenal: días 1–15 y 16–fin de mes.
- Todas las fechas operativas, cortes, turnos y períodos se resuelven en backend con `America/Lima`.
- Deben usarse rangos temporales semiabiertos para evitar duplicados o pérdidas en los límites.
- Los registros se atribuyen al período en el que se originó el conteo. Una resolución posterior no los traslada a otra quincena.
- El estado mostrado de esos registros sí refleja su resultado vigente. Por ejemplo, un conteo originado el lunes y confirmado el martes se muestra ahora como confirmado dentro del lunes.

### 2.4. Egress y carga de datos

- Supabase filtra, agrega y pagina antes de devolver datos.
- El navegador recibe solamente las columnas y filas necesarias para la vista solicitada.
- Las cargas generales se reducen a una RPC mínima por bloque o módulo cuando sea razonable.
- Los detalles, históricos extensos y exportaciones se solicitan únicamente bajo demanda.
- No deben existir consultas N+1 al abrir listas o tarjetas.
- Los resultados reutilizables se conservan en caché de memoria dentro del alcance definido para cada bloque.
- Una mutación invalida solamente las claves de caché afectadas.
- El bundle debe dividirse siguiendo las fronteras Index, Cajero, Detalles y Admin. Cada bloque se carga bajo demanda y las librerías exclusivas de un módulo no forman parte del bundle inicial.

### 2.5. Acceso y autorización

- Tener una cuenta permite consultar el estado del conteo y descargar diferencias y valorizaciones autorizadas para esa cuenta.
- La autorización del dispositivo habilita la operación de conteo; no es la condición para consultar información no sensible ni completa.
- El backend sigue derivando usuario, rol y sede autorizada; no confía en una sede enviada libremente por el cliente.
- Las acciones administrativas críticas son atómicas y verifican el rol en backend.

### 2.6. Cachés y aislamiento

- Las cachés operativas se identifican al menos por usuario, sede, sesión y versión de datos cuando corresponda.
- Deben limpiarse al cerrar sesión, vencer la sesión, revocar el dispositivo o completar exitosamente la operación relacionada.
- Ningún usuario de una tablet compartida debe poder ver el borrador o la caché privada del usuario anterior.
- No se persisten conteos pendientes ni reconteos en almacenamiento duradero del dispositivo.

---

# BLOQUE 1 — INDEX

## 3. Responsabilidad

Index es únicamente la entrada pública y el núcleo mínimo de navegación. No carga módulos operativos o administrativos y no consulta el estado de SOLOG.

## 4. Portada

- La portada es estática.
- No consulta ni confirma sesión.
- No inicializa el estado operativo de SOLOG.
- Presenta una única acción: **“Iniciar sesión”**.
- La acción navega a la ruta canónica `/login`.
- No deben coexistir `/Login` y `/login` como rutas distintas.

## 5. Login y redirección

- La comprobación de sesión comienza al entrar a `/login`.
- Si no existe sesión, se muestra el formulario de acceso.
- Si existe sesión válida, `/login` carga el contexto mínimo requerido y redirige al destino correspondiente al usuario.
- Las rutas protegidas continúan verificando sesión y permisos en backend.
- Auth y el contexto de SOLOG no deben montarse de manera que provoquen consultas desde la portada pública.

## 6. Estado de carga

Mientras `/login` valida la sesión o prepara la redirección:

- mostrar el símbolo de SOLOG;
- acompañarlo con puntos que aparezcan y desaparezcan;
- mostrar el texto **“Cargando el panel…”** o una variante igualmente breve, abstracta y coherente con la marca;
- mantener accesibilidad para movimiento reducido y lectores de pantalla;
- no mostrar una pantalla vacía ni un salto visual al destino.

## 7. Eficiencia del bloque

- Index debe contener únicamente routing, estilos y utilidades verdaderamente globales.
- Cajero, Detalles y Admin deben cargarse mediante separación real de código.
- Primero debe analizarse qué integra el chunk principal; solo después se decidirá si corresponde separar dependencias comunes o exclusivas.
- La advertencia de Vite no es por sí sola un bloqueante del lanzamiento y no debe silenciarse sin análisis.

## 8. Validaciones mínimas para el futuro plan

- Portada sin llamadas a Supabase.
- Navegación `/` → `/login` correcta.
- Usuario sin sesión permanece en login.
- Usuario con sesión válida es redirigido una sola vez.
- Sin bucles de redirección ni parpadeo de paneles protegidos.
- Loader visible, accesible y estable.
- Verificación del bundle inicial y de las cargas lazy.

---

# BLOQUE 2 — CAJERO

## 9. Responsabilidad

Cajero resuelve el trabajo operativo continuo: estado de la sede, conteo físico, revisión pendiente, reconteo permitido e historial inmediato. Debe priorizar baja latencia, estabilidad durante la sesión y pocas llamadas.

## 10. Bootstrap único del panel

Al ingresar al panel se realiza una única carga operativa que entrega, como mínimo:

- contexto de usuario, sede y dispositivo;
- sesión activa o posibilidad de iniciarla;
- snapshot de referencia aplicable;
- grupos habilitados;
- SKU integrantes necesarios para mostrar y contar cada grupo;
- estado operativo de los grupos;
- grupos disponibles para conteo;
- grupos disponibles para Revisar;
- datos suficientes para resolver los KPI del panel.

Los KPI se derivan de esa misma respuesta. No se realiza otra consulta únicamente para calcularlos.

El resultado se mantiene en caché de memoria durante la sesión y se reutiliza entre las vistas del panel.

## 11. Actualización del estado

- Las comprobaciones generales ocurren al entrar y al ejecutar una actualización explícita.
- No se vuelve a consultar por cada navegación interna.
- No se consulta automáticamente al regresar a la pestaña.
- No se refresca todo el panel después de cada acción operativa.
- Cada guardado devuelve el resultado autoritativo necesario para actualizar localmente el grupo, la cola y los KPI afectados.
- Los errores o conflictos de versión no se resuelven aplicando silenciosamente datos obsoletos.

## 12. Sesión y consistencia

- La sesión operativa dura como máximo dos horas.
- Hay como máximo una sesión activa por sede, conforme al contrato del Motor V3.
- ConeXion y Supabase mantienen un intervalo mínimo de dos horas entre snapshots confirmados de una sede.
- El intervalo entre snapshots no se usa como sustituto de la consistencia de sesión.

Al iniciar la sesión deben congelarse:

- `snapshot_referencia_id`;
- versión o revisión del catálogo;
- versión o revisión de grupos;
- conjunto de grupos habilitados;
- stock teórico aplicable;
- denominadores operativos necesarios.

Un snapshot que llegue durante la sesión puede procesarse globalmente, pero no modifica la referencia, la elegibilidad ni la interfaz de esa sesión. Sus efectos aparecen en la siguiente sesión o actualización compatible.

Cada escritura debe validar en backend la sesión y la revisión esperada. Ante incompatibilidad debe responder con un error de dominio explícito, nunca guardar contra una mezcla de versiones.

## 13. Conteo y Revisar

- La unidad operativa sigue siendo `grupo_conteo`.
- Un grupo que ya fue contado en la sesión actual no vuelve a ofrecerse para conteo normal dentro de esa misma sesión.
- Un grupo contado en la sesión actual no puede ser recontado en esa misma sesión.
- El reconteo correspondiente se realiza en una sesión posterior.
- Un grupo que espera reconteo no se ofrece simultáneamente como conteo normal.
- El reconteo completa la observación existente; no crea un conteo normal nuevo.
- El inicio del reconteo congela su propio snapshot teórico conforme al Motor V3.
- Los estados autoritativos continúan siendo `Coincide`, `Recontar`, `Confirmada` e `Inconsistente`.
- Las reglas funcionales de resolución del Motor V3 no se recalculan en frontend.

## 14. Borradores y persistencia

- Los borradores incompletos de la calculadora se conservan al cambiar de pestaña interna o módulo dentro de la sesión autenticada.
- La conservación debe resolverse en un estado de memoria ubicado por encima de las rutas que se desmontan.
- Deben aislarse por usuario, sede, dispositivo, sesión y grupo.
- No deben sobrevivir al cierre del navegador, reinicio de la tablet o cierre de sesión.
- No usar `localStorage`, IndexedDB u otro almacenamiento duradero para conteos pendientes, reconteos o borradores operativos.
- El borrador se elimina al guardar correctamente, descartarlo expresamente, vencer la sesión o perder la autorización.

## 15. Historial del Cajero

- El historial se carga únicamente cuando el usuario lo solicita.
- Se divide en **Hoy** y **Ayer**.
- Cada período se solicita completo; no se pagina en bloques.
- El filtrado se realiza en backend con zona horaria `America/Lima`.
- Cada período consultado se conserva en caché de memoria durante la sesión de página.
- Una mutación actualiza o invalida únicamente el período afectado.

## 16. Temporización operativa

Se conserva la comunicación progresiva de vigencia del stock/sesión:

- 0–1 h 30 min: **Stock actualizado**.
- más de 1 h 30 min y hasta 1 h 50 min: **Stock próximo a vencer**.
- más de 1 h 50 min y antes de 1 h 57 min: **Stock a punto de vencer**.
- desde 1 h 57 min: cuenta regresiva hasta la expiración.

La sesión deja de aceptar nuevos registros al expirar, conserva los registros ya guardados y permite el cierre conforme al contrato existente.

## 17. Validaciones mínimas para el futuro plan

- Una sola carga inicial sin duplicados por render.
- KPI, listas de Conteo y Revisar derivados del mismo payload.
- Navegación interna sin nuevas consultas generales.
- Entrada, actualización explícita y mutaciones con invalidación selectiva.
- Sesión consistente aunque ingrese un snapshot posterior.
- Imposibilidad backend y frontend de contar un grupo pendiente de reconteo.
- Imposibilidad de recontar en la misma sesión del conteo original.
- Borradores conservados entre rutas, pero eliminados al cerrar navegador o sesión.
- Historial completo Hoy/Ayer únicamente bajo demanda.
- Idempotencia frente a doble pulsación, reintento o respuesta tardía.
- Aislamiento entre usuarios, sedes, sesiones y dispositivos.

---

# BLOQUE 3 — DETALLES

## 18. Responsabilidad

Detalles permite al usuario autenticado revisar el estado de los conteos y descargar diferencias y valorizaciones. No concede permiso para realizar conteos y no requiere que el dispositivo esté autorizado para la operación de conteo.

## 19. Contrato y aislamiento

- Mantener un contrato aislado para `/detalles`, sin reutilizar rutas administrativas genéricas.
- La sede se deriva de `auth.uid()` y del usuario autorizado; no se acepta como autoridad un identificador libre del cliente.
- El contrato puede mantener las acciones conceptuales `summary`, `history`, `export` y `request_access`, siempre que el análisis del repositorio confirme su vigencia.
- No modificar desde este bloque `rpc_solog_count`, las RPC de Control, el Motor V3, conteos, reconteos, sesiones, buffers, snapshots ni autorización operativa.
- El resumen no debe repetir información que ya exista en el bootstrap mínimo del bloque.

## 20. Carga y caché

- La carga inicial devuelve solo el resumen necesario.
- El historial se solicita por **Hoy** o **Ayer** y se filtra en backend.
- El historial se pagina en bloques de 100 registros.
- La primera página se descarga al ingresar a la vista correspondiente; las páginas adicionales se solicitan al necesitarlas.
- Cada resultado ya solicitado se conserva en caché hasta recargar la página o salir del módulo.
- Cambiar entre Hoy y Ayer reutiliza los resultados ya obtenidos.
- La exportación se genera únicamente cuando el usuario la solicita.
- La solicitud de acceso, si continúa existiendo en la UI, se resuelve mediante una sola operación idempotente.

## 21. Egress

- El resumen, historial y exportación usan respuestas distintas y ajustadas a su finalidad.
- La lista no precarga el detalle completo de cada registro.
- El backend devuelve exactamente las columnas visibles más los identificadores necesarios para abrir un caso.
- El detalle de un caso se solicita una sola vez al abrirlo y se reutiliza mientras permanezca válida la caché del módulo.

## 22. Validaciones mínimas para el futuro plan

- Consulta permitida con cuenta válida aunque el dispositivo no pueda contar.
- Aislamiento correcto de sede y usuario.
- Hoy/Ayer resueltos desde backend.
- Páginas de 100 sin duplicados ni saltos.
- Caché reutilizada al navegar dentro del módulo.
- Historial y detalle sin N+1.
- Exportación exclusivamente bajo demanda.
- Ninguna regresión sobre el Motor V3 o las RPC operativas/administrativas.

---

# BLOQUE 4 — ADMIN

## 23. Arquitectura general de Admin

- Al entrar a Admin se ejecuta una RPC administrativa mínima con identidad, rol, permisos y datos comunes indispensables.
- Dashboard, Control, Catálogo, Grupos, Incidencias y Dispositivos realizan cargas propias bajo demanda.
- La caché vive en un proveedor o store común de Admin para sobrevivir a cambios internos de ruta.
- Las claves de caché incluyen módulo, sede, período y filtros relevantes.
- La caché se conserva hasta actualizar explícitamente, recargar la página, salir de Admin o ejecutar una mutación que afecte esos datos.
- Cada acción administrativa se resuelve mediante una operación backend atómica y devuelve el estado autoritativo actualizado.
- Debe mostrarse un estado **Actualizado** usando la hora generada por el servidor y, cuando aplique, la fecha del snapshot fuente; no usar únicamente la hora local de descarga.

## 24. Dashboard

### 24.1. Presentación

- Eliminar los KPI globales del Dashboard.
- Presentar una tarjeta completa por sede.
- Evitar agregados globales que mezclen realidades operativas de sedes distintas.
- Cada tarjeta conserva únicamente información operativa útil de esa sede.

### 24.2. Prioridad de cobertura

- Mientras la cobertura quincenal no esté completa, mostrar únicamente su barra de progreso como indicador principal.
- Al completar la cobertura quincenal, reemplazar la barra por el estado **Completada**.
- Después de completarla, mostrar la cobertura diaria como barra de progreso principal.
- No mostrar simultáneamente dos barras que compitan por atención.

### 24.3. Despliegue por turnos

El chevron de cada tarjeta abre un grid con columnas por fecha y filas:

| Turno | Lun 1 | Mar 2 | … |
| --- | ---: | ---: | ---: |
| Día | 5 % | 15 % | … |
| Noche | 10 % | 10 % | … |
| Madrugada | 5 % | 20 % | … |
| Total | 20 % + | 45 % + | … |

Turnos operativos:

- Día: `[07:30, 15:30)`.
- Noche: `[15:30, 00:00)`.
- Madrugada: `[00:00, 07:30)`.

Los porcentajes representan grupos contados dentro de cada turno. La fila Total representa la cobertura acumulada del día sin duplicar un grupo contado más de una vez.

El símbolo `+` de Total abre un drawer lateral del día seleccionado.

### 24.4. Drawer diario

El drawer muestra:

- KPI **Por recontar**;
- KPI **Confirmadas**;
- KPI **Inconsistentes**;
- tabla de grupos originados ese día.

Columnas visibles de la tabla:

- Grupo / estado.
- Stock teórico o posterior aplicable.
- Stock físico o reconteo aplicable.
- Diferencia.
- Valorizado.

El resultado mostrado es el estado vigente de los conteos originados ese día. Si se resuelven posteriormente, el día de origen refleja ahora el resultado resuelto.

### 24.5. Datos históricos y Cron

- Guardar la cobertura por sede, fecha y turno para conservar la evolución histórica.
- Ejecutar tres cortes diarios mediante Supabase Cron.
- Los tres cortes usan una misma función parametrizada y reglas temporales en `America/Lima`.
- Cada corte debe ser idempotente y usar una clave única equivalente a `sede + fecha_operativa + turno`.
- Un reintento o ejecución tardía actualiza el mismo corte; no crea duplicados.
- El corte de Noche ejecutado después de medianoche debe atribuirse al día en que comenzó ese turno.
- Debe existir recuperación segura de cortes omitidos.
- La tabla histórica conserva numerador, denominador, porcentaje, revisión de grupos y hora real del cálculo.
- El denominador del día se congela para que Día, Noche, Madrugada y Total sean comparables aunque el catálogo cambie durante el día.

### 24.6. Uso compartido con Control

- Dashboard y Control comparten la misma fuente autoritativa de información por sede y período.
- El detalle ya solicitado y guardado en caché puede ser consumido por ambos módulos.
- Compartir la fuente no obliga a enviar todas las filas al abrir el Dashboard; el detalle se carga al desplegar la sede o abrir el drawer.
- La exportación no reutiliza ciegamente la caché visual: solicita su RPC autoritativa bajo demanda.

### 24.7. Descarga desde la tarjeta

- Cada tarjeta de sede incluye la acción **DESCARGAR AJUSTE**.
- La acción abre el mismo modal y usa el mismo contrato de exportación que Control.
- La sede de la tarjeta queda preseleccionada.

## 25. Control

### 25.1. Consulta

- Control consume la fuente por sede y período compartida con Dashboard.
- Las tablas se filtran y ordenan en backend.
- Los detalles y cronología de un grupo se solicitan al abrirlo, no por cada fila de la tabla.
- Las resoluciones posteriores actualizan el estado vigente del registro en su fecha de origen.

### 25.2. Modal de exportación

- Cambiar la presentación de la acción a **DESCARGAR AJUSTE**.
- Antes de descargar, abrir un modal explicativo.
- El modal permite elegir:
  - quincena actual;
  - quincena pasada.
- El texto aprobado debe mencionar explícitamente **Período actual quincenal** o la opción quincenal seleccionada.
- La exportación descarga toda la información de la quincena elegida.
- El rango se calcula en backend con `America/Lima`.

### 25.3. Hojas del Excel

#### Resumen

- Resume el período y la sede seleccionada.
- Incluye los conteos por estado, entre ellos **Por recontar**.
- No utilizar la etiqueta “excluidas del ajuste por falta de reconteo”.

#### Ajustes

- Muestra únicamente diferencias confirmadas cuyo valor sea distinto de cero.
- Por cada grupo se considera primero el último resultado confirmado del período mediante orden determinista.
- Solo después de escoger el último resultado se filtra `diferencia != 0`.
- Si el último confirmado de un grupo es cero, no debe reaparecer un confirmado anterior distinto de cero.
- Las columnas teóricas y físicas representan exactamente los valores usados para obtener la diferencia exportada:
  - conteo: teórico y físico;
  - reconteo: teórico del reconteo y físico del reconteo.

#### Por recontar

- Muestra todas las diferencias que continúan en estado `Recontar` dentro del período seleccionado.

#### Inconsistentes

- Muestra todas las diferencias en estado `Inconsistente`.
- No incluye valorización.
- No incluye una columna genérica “Stock posterior”.
- Usa exactamente estas etiquetas de presentación:
  - Teórico de conteo.
  - Físico de conteo.
  - Diferencia de conteo.
  - Teórico de reconteo.
  - Físico de reconteo.
  - Diferencia de reconteo.

#### Todas

- Incluye todos los registros del período.
- Se ordena primero por nombre del grupo y luego por fecha-hora para facilitar la trazabilidad.

### 25.4. Consistencia de exportación

- La selección del último confirmado por grupo debe tener desempate determinista, por ejemplo fecha relevante descendente e identificador descendente.
- La exportación debe ejecutarse desde una RPC propia, set-based y bajo demanda.
- Todos los valores deben reconstruirse desde los snapshots y campos congelados de cada observación, no desde el stock vigente al momento de descargar.

## 26. Catálogo, grupos y precios

### 26.1. Precio unitario de un SKU agrupado

Si un SKU agrupado cambia a un precio unitario distinto del resto:

- bloquear la publicación mientras exista la inconsistencia;
- permitir resolverla dentro del mismo flujo mediante dos opciones:
  - **Actualizar precio de grupo:** aplica el nuevo precio unitario a los demás SKU del grupo;
  - **Separar del grupo:** retira el SKU afectado y crea para él un nuevo grupo individual.

La resolución y la publicación deben ser atómicas o quedar en un estado pendiente claramente recuperable. No se admite una publicación parcial.

### 26.2. Precio por paquete

- El precio por paquete no forma parte del catálogo compartido entre ConeXion y Supabase.
- No se valida ni bloquea la publicación del catálogo por una posible diferencia en ese precio.
- En el modal de aceptación del pendiente se ofrece **Actualizar precio xN**, donde `N` es `unidades_por_paquete`.
- La actualización del precio por paquete ocurre al aceptar el pendiente, no como efecto automático de detectar el cambio unitario.
- La decisión explícita del administrador queda registrada para auditoría.

### 26.3. Invariantes de grupos

El backend debe aplicar las mismas reglas en todos los caminos de escritura, no solo en la UI:

- cero SKU aplicables: grupo inactivo o eliminado según el contrato vigente;
- un SKU: grupo individual;
- dos o más SKU: grupo agrupado;
- ningún grupo activo vacío;
- ningún grupo agrupado con un solo integrante;
- precio y categoría compatibles según las reglas vigentes.

Crear, separar, reclasificar o actualizar un grupo debe realizarse en una transacción única.

### 26.4. Activación de cambios

- Toda sesión operativa usa una revisión congelada de catálogo y grupos.
- Los cambios administrativos pueden prepararse inmediatamente.
- Su activación no debe alterar una sesión ya iniciada.
- Codex deberá evaluar el mecanismo mínimo compatible con el repositorio: activación diferida hasta que terminen las sesiones afectadas o revisión esperada con rechazo explícito de escrituras obsoletas.
- La solución elegida debe preservar el objetivo congelado: nunca mezclar en una misma sesión composiciones, precios o denominadores de revisiones distintas.

## 27. Incidencias

### 27.1. Carga inicial

- Cargar todas las familias de incidencias relevantes del período operativo; no usar un filtro manual por fechas.
- De cada familia repetida, devolver inicialmente una sola representación resumida.
- No es necesario descargar inicialmente todas sus repeticiones ni su frecuencia completa.
- El botón `+` solicita bajo demanda el detalle y las repeticiones de esa familia.

### 27.2. Acciones rápidas

- Incluir **Ignorar** como acción rápida sin exigir la descarga previa del detalle completo.
- Ampliar la supresión a 30 días.
- Incluir **Reactivar incidencia** para levantar anticipadamente la supresión.
- Cambiar la acción **Eliminar** por **Proponer eliminación**.
- Ignorar, reactivar y proponer eliminación deben ser operaciones backend atómicas e idempotentes.

### 27.3. Identidad y supresión

- La familia debe identificarse mediante una clave canónica estable generada en backend, no mediante el texto mostrado en pantalla.
- La misma regla de familia se usa al insertar, repetir, ignorar y reactivar.
- Una supresión global o de sede debe respetarse también en el camino `ON CONFLICT` de una incidencia repetida.
- Corregir el comportamiento vigente por el cual una incidencia global ignorada puede reaparecer como pendiente al repetirse.
- Ignorar una familia afecta todas sus coincidencias dentro del alcance elegido sin requerir su descarga al navegador.
- La supresión afecta la presentación administrativa, no desactiva validaciones críticas del procesamiento de snapshots.
- Eliminar contratos antiguos de filtros de fecha (`desde/hasta` frente a `date_from/date_to`) que dejarán de tener uso con este diseño.

## 28. Dispositivos

- Mantener una tablet activa por sede.
- Las acciones siguen siendo autorizar, revocar y reemplazar.
- El backend verifica el estado del dispositivo en cada escritura operativa relevante.
- Dos administradores no deben reemplazar silenciosamente el dispositivo autorizado de una sede mediante escrituras concurrentes.
- Autorizar, revocar o reemplazar debe usar control de revisión esperada o bloqueo transaccional por sede.
- La respuesta devuelve el dispositivo autoritativo que quedó activo.
- La revocación limpia o invalida la caché operativa y los borradores asociados en cuanto el cliente recibe la respuesta o en la siguiente escritura protegida.

## 29. Concurrencia y locks administrativos

Existe un riesgo potencial de deadlock si una operación bloquea primero el grupo y luego sus productos, mientras otra bloquea primero un producto y luego el grupo.

Para prevenirlo:

- todas las mutaciones de catálogo, grupos, precios y paquetes deben seguir un orden único de locks; o
- para el MVP, pueden serializarse mediante un advisory lock transaccional exclusivo para datos maestros.

Si se usa un advisory lock:

- debe tener un namespace distinto del lock usado por la ingesta de snapshots;
- se libera automáticamente al terminar la transacción;
- no debe abarcar consultas de solo lectura ni trabajo de interfaz;
- la UI debe recibir un error recuperable si no puede completar la operación.

Durante la revisión se observaron cero deadlocks registrados, pero esta protección debe implementarse antes de introducir los nuevos caminos concurrentes.

## 30. Retiro de contratos obsoletos

Codex deberá localizar, confirmar y retirar de forma controlada después de migrar consumidores y agregar pruebas de contrato:

- rutas administrativas genéricas que continúen reenviando acciones a implementaciones legacy;
- ramas antiguas de `group_change_save` que resulten inalcanzables o dupliquen el flujo inmediato vigente;
- acciones genéricas `report` sustituidas por RPC dedicadas de Control y Detalles;
- aliases y fallback permisivos para acciones desconocidas;
- triggers antiguos que actualicen valorización por paquete como parte de la publicación del catálogo compartido;
- caminos obsoletos de reconteo por batch normal.

Las funciones o triggers que preserven snapshots de valorización en cada `conteo_detalle` no deben eliminarse por esta limpieza.

El retiro debe seguir este orden:

1. identificar consumidores reales;
2. agregar o actualizar pruebas de contrato;
3. migrar consumidores;
4. retirar concesiones, rutas o triggers obsoletos;
5. verificar que no queden llamadas en frontend, funciones o tareas programadas.

---

## 31. Salvaguardas globales obligatorias

### 31.1. Idempotencia

Debe existir idempotencia en:

- guardado de conteos;
- guardado de reconteos;
- inicio y cierre de sesión;
- solicitud de acceso;
- exportación cuando genere artefactos temporales;
- cortes de Cron;
- ignorar/reactivar incidencias;
- publicación y resolución de cambios de catálogo;
- autorización, revocación y reemplazo de dispositivos.

### 31.2. Orden de locks

- Snapshot: conservar el lock transaccional por sede y la revalidación dentro de la transacción.
- Datos maestros: usar un orden determinista o lock administrativo separado.
- Filas múltiples: bloquear identificadores en orden estable.
- Evitar transacciones que esperen interacción del usuario.

### 31.3. Datos obsoletos

- Toda respuesta cacheable incluye `generated_at` y una revisión o versión cuando sea aplicable.
- Una mutación recibe la revisión esperada y falla explícitamente si el estado cambió.
- La UI nunca presenta como exitoso un cambio rechazado por versión.
- Actualizar significa solicitar nuevamente la fuente del módulo afectado, no recargar toda la aplicación.

### 31.4. Datos históricos

- Los campos usados para diferencias y valorizaciones se congelan en la observación correspondiente.
- Ningún reporte histórico se reconstruye usando precios, grupos o stock actuales si estos pudieron cambiar.
- Los porcentajes históricos almacenan numerador y denominador, no solamente el porcentaje calculado.

---

## 32. Fuera de alcance

- Modificar automáticamente el POS.
- Permitir que SOLOG escriba directamente en `stock_actual`.
- Polling continuo para simular tiempo real.
- Persistir borradores operativos después de cerrar navegador o reiniciar la tablet.
- Recontar un grupo durante la misma sesión en la que se realizó su conteo inicial.
- Contar normalmente un grupo que continúa pendiente de reconteo.
- Descargar por anticipado todos los detalles de Control o todas las repeticiones de incidencias.
- Calcular turnos o límites de quincena usando la zona horaria del navegador.
- Silenciar el warning de chunks sin analizar su contenido.
- Refactors generales, cambios visuales ajenos o ampliaciones funcionales no descritas aquí.

---

## 33. Criterios globales de aceptación

La implementación completa solo podrá considerarse terminada cuando:

1. Cada bloque cumpla sus criterios particulares y pueda validarse de forma independiente.
2. La portada no genere consultas a Supabase.
3. Cajero use un bootstrap coherente y estable durante toda la sesión.
4. Ningún conteo mezcle snapshots, grupos, precios o versiones diferentes.
5. El egress disminuya por eliminación de llamadas duplicadas, respuestas sobredimensionadas y precarga de detalles.
6. Las cachés se reutilicen e invaliden en el alcance correcto sin filtrar datos entre usuarios o sedes.
7. Dashboard y Control compartan información sin duplicar descargas ni acoplar la exportación a datos visuales incompletos.
8. Los porcentajes por turno sean reproducibles, sumen correctamente al Total y sobrevivan a reintentos del Cron.
9. El Excel respete período, trazabilidad, estados y selección del último confirmado por grupo.
10. Las incidencias repetidas permanezcan suprimidas durante 30 días hasta ser reactivadas o vencer su supresión.
11. Las mutaciones administrativas preserven los invariantes de grupos y no publiquen estados parciales.
12. No existan rutas legacy activas ni triggers incompatibles después de migrar todos sus consumidores.
13. Las pruebas de concurrencia no produzcan deadlocks y las operaciones concurrentes tengan un resultado determinista.
14. TypeScript, build, lint, pruebas unitarias, integración, contratos RPC y smoke tests dirigidos finalicen correctamente.
15. Una revisión global final no encuentre regresiones entre Index, Cajero, Detalles y Admin.

---

## 34. Entregable esperado del siguiente paso

Codex deberá entregar únicamente un **plan de implementación**, todavía sin cambios, con esta estructura:

```text
Bloque 1 — Index
  Fase 1...
  Fase 2...

Bloque 2 — Cajero
  Fase 1...
  Fase 2...
  ...

Bloque 3 — Detalles
  Fase 1...
  Fase 2...

Bloque 4 — Admin
  Fase 1...
  Fase 2...
  ...

Integración global
  Conflictos entre bloques
  Concurrencia y deadlocks
  Contratos obsoletos
  Egress y bundle
  Validación final
```

Las fases deben respetar dependencias técnicas reales. Cuando una migración o contrato backend sea compartido por más de un bloque, Codex debe asignarlo a una sola fase propietaria e indicar qué fases lo consumen, evitando implementaciones duplicadas.

---

## 35. Estado de congelación

Todas las decisiones contenidas en este documento están congeladas para la preparación del plan. Cualquier cambio posterior deberá registrarse como una nueva decisión explícita antes de modificar la implementación.
