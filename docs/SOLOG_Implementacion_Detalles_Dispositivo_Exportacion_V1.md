# SOLOG — Implementación de `/detalles`, acceso de dispositivo y exportación quincenal V1

**Archivo:** `SOLOG_Implementacion_Detalles_Dispositivo_Exportacion_V1.md`  
**Proyecto:** SOLOG  
**Estado:** Congelado para implementación  
**Fecha:** 2026-08-31

---

# 1. Objetivo

Implementar un nuevo flujo de acceso para cajeros cuyo dispositivo no está autorizado, eliminando las páginas intermedias posteriores al login y sustituyendo `/device-pending` por una única ruta `/detalles`.

`/detalles` funcionará como panel informativo de solo lectura para la sede del usuario autenticado.

También incluirá:

- resumen operativo de la sede;
- estado del dispositivo;
- solicitud explícita de acceso cuando corresponda;
- historial en modal;
- exportación Excel de diferencias finales de la quincena/período vigente.

La implementación no debe modificar ni interferir con la lógica central del Motor V3.

---

# 2. Principios obligatorios

## 2.1. No tocar RPC centrales del Motor V3

No modificar la lógica ni el contrato operativo de:

```text
rpc_solog_count
```

En particular, deben permanecer intactas las acciones:

```text
start
status
groups
save_batch
recount_start
recount
finish
history
```

Tampoco modificar para esta implementación:

```text
rpc_solog_control
rpc_solog_control_detalle
rpc_solog_control_export
```

La nueva funcionalidad de `/detalles` debe permanecer aislada.

## 2.2. Backend de `/detalles`

La nueva RPC aislada ya implementada en Supabase es:

```text
rpc_solog_details(p_action, p_payload)
```

Acciones disponibles:

```text
summary
history
export
request_access
```

La sede debe derivarse siempre desde:

```text
auth.uid()
→ public.usuarios
→ sede_id
```

El frontend no debe poder seleccionar arbitrariamente otra sede.

## 2.3. Dispositivo no autorizado

Un cajero autenticado desde un dispositivo no autorizado puede:

```text
consultar /detalles
ver resumen de su sede
ver historial
descargar Excel
solicitar acceso únicamente si backend lo permite
cerrar sesión
```

No puede:

```text
iniciar conteos
continuar conteos
guardar observaciones
enviar lotes
realizar reconteos
finalizar sesiones
usar acciones operativas del Motor V3
```

---

# 3. Cambio del flujo posterior al login

## 3.1. Flujo actual a eliminar

Actualmente pueden aparecer pantallas intermedias como:

```text
Cargando…
Preparando sesión…
Cargando panel…
```

Estas pantallas no deben seguir apareciendo después de enviar el formulario de login.

## 3.2. Nuevo flujo

Después de pulsar `Ingresar`:

```text
Login
↓
botón cambia a "Ingresando…"
↓
Auth
↓
bootstrap SOLOG
↓
resolución de ruta
↓
panel final
```

El Login debe permanecer montado durante Auth + bootstrap.

No debe mostrarse una página intermedia completa.

## 3.3. Destino final

```text
admin/moderador
→ /admin
```

```text
cajero + dispositivo autorizado
→ /cajero
```

```text
cajero + dispositivo no autorizado
→ /detalles
```

## 3.4. Suspense

El lazy loading del panel Cajero no debe volver a mostrar una página completa tipo `Cargando panel…`.

Debe utilizarse un fallback visual discreto o mantener la transición sin introducir una nueva página intermedia.

---

# 4. Bootstrap de dispositivo

El bootstrap ya fue modificado en Supabase y debe consumirse de forma compatible.

## 4.1. Cambio fundamental

El bootstrap ya no crea automáticamente solicitudes de acceso.

Un token desconocido no debe generar por sí solo una fila `pendiente`.

## 4.2. Flags disponibles

El frontend debe contemplar como mínimo:

```text
dispositivo.autorizado
dispositivo.estado
dispositivo.sede_correcta
dispositivo.sede_tiene_dispositivo_autorizado
dispositivo.solicitud_existente
dispositivo.puede_solicitar_acceso
```

No deben eliminarse ni reinterpretarse otros campos existentes del bootstrap.

---

# 5. Ruta `/detalles`

## 5.1. Propósito

`/detalles` es un panel informativo de la propia sede para un cajero cuyo dispositivo no está autorizado.

Debe compartir la identidad visual del panel Cajero.

No debe parecer una página de error ni una pantalla temporal.

## 5.2. Estructura general

La ruta debe contener una única pantalla principal con:

```text
1. Estado del dispositivo
2. Resumen de la sede
3. Acciones informativas
```

No crear rutas hijas adicionales.

---

