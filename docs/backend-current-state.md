# Estado actual del backend de SOLOG

Documento sincronizado el 20 de agosto de 2026 con [SOLOG_Contrato_Tecnico_Backend_V2.md](./SOLOG_Contrato_Tecnico_Backend_V2.md). El contrato V2 es deliberadamente incompatible con V1. Esta actualización no ejecutó escrituras de producción, DDL, migraciones ni cambios de configuración en Supabase.

## Resumen

SOLOG opera sobre Supabase Auth y tres RPC públicas:

```text
public.rpc_solog_state
public.rpc_solog_count
public.rpc_solog_admin
```

El schema `inventario` sigue siendo privado para el frontend. PostgreSQL resuelve rol, sede, dispositivo, elegibilidad, snapshot, stock teórico, coberturas y diferencias. ConeXion continúa publicando y confirmando los snapshots; SOLOG no escribe `stock_actual`.

## Modelo V2

- Existe una sesión general activa por sede, no una sesión por categoría o vista.
- La sesión no contiene `tipo` ni `categoria_id`.
- Sus estados son `activo`, `finalizado` y `expirado`.
- La ventana operativa se deriva del último snapshot/Excel confirmado y su `expira_at`.
- La cobertura diaria y la cobertura quincenal son independientes del cierre de una sesión.
- Mientras la cobertura quincenal esté incompleta, el conteo principal permite Categorías y Stock 0. Las vistas inteligentes quedan bloqueadas.
- El backend filtra los grupos ya cubiertos en la quincena para Categorías y Stock 0.

## Escrituras operativas

`rpc_solog_count/start` recibe solo el token de tablet y abre la sesión general. Las capturas regulares se registran localmente con su hora física compensada por `server_now` y se transmiten mediante `save_batch` en paquetes transaccionales de hasta 500 items. El backend devuelve los valores derivados y solo entonces la cola local elimina los items confirmados.

`finish` se ejecuta únicamente después de vaciar la cola. Devuelve `estado = finalizado`; no existen cierres `parcial` o `completado` en V2.

Contar detalladamente usa la misma sesión general. Cada observación original se identifica mediante `detalle_id` y `recount` recibe además `stock_fisico` y `contado_at`. No usa `conteo_origen_id` ni `grupo_id` como identidad del reconteo.

## Seguridad y dispositivos

- `inventario.dispositivos_solog` sigue respaldando autorización, revocación y reemplazo de tablets.
- El token local mantiene 32 bytes aleatorios, persistidos bajo `solog.device_token.v1`; no usa fingerprinting.
- El backend deriva el usuario con `auth.uid()` y resuelve rol/sede; el frontend no duplica esos datos desde JWT.
- No existen accesos directos del cliente a tablas `inventario`.

## Motor de diferencias y ConeXion

El backend conserva los estados `coincide`, `pendiente`, `probablemente_explicada`, `parcialmente_explicada`, `persistente`, `confirmada_reconteo` y `conteos_inconsistentes`. Calcula stock teórico, diferencia, precio y valor al confirmar un batch. Los snapshots posteriores de ConeXion alimentan la evaluación automática; el frontend no ejecuta ese motor.

## Frontend sincronizado

El repositorio implementa:

- recuperación y escucha de Supabase Auth;
- routing por rol y autorización, permitiendo Home y vistas durante una sesión activa;
- Home con vigencia del Excel, cobertura quincenal principal y cobertura diaria secundaria;
- sesión general y navegación entre vistas mediante `/count` con parámetros transitorios;
- cola local V2 asociada estrictamente a `conteo_id`, restaurable tras recarga y con advertencia para sesiones obsoletas;
- captura de `contado_at` con offset servidor;
- `save_batch`, fragmentación determinística a 500, reintento seguro y conservación total ante error de un batch;
- temporizador local y avisos únicos de 15, 10 y 5 minutos;
- bloqueo de capturas al vencer e intento final de transmisión;
- `finish` solo tras vaciar pendientes;
- reconteo individual por `detalle_id`;
- administración con cobertura quincenal/diaria, sesión general, tablets y reportes V2.

No se detectó una necesidad backend adicional para continuar.
