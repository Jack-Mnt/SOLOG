# SOLOG — Panel Cajero V3
## Especificación de implementación

**Documento:** `SOLOG_Panel_Cajero_V3_Especificacion_Implementacion.md`  
**Fecha de congelamiento:** 2026-08-26  
**Estado:** Definición funcional y contrato backend cerrados para implementación  
**Fuente de verdad:** Este documento prevalece para la implementación del Panel Cajero V3. Codex debe usarlo como especificación y no reinterpretar decisiones ya cerradas salvo bloqueo técnico real.

---

# 1. Objetivo

Implementar el Panel Cajero V3 de SOLOG como una interfaz operativa rápida y simple para:

1. Completar prioritariamente el conteo físico base de todos los grupos aplicables durante la quincena.
2. Verificar posteriormente los grupos que vuelvan a requerir observación.
3. Mostrar al trabajador el stock del POS TumiSoft; el conteo no será ciego.
4. Registrar observaciones físicas por lotes, reduciendo llamadas a Supabase.
5. Evitar pérdida de trabajo durante navegación, refresh o fallos temporales.
6. Detener nuevos conteos cuando la referencia de stock quede desactualizada o venza.
7. Mantener la complejidad administrativa e histórica fuera del panel operativo.

---

# 2. Principios funcionales

## 2.1 Prioridad operativa

Mientras la cobertura quincenal sea menor de 100 %:

```text
Conteo base
→ prioridad principal

Por verificar
→ disponible, pero secundario
```

El seguimiento no se bloquea.

Cuando la cobertura quincenal llegue a 100 %:

```text
Por verificar
→ prioridad operativa principal
```

## 2.2 Cobertura no significa resolución

Un grupo queda cubierto cuando tuvo al menos una observación física base en la quincena.

```text
Contado ≠ Resuelto
```

Un grupo con diferencia cuenta igualmente para cobertura.

## 2.3 Diferencias históricas

Las diferencias son observaciones independientes y nunca se suman.

Ejemplo:

```text
-2 → -2 → -3 → 0 → -1
```

El saldo actual no es `-8`.

El saldo operativo vigente es la última diferencia confirmada vigente según el modelo V3.

---

# 3. Supuestos operativos

## 3.1 Dispositivo

Regla:

```text
1 dispositivo autorizado por sede
```

El backend ya lo impone mediante un índice único parcial para dispositivos con estado `autorizado`.

## 3.2 Usuario

Actualmente existe un único usuario operativo tipo cajero por sede.

No se desarrollará en esta versión un modelo multiusuario de cajeros por sede.

La sede:

- viene asociada al usuario;
- siempre debe estar visible;
- no debe ser seleccionable ni editable por el trabajador.

---

# 4. Arquitectura de páginas

```text
/cajero
├── Inicio
├── Conteo
├── Por verificar
└── Historial
```

Rutas técnicas:

```text
/cajero
/cajero/conteo
/cajero/seguimiento
/cajero/historial
```

`Seguimiento` puede mantenerse en la ruta técnica, pero el texto visible al trabajador será preferentemente **Por verificar**.

---

# 5. Inicio

Debe mostrar:

- sede;
- estado de la actualización TumiSoft;
- cobertura quincenal;
- trabajo requerido hoy;
- progreso de categorías;
- pendientes de Stock 0;
- cantidad de grupos por verificar;
- conteos locales pendientes de envío;
- botón `Enviar conteo` cuando existan pendientes.

Debe responder:

1. ¿Puedo contar?
2. ¿Qué falta de la quincena?
3. ¿Qué debo verificar?
4. ¿Cuántos conteos tengo pendientes de enviar?

No debe convertirse en un dashboard administrativo.

---

# 6. Conteo

Ruta:

```text
/cajero/conteo
```

Vistas internas:

```text
Por categoría
Stock 0
Stock negativo
```

Las categorías se eligen libremente por el trabajador.

No se crearán páginas independientes por categoría.

---

# 7. Cobertura quincenal

```text
grupos con al menos un conteo físico base en la quincena
/
grupos aplicables
```

Una categoría está completa cuando todos sus grupos aplicables tuvieron al menos un conteo físico base.