# 6. Tarjeta de estado del dispositivo

La tarjeta grande existente conceptualmente se conserva, pero se rediseña para compartir la identidad visual del panel Cajero.

Debe mostrar:

- sede;
- estado del dispositivo;
- situación de autorización;
- mensaje de solo lectura;
- estado de solicitud, si existe;
- acción `Solicitar acceso`, únicamente cuando corresponda;
- `Cerrar sesión`.

---

# 7. Regla de solicitud de acceso

## 7.1. Regla funcional

Si:

```text
dispositivo no autorizado
+
ya existe dispositivo autorizado en la sede
```

entonces:

```text
NO crear solicitud automáticamente
NO mostrar botón "Solicitar acceso"
panel continúa en solo lectura
```

Si:

```text
dispositivo no autorizado
+
NO existe dispositivo autorizado en la sede
```

entonces:

```text
mostrar "Solicitar acceso"
```

## 7.2. Acción explícita

Al pulsar:

```text
Solicitar acceso
```

se debe ejecutar:

```text
rpc_solog_details('request_access')
```

La acción backend es autoritativa e idempotente.

El frontend no debe asumir que puede solicitar acceso únicamente por tener el botón visible.

## 7.3. Después de solicitar

Si la solicitud se registra correctamente:

- actualizar el estado visual;
- ocultar/deshabilitar nuevas solicitudes según respuesta backend;
- no redirigir al panel Cajero;
- permanecer en `/detalles` hasta que el dispositivo sea autorizado y un bootstrap posterior lo confirme.

---

# 8. Resumen de sede

## 8.1. Fuente

Usar:

```text
rpc_solog_details('summary')
```

## 8.2. Diseño

Debe reutilizar el lenguaje visual del módulo Inicio del Cajero, pero en modo solo lectura.

No debe duplicar literalmente acciones operativas.

## 8.3. Información principal

Mostrar como mínimo:

```text
Cobertura del período
Pendientes del período
Conteo diario pendiente
Casos por revisar
Última actualización de stock
```

Puede reutilizar visualmente indicadores o tarjetas existentes de Inicio cuando no introduzca acoplamiento innecesario.

## 8.4. Terminología

El contrato técnico actual utiliza:

```text
cobertura_periodo
```

La interfaz puede mostrar:

```text
Cobertura quincenal
```

No renombrar el contrato frontend/backend solo por el texto visual.

## 8.5. Acciones prohibidas

No mostrar:

```text
Empezar conteo
Continuar conteo
Enviar conteo
Guardar
Recontar
```

---

# 9. Historial

## 9.1. Presentación

Historial no será una ruta independiente.

Debe abrirse mediante:

```text
Ver historial
```

como modal.

## 9.2. Fuente

Usar:

```text
rpc_solog_details('history')
```

## 9.3. Períodos

Mantener:

```text
Hoy
Ayer
```

## 9.4. Contenido

Debe reutilizar cuando sea razonable la experiencia visual del Historial Cajero:

- selector Hoy/Ayer;
- categorías;
- lista compacta;
- filas expandibles;
- múltiples filas abiertas si la implementación compartida ya lo soporta;
- orden cronológico vigente del contrato actual.

No debe permitir ninguna acción de captura o modificación.

## 9.5. Alcance

El historial corresponde a toda la sede del cajero autenticado.

No debe quedar restringido al usuario que inició sesión si otros cajeros realizaron los conteos de esa misma sede.

---

# 10. Exportación Excel

## 10.1. Acción

En `/detalles` debe existir una acción principal visible:

```text
Descargar Excel
```

La información se obtiene mediante:

```text
rpc_solog_details('export')
```

El archivo se genera en frontend.

## 10.2. Dependencia

Utilizar la dependencia ya existente:

```text
write-excel-file
```

No introducir una nueva librería de Excel.

Puede reutilizarse infraestructura técnica existente de exportación administrativa cuando sea útil, sin reutilizar el contrato de `rpc_solog_control_export`.

---

# 11. Nombre del archivo Excel

Formato obligatorio:

```text
SOLOG_Diferencias_quincenal_[mes_tresletras-dia-hora_ampm]_[sede].xlsx
```

Ejemplo:

```text
SOLOG_Diferencias_quincenal_ago-31-0635_am_Huaca.xlsx
```

Reglas:

- mes de tres letras;
- hora de 12 horas;
- `am` / `pm`;
- sin `:` en el nombre;
- sede sanitizada para nombre de archivo;
- fecha/hora corresponde al momento de generación.

---

# 12. Hojas del Excel

El archivo tendrá exactamente dos hojas:

```text
Resumen
Diferencias
```

---

# 13. Estados incluidos en el Excel

Incluir únicamente observaciones cuyo estado final sea:

```text
Confirmada
Inconsistente
```

No incluir:

```text
Coincide
Recontar
```

---

# 14. Hoja `Resumen`

Debe incluir como mínimo:

```text
Sede
Período
Generado
Diferencias finales
Confirmadas
Inconsistentes
Faltantes
Sobrantes
Valorizado faltante
Valorizado sobrante
Balance valorizado
```

La información debe provenir del resumen entregado por `rpc_solog_details('export')`.

---

# 15. Hoja `Diferencias`

Orden obligatorio de columnas:

```text
Fecha
Hora
Nombre
Categoría
Estado
Stock Tumi
Fisico
Diferencia
Valorizado
Detalle
```

No alterar el orden.

---

# 16. Semántica de columnas

## Fecha

Fuente:

```text
recontado_at
```

Formato esperado:

```text
DD/MM/YYYY
```

## Hora

Fuente:

```text
recontado_at
```

Formato de 12 horas.

## Nombre

Nombre histórico del grupo.

Priorizar el valor entregado por el contrato backend.

## Categoría

Categoría histórica del grupo.

## Estado

Solo:

```text
Confirmada
Inconsistente
```

## Stock Tumi

Fuente autoritativa:

```text
stock_posterior
```

## Fisico

Fuente autoritativa:

```text
stock_reconteo
```

## Diferencia

Fuente autoritativa:

```text
diferencia
```

Representa la diferencia operativa final.

Convención:

```text
negativo = faltante
positivo = sobrante
```

## Valorizado

Debe conservar signo:

```text
negativo = faltante
positivo = sobrante
```

El backend entrega el valor autoritativo calculado para exportación.

## Detalle

Debe explicar de forma legible cómo se obtuvo el valorizado.

Caso unitario:

```text
-4 × S/ 5.50 = -S/ 22.00
```

```text
+3 × S/ 8.00 = +S/ 24.00
```

Si existe valorización por paquete, la fórmula visual debe representar correctamente la combinación utilizada a partir de:

```text
unidades_por_paquete
precio_paquete
precio
diferencia
```

No inventar una fórmula unitaria cuando aplica valorización por paquete.

---

# 17. Orden de filas del Excel

Orden recomendado y congelado:

```text
Fecha ASC
Hora ASC
Nombre ASC
```

La hoja debe servir también como registro cronológico de cierre de diferencias.

---

# 18. Período de exportación

La exportación corresponde al período operativo vigente entregado por backend.

Aunque el contrato técnico use `periodo`, el nombre del archivo conserva la palabra:

```text
quincenal
```

por decisión funcional.

---

# 19. Seguridad

## 19.1. Solo propia sede

Todas las lecturas de `/detalles` deben permanecer limitadas a la sede asociada al usuario autenticado.

No enviar ni aceptar desde frontend un `sede_id` arbitrario para seleccionar otra sede.

## 19.2. Lectura no equivale a operación

Permitir `summary`, `history` y `export` desde un dispositivo no autorizado no debe ampliar permisos sobre las RPC operativas.

La autorización del dispositivo sigue siendo obligatoria para cualquier operación de conteo.

---

# 20. Archivos/módulos frontend probablemente afectados

Codex deberá confirmar durante su análisis, pero el alcance esperado incluye:

```text
src/app.tsx
src/lib/router.ts
src/pages/login.tsx
src/pages/dispositivo-pendiente.tsx
src/features/solog/context.tsx
src/features/solog/types.ts
src/features/solog/api.ts

módulos Cajero de Inicio/Historial reutilizables
módulos de exportación Excel reutilizables
src/styles.css
tests relacionados
```

La página `dispositivo-pendiente.tsx` puede ser reemplazada, renombrada o retirada según el plan de Codex.

---

# 21. Restricciones de implementación

- No modificar Supabase durante la implementación frontend.
- No modificar Motor V3.
- No alterar contratos operativos existentes.
- No realizar refactors generales.
- No crear rutas adicionales innecesarias.
- No crear una nueva librería de diseño paralela.
- No agregar dependencias si `write-excel-file` cubre la necesidad.
- No duplicar grandes cantidades de lógica de Inicio o Historial si puede reutilizarse limpiamente.
- No forzar reutilización si genera acoplamiento con captura operativa.
- No introducir polling.
- No introducir refresh por focus/visibility salvo que ya forme parte de un contrato existente aprobado.
- No convertir `/detalles` en una segunda versión del panel Cajero operativo.

---

# 22. Casos límite

## 22.1. Token desconocido

```text
bootstrap
→ no crea solicitud
→ /detalles
```

## 22.2. Ya existe dispositivo autorizado en sede