Las diferencias no reducen la cobertura.

---

# 8. Cobertura diaria

```text
Verificados hoy
/
Requeridos hoy
```

No usar el total global de grupos como denominador salvo que todos sean realmente requeridos ese día.

---

# 9. Terminología visible

| Concepto interno | Texto para trabajador |
|---|---|
| stock_teorico | **Stock TumiSoft** |
| stock_fisico | **Conteo** |
| diferencia | **Diferencia** |
| valor_diferencia | **Valorizado** |
| snapshot | **Actualización de stock** |
| seguimiento | **Por verificar** |
| persistente / parcialmente_explicada / movimiento_posterior | No mostrar directamente |

La marca **TumiSoft** debe utilizarse en la interfaz.

---

# 10. Conteo no ciego

Cada fila de conteo base muestra:

```text
Grupo | Stock TumiSoft | Conteo | Diferencia | Valorizado
```

Una vez ingresado un Conteo válido:

```text
Diferencia = Conteo - Stock TumiSoft
```

La valorización puede previsualizarse en frontend, pero el valor devuelto por backend es autoritativo.

---

# 11. Stock físico y Stock TumiSoft negativo

El Conteo nunca puede ser negativo:

```text
Conteo >= 0
```

La vista `Stock negativo` se refiere exclusivamente a grupos cuyo **Stock TumiSoft** es negativo.

---

# 12. Stock 0

`Stock 0` es una vista especial del conteo base.

Permite verificar grupos cuyo Stock TumiSoft es cero aunque exista mercadería físicamente.

El grupo mantiene su categoría real.

---

# 13. Stock negativo

Sirve como acceso operativo a grupos con:

```text
Stock TumiSoft < 0
```

No modifica categoría ni identidad del grupo.

---

# 14. Por verificar

Ruta técnica:

```text
/cajero/seguimiento
```

Texto visible:

```text
Por verificar
```

Incluye grupos que requieren una nueva observación por cambios o diferencias pendientes.

---

# 15. Tabla de Por verificar

Formato:

```text
[Motivo] [Grupo] [Última diferencia] [TumiSoft] [Conteo] [Diferencia actual] [Valorizado]
```

Filas amplias, aproximadamente:

```text
64–72 px
```

---

# 16. Motivos visibles

La UI simplifica los estados internos a:

```text
Verificar diferencia
Reconteo
Cambio de stock
```

No mostrar directamente:

```text
persistente
parcialmente_explicada
movimiento_posterior
conteos_inconsistentes
```

---

# 17. Orden de Por verificar

```text
1. Verificar diferencia
2. Reconteo
3. Cambio de stock
```

Dentro de cada prioridad:

```text
más antiguo primero
```

---

# 18. Última diferencia

Por verificar muestra únicamente la diferencia de la observación origen más reciente relevante.

El backend expone:

```text
ultima_diferencia
```

No se muestra la cronología completa.

---

# 19. Entrada rápida

```text
escribir Conteo
↓
actualizar Diferencia
↓
actualizar Valorizado
↓
Enter
↓
focus al siguiente campo Conteo
```

`Tab` conserva comportamiento normal.

El valor se persiste localmente desde que es válido.

---

# 20. Buffer local

Los conteos pendientes se conservan en:

```text
sessionStorage
```

Cada observación pendiente debe conservar como mínimo:

```text
client_observation_id
conteo_id
grupo_id
stock_fisico
contado_at
tipo_observacion
observacion_origen_id si aplica
datos mínimos para restaurar UI
```

`client_observation_id`:

- se genera una sola vez en frontend;
- debe ser UUID;
- permanece estable en reintentos;
- es la clave de idempotencia backend.

---

# 21. Alcance de sessionStorage

Sirve para:

- navegación interna;
- refresh;
- fallos temporales;
- restauración mientras la pestaña siga activa.

No implementar:

```text
modo offline completo
IndexedDB
SQLite
worker de sincronización
persistencia indefinida
```

Cerrar completamente la pestaña puede eliminar el buffer y se acepta en esta versión.

---

# 22. Guardado por lotes

## Umbral normal

```text
40 observaciones
```

Regla:

```text
al salir de una vista:
    si pendientes >= 40
        enviar todo el buffer
```

Ejemplo:

```text
35 acumulados
+
15 nuevos
=
50

al salir
→ enviar 50
```

## Límite de seguridad

```text
80 observaciones
```

Al alcanzar 80:

```text
enviar inmediatamente
```

---

# 23. Lotes mixtos

Un lote puede mezclar:

- categorías;
- Stock 0;
- Stock negativo;
- conteo base;
- Por verificar;
- reconteos.

El backend valida cada observación individualmente.

---

# 24. Navegación interna

El trabajador puede navegar libremente sin guardar en cada cambio.

Con menos de 40 pendientes:

```text
no enviar solo por cambiar de vista
```

Los datos permanecen en `sessionStorage`.

---

# 25. Header

Cuando existan pendientes:

```text
18 pendientes      [ Enviar conteo ]
```

La sede debe permanecer visible.

---

# 26. Enviar conteo

La acción principal se denomina:

```text
Enviar conteo
```

No `Finalizar conteo`.

Enviar:

- transmite el buffer;
- no significa finalizar quincena;
- no significa terminar la jornada;
- no cierra necesariamente la sesión.

---

# 27. Disparadores de envío

Automáticos:

```text
1. Salir de una vista con >= 40 pendientes
2. Alcanzar 80 pendientes
3. Inactividad de 20 minutos
4. Detectar una nueva actualización TumiSoft
5. Vencer la referencia de stock
```

Manual:

```text
6. Botón Enviar conteo
```

---

# 28. Inactividad

Tiempo:

```text
20 minutos
```

Flujo:

```text
20 min sin interacción
↓
bloquear nuevas entradas
↓
intentar enviar pendientes
↓
si el envío es satisfactorio:
    cerrar la sesión operativa
```

Mensajes sugeridos:

```text
“Conteo enviado. La sesión se cerró por inactividad.”
“Inicia un nuevo conteo para continuar con el stock actualizado.”
```

Si el envío falla:

- no borrar buffer;
- mantener UI bloqueada;
- permitir `Reintentar envío`.

---

# 29. Detección robusta de inactividad

Guardar:

```text
ultima_actividad
```

Al recuperar foco o visibilidad:

```text
hora actual - ultima_actividad
```

Si supera 20 minutos, ejecutar el flujo de inactividad.

No añadir Cron, worker ni polling backend.

---

# 30. Nueva actualización TumiSoft durante el conteo

Una vista usa una referencia fija.

Nunca cambiar silenciosamente los valores de TumiSoft.

Al detectar una actualización más reciente:

```text
bloquear nuevas capturas
conservar existentes
mostrar aviso
```

Mensaje:

```text
“Stock TumiSoft actualizado.
Envía tu conteo para continuar.”
```

Después de enviar satisfactoriamente:

```text
cerrar/inutilizar referencia anterior
↓
iniciar nueva sesión
↓
continuar
```

---

# 31. Detección de actualización sin polling

No implementar polling periódico.

Comprobar frescura en:

- bootstrap;
- entrada a una nueva vista;
- regreso de pestaña a visible;
- recuperación de focus;
- antes de envío manual o automático.

`rpc_solog_state('groups', ...)` devuelve:

```text
snapshot_referencia_id
snapshot_actual_id
stock_actualizado
```

Si:

```text
stock_actualizado = true
```

bloquear nuevas entradas.

El backend además valida `contado_at`, por lo que una actualización ocurrida entre dos verificaciones no puede registrar silenciosamente observaciones posteriores con una referencia antigua.

---

# 32. Referencia vencida

Al vencer:

```text
bloquear nuevas capturas
conservar pendientes
permitir envío
```

No existe periodo de gracia para seguir contando nuevos grupos.

---

# 33. Momento físico vs momento de envío

```text
contado_at
≠
momento de transmisión
```

Ejemplo:

```text
Conteo físico: 10:04
Envío:         10:15
```

La observación pertenece a las 10:04.

---

# 34. Envío tardío

Se permiten observaciones realizadas válidamente durante la sesión aunque se transmitan después.