```text
puede_solicitar_acceso = false
→ ocultar Solicitar acceso
```

## 22.3. No existe dispositivo autorizado

```text
puede_solicitar_acceso = true
→ mostrar Solicitar acceso
```

## 22.4. Solicitud ya pendiente

La acción debe ser idempotente.

No crear duplicados.

## 22.5. Dispositivo autorizado mientras usuario permanece en `/detalles`

Un bootstrap/refresh posterior que confirme autorización debe permitir entrar al flujo normal de `/cajero`.

No implementar polling para detectar el cambio.

## 22.6. Sin historial

Mostrar estado vacío claro dentro del modal.

## 22.7. Sin diferencias finales para exportar

La exportación debe seguir pudiendo generar un archivo válido con:

```text
Resumen
Diferencias
```

y la hoja `Diferencias` sin filas de datos.

## 22.8. Exportación con `Inconsistente`

Debe incluirse.

No debe tratarse como candidato automático de ajuste POS; aquí el Excel es informativo.

---

# 23. Criterios de aceptación

La implementación se considera terminada cuando:

1. Después de login no aparecen `Cargando…`, `Preparando sesión…` ni `Cargando panel…` como páginas completas.
2. El Login permanece visible mientras termina Auth + bootstrap.
3. `/device-pending` deja de ser el destino operativo.
4. Cajero no autorizado entra a `/detalles`.
5. Cajero autorizado continúa entrando a `/cajero`.
6. `/detalles` comparte identidad visual con Cajero.
7. `/detalles` es estrictamente solo lectura salvo `Solicitar acceso`.
8. El botón `Solicitar acceso` respeta `puede_solicitar_acceso`.
9. No se generan solicitudes automáticas.
10. Historial se abre como modal.
11. Historial usa `rpc_solog_details('history')`.
12. Resumen usa `rpc_solog_details('summary')`.
13. Exportación usa `rpc_solog_details('export')`.
14. El Excel se genera con `write-excel-file`.
15. El archivo respeta el nombre definido.
16. Tiene hojas `Resumen` y `Diferencias`.
17. Solo incluye `Confirmada` e `Inconsistente`.
18. Las columnas aparecen exactamente en el orden definido.
19. Stock Tumi usa `stock_posterior`.
20. Fisico usa `stock_reconteo`.
21. Diferencia usa la diferencia final.
22. Valorizado conserva signo.
23. Detalle explica correctamente el cálculo.
24. No se modifican RPC centrales del Motor V3.
25. No se modifica Supabase durante la implementación frontend.
26. Tests relevantes, lint, build y `git diff --check` quedan correctos.

---

# 24. Fuera de alcance

No forman parte de esta implementación:

- rediseñar el Motor V3;
- cambiar la lógica de conteo;
- cambiar estados `Coincide`, `Recontar`, `Confirmada`, `Inconsistente`;
- cambiar reconteo;
- cambiar cobertura operativa;
- cambiar sesiones;
- cambiar buffer local;
- cambiar idempotencia de conteos;
- modificar `rpc_solog_control_export`;
- permitir seleccionar otra sede;
- añadir edición desde `/detalles`;
- añadir captura desde `/detalles`;
- crear una página independiente de Historial;
- añadir polling de autorización;
- realizar refactor general del sistema de routing o Auth.

---

# 25. Backend ya preparado

Antes de congelar este documento se realizaron los cambios necesarios en Supabase.

Queda disponible:

```text
rpc_solog_details('summary')
rpc_solog_details('history')
rpc_solog_details('export')
rpc_solog_details('request_access')
```

También se modificó de forma compatible:

```text
rpc_solog_state('bootstrap')
```

para:

- eliminar la creación automática de solicitudes;
- exponer flags de capacidad de solicitud;
- mantener los contratos existentes del Motor V3.

No se modificó `rpc_solog_count`.

---

# 26. Fuente de verdad de esta implementación

Para el bloque definido en este documento, ante contradicciones entre:

- frontend actual;
- `/device-pending` actual;
- comportamiento histórico de solicitud automática;
- implementación anterior del Login;
- exportación administrativa existente;

prevalece:

```text
SOLOG_Implementacion_Detalles_Dispositivo_Exportacion_V1.md
```

Los contratos y reglas del Motor V3 siguen siendo fuente de verdad para la lógica de inventario y no deben reinterpretarse desde este documento.

---

# 27. Flujo de implementación

A partir de este documento debe seguirse:

```text
ChatGPT define
→ documento congelado
→ Codex analiza el repositorio una sola vez
→ Codex propone plan por fases
→ aprobación del plan
→ implementación fase por fase
→ validación local por fase
→ una única revisión global al final
```

Codex no debe implementar nada durante la fase inicial de análisis y planificación.