Condiciones:

1. `contado_at` dentro de la ventana válida.
2. La referencia era vigente en ese momento.
3. No existía una actualización posterior confirmada antes de `contado_at`.
4. El lote puede llegar hasta:

```text
expira_at + 2 horas
```

La ventana sirve para recuperación ante fallos; no habilita nuevos conteos después del vencimiento.

---

# 35. Idempotencia

Backend:

```text
inventario.conteo_detalle.client_observation_id
```

Es UUID, NOT NULL y único.

Si se reenvía la misma observación:

```text
resultado = "ya_guardado"
```

No se duplica.

Frontend puede eliminar del buffer tanto `guardado` como `ya_guardado`.

---

# 36. Error parcial

Cada observación del lote se procesa independientemente.

Posible resultado:

```text
COUNT_BATCH_PARTIAL
```

Ejemplo:

```text
50 enviados
48 guardados
1 ya guardado
1 rechazado
```

Frontend:

- elimina `guardado`;
- elimina `ya_guardado`;
- conserva rechazados;
- marca únicamente los rechazados.

---

# 37. Contrato RPC — save_batch

RPC:

```text
public.rpc_solog_count('save_batch', payload)
```

Payload:

```json
{
  "device_token": "<token>",
  "conteo_id": "<uuid>",
  "items": [
    {
      "client_observation_id": "<uuid>",
      "grupo_id": "<uuid>",
      "stock_fisico": 18,
      "contado_at": "2026-08-26T10:04:00-05:00",
      "tipo_observacion": "auto",
      "observacion_origen_id": null
    }
  ]
}
```

`tipo_observacion` admite:

```text
auto
base
seguimiento
reconteo
```

Uso recomendado:

- normal: `auto`;
- intención explícita: `base` o `seguimiento`;
- reconteo: `reconteo` + `observacion_origen_id`.

---

# 38. Respuesta RPC — save_batch

Campos:

```text
ok
codigo
conteo_id
items
errores
guardados
ya_guardados
rechazados
sesion_expirada
stock_actualizado
requiere_nueva_sesion
server_now
```

Códigos globales:

```text
COUNT_BATCH_SAVED
COUNT_BATCH_PARTIAL
COUNT_BATCH_REJECTED
```

Cada item exitoso incluye:

```text
client_observation_id
resultado
detalle_id
grupo_id
tipo_observacion
stock_teorico
stock_fisico
diferencia
precio
valor_diferencia
estado_diferencia
diferencia_confirmada
contado_at
```

---

# 39. Errores relevantes

Por item:

```text
SOLOG_INVALID_BATCH_ITEM
SOLOG_INVALID_OBSERVATION_TYPE
SOLOG_CLIENT_OBSERVATION_CONFLICT
SOLOG_INVALID_COUNT_TIMESTAMP
SOLOG_STOCK_UPDATED_BEFORE_COUNT
SOLOG_GROUP_NOT_AVAILABLE
SOLOG_GROUP_NOT_IN_CATALOG
SOLOG_GROUP_ALREADY_COVERED
SOLOG_GROUP_NOT_YET_COVERED
SOLOG_GROUP_NOT_REQUIRED
SOLOG_RECOUNT_ORIGIN_REQUIRED
SOLOG_RECOUNT_NOT_AVAILABLE
SOLOG_RECOUNT_ORIGIN_STALE
SOLOG_RECOUNT_NOT_ELIGIBLE
```

Globales:

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_OPERATIONAL_ROLE_REQUIRED
SOLOG_CASHIER_WITHOUT_SEDE
SOLOG_DEVICE_REQUIRED
SOLOG_DEVICE_NOT_AUTHORIZED
SOLOG_INVALID_BATCH_PAYLOAD
SOLOG_BATCH_TOO_LARGE
SOLOG_COUNT_NOT_AVAILABLE
SOLOG_COUNT_NOT_ACTIVE
SOLOG_LATE_BATCH_WINDOW_EXPIRED
SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE
```

---

# 40. Mensajes UX

Sin conexión:

```text
“No se pudo conectar.
Tu conteo sigue guardado en este dispositivo.”
```

Stock actualizado:

```text
“El stock TumiSoft fue actualizado.
Envía los conteos pendientes para continuar.”
```

Dispositivo revocado:

```text
“Este dispositivo ya no está autorizado.”
```

Valor inválido:

```text
“No se pudo registrar este producto.
Revisa el conteo marcado.”
```

Regla:

> Un error de envío nunca borra una observación que todavía no haya sido confirmada por Supabase.

---

# 41. Reintentos

No implementar:

```text
retry loop continuo
polling
worker
cron
```

Ante error:

```text
conservar buffer
↓
mostrar error
↓
[ Reintentar envío ]
```

---

# 42. Historial

Ruta:

```text
/cajero/historial
```

Filtros:

```text
Hoy
Ayer
```

Columnas:

```text
Hora
Grupo
Tipo
TumiSoft
Conteo
Diferencia
Valorizado
```

No mostrar:

- IDs;
- snapshots;
- saldo administrativo quincenal;
- investigación;
- cronología extensa.

---

# 43. Contrato RPC — history

RPC:

```text
public.rpc_solog_count('history', payload)
```

Payload:

```json
{
  "device_token": "<token>",
  "periodo": "hoy"
}
```

Valores:

```text
hoy
ayer
```

Respuesta:

```text
codigo = COUNT_HISTORY
periodo
desde
hasta
items
server_now
```

Cada item contiene:

```text
detalle_id
contado_at
grupo_id
grupo
tipo_observacion
stock_teorico
stock_fisico
diferencia
precio
valor_diferencia
estado_diferencia
```

---

# 44. Valorización

Backend calcula la valorización usando el precio del grupo asociado a la observación.

Frontend puede previsualizarla, pero Supabase es autoritativo.

Es información objetiva y no implica responsabilidad individual automática.

---

# 45. Sesión operativa

`Enviar conteo` no cierra normalmente la sesión.

La sesión se cierra o deja de ser utilizable por:

- inactividad de 20 minutos después de enviar;
- vencimiento;
- actualización de stock que exige nueva referencia;
- logout;
- invalidación backend.

Puede utilizarse:

```text
rpc_solog_count('finish', ...)
```

para cerrar una sesión activa después de enviar pendientes.

---

# 46. Backend de seguimiento

`rpc_solog_state('groups', ...)` para seguimiento expone:

```text
detalle_origen_id
motivo_seguimiento
estado_diferencia
contado_at_original
ultima_diferencia
snapshot_referencia_id
snapshot_actual_id
stock_actualizado
```

---

# 47. Flujo global

```text
Abrir SOLOG
↓
validar usuario + sede + dispositivo
↓
obtener actualización TumiSoft
↓
Inicio
├── cobertura quincenal
├── requeridos hoy
├── progreso por categoría
├── Por verificar
└── pendientes locales
↓
abrir vista
↓
comprobar referencia
↓
registrar Conteos
↓
sessionStorage
↓
navegar libremente
↓
>=40 al salir → enviar
>=80 → enviar inmediatamente
botón Enviar → enviar
inactividad / actualización / vencimiento
→ bloquear y enviar
↓
procesar respuesta por item
↓
limpiar confirmados
conservar rechazados
↓
si requiere nueva sesión
→ iniciar con stock actual
```

---

# 48. Restricciones

No implementar:

- selección de sede;
- multiusuario operativo por sede;
- conteo ciego;
- Conteo negativo;
- suma histórica;
- investigación administrativa;
- atribución automática de responsabilidad;
- administración de dispositivos;
- gestión de incidencias;
- edición de catálogo;
- ajuste POS;
- llamadas Supabase por producto;
- una página por categoría;
- polling constante;
- Realtime nuevo para snapshots;
- worker de sincronización;
- modo offline completo;
- refactors generales ajenos al panel.

---

# 49. Backend ya implementado

Proyecto:

```text
fvtohxvcvsflzmftgfzs
```

Migraciones:

```text
20260826144500 solog_v3_cashier_batch_contract
20260826144603 solog_v3_cashier_followup_context
```

Cambios:

1. `client_observation_id` en `conteo_detalle`, NOT NULL y único.
2. `rpc_solog_count('save_batch')` soporta lotes mixtos, idempotencia, parcialidad, envío tardío y control de actualización.
3. `rpc_solog_count('history')` soporta Hoy/Ayer.
4. `rpc_solog_state('groups')` expone última diferencia y estado de actualización.
5. Se mantiene acceso por RPC y RLS defensivo.

---

# 50. Validaciones backend realizadas

Estado existente:

```text
client_observation_id nulos: 0
observaciones existentes: 482
client_observation_id únicos: 482
```

Casos sintéticos transitorios:

1. Guardado normal → satisfactorio.
2. Reintento con mismo `client_observation_id` → `ya_guardado`, sin duplicación.
3. Lote parcial → 1 válido + 1 inválido → `COUNT_BATCH_PARTIAL`.
4. Envío tardío → observación realizada antes de expirar y enviada después → aceptada dentro de ventana.

Resultado:

```text
synthetic_validation = ok
```

Los datos sintéticos fueron eliminados al finalizar la validación.

---

# 51. Seguridad

`rpc_solog_count`:

- requiere autenticación;
- valida rol cajero;
- valida sede;
- valida dispositivo autorizado;
- no concede ejecución a `anon`.

El helper:

```text
inventario.solog_guardar_lote_cajero_v3
```

no se expone directamente al frontend.

Los avisos generales del Security Advisor incluyen elementos históricos del proyecto PuertoRicoOnline y el patrón intencional de RPC `SECURITY DEFINER` para usuarios autenticados. No se introdujo acceso directo del cajero a tablas de inventario.

---

# 52. Criterios de aceptación

1. Inicio muestra cobertura quincenal y progreso por categoría.
2. El trabajador elige libremente categorías pendientes.
3. Una categoría queda completa con un conteo base por grupo.
4. Diferencias no reducen cobertura.
5. Stock TumiSoft visible.
6. Conteo negativo imposible.
7. Enter salta al siguiente campo.
8. Diferencia y Valorizado se actualizan inmediatamente.
9. Navegación y refresh conservan pendientes.
10. Cambiar de vista con <40 no envía.
11. 35 + 15 = 50 y al salir se envían 50.
12. Al llegar a 80 se envía inmediatamente.
13. Lotes mixtos funcionan.
14. Reintentos no duplican.
15. Error parcial conserva solo rechazados.
16. 20 minutos de inactividad bloquean y disparan intento de envío.
17. Volver de background recalcula inactividad.
18. Stock actualizado bloquea nuevas entradas.
19. Observaciones realizadas antes de la actualización pueden enviarse después.
20. Observaciones realizadas después de una actualización con referencia vieja son rechazadas.
21. Referencia vencida no admite nuevas capturas.
22. Historial ofrece solo Hoy/Ayer.
23. Por verificar muestra última diferencia.
24. No existe polling periódico nuevo.
25. Build, TypeScript, lint y validaciones relevantes quedan limpios.

---

# 53. Fuera de alcance

- rediseño Administración;
- cambios en ConeXion;
- cambios al flujo de snapshots;
- descuentos administrativos;
- investigación de responsables;
- integración automática con TumiSoft;
- edición del POS;
- persistencia offline completa;
- multi-cajero por sede;
- notificaciones push;
- cambios generales de arquitectura.

---

# 54. Regla para Codex

Codex debe:

1. Leer este documento como fuente de verdad.
2. Analizar el repositorio únicamente para ubicar cambios y validar compatibilidad.
3. No rediseñar decisiones cerradas.
4. No modificar Supabase.
5. No crear migraciones, RPCs, Edge Functions, RLS, tablas ni cambios remotos.
6. Documentar cualquier bloqueo backend real antes de continuar.
7. Proponer un plan por fases antes de modificar código.
8. Implementar únicamente el plan aprobado.
9. Evitar refactors generales.

---

# 55. Principio final

> **El trabajador debe concentrarse en contar. SOLOG debe decidir qué necesita verificar, proteger el trabajo todavía no enviado, reducir llamadas a Supabase, impedir continuar con una referencia de stock desactualizada y ocultar la complejidad técnica que no aporta a la operación.**
