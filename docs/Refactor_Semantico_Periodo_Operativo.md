# SOLOG — Refactor Semántico de Quincena a Período Operativo

**Estado:** Congelado para implementación  
**Tipo de cambio:** Semántico / contractual  
**Cambio funcional de frecuencia:** NO  
**Frecuencia vigente durante este refactor:** días 1–15 y 16–fin de mes

## 1. Objetivo

Generalizar la terminología del motor SOLOG para que la cobertura principal deje de estar acoplada conceptualmente a una quincena.

El motor continuará funcionando exactamente con los mismos límites temporales actuales:

- Período A: día 1 al 15.
- Período B: día 16 al último día del mes.

Este trabajo NO cambia frecuencia, cobertura, inauguración, estados operativos, estados de diferencia, Conteo Diario, Revisar, snapshots, reconteos, exportación ni cálculo de diferencias.

## 2. Terminología congelada

### Backend / identificadores técnicos

| Actual | Nuevo |
|---|---|
| `solog_quincena_desde` | `solog_periodo_desde` |
| `solog_quincena_hasta` | `solog_periodo_hasta` |
| `cobertura_quincenal` | `cobertura_periodo` |
| `grupos_pendientes_quincena` | `grupos_pendientes_periodo` |
| JSON `quincenal` dentro de cobertura | JSON `periodo` |
| `quincena_desde` | `periodo_desde` |
| `quincena_hasta` | `periodo_hasta` |
| `fase_operativa = cobertura_quincenal` | `fase_operativa = cobertura_periodo` |

### Frontend / UI

| Actual | Nuevo |
|---|---|
| Cobertura quincenal | Cobertura del período |
| Conteo quincenal | Conteo del período |
| Pendientes de quincena | Pendientes del período |
| Quincena actual | Período actual |
| Quincena pasada | Período anterior |

Cuando se muestren fechas, preferir `Período: DD MMM – DD MMM` en vez de asumir una duración fija desde el texto.

## 3. Modelo de datos

`inventario.estado_stock_grupo.cobertura_quincenal` pasa a `cobertura_periodo`.

`cobertura_periodo_desde` ya es genérico y permanece sin cambios.

No se crea configuración de frecuencia en este refactor.

## 4. Lógica temporal

Crear:

- `inventario.solog_periodo_desde(p_at timestamptz)`
- `inventario.solog_periodo_hasta(p_at timestamptz)`

Deben conservar exactamente la lógica actual:

```text
día 1–15   → desde día 1, hasta día 15
día 16–fin → desde día 16, hasta último día del mes
```

No introducir semanas, períodos de 5 días, duración configurable, tabla de configuración, parámetros nuevos, cron ni feature flags.

## 5. Contratos RPC

### `rpc_solog_state`

- `cobertura_quincenal` → `cobertura_periodo`
- `grupos_pendientes_quincena` → `grupos_pendientes_periodo`
- `cobertura_quincenal_completa` → `cobertura_periodo_completa`
- `fase_operativa: cobertura_quincenal` → `fase_operativa: cobertura_periodo`

### `rpc_solog_count`

En `finish`:

- `cobertura_quincenal` → `cobertura_periodo`

Start/save/recount no cambian funcionalmente.

### `rpc_solog_dashboard`

- KPI `cobertura_quincenal` → `cobertura_periodo`
- Por sede `cobertura_quincenal` → `cobertura_periodo`
- `periodo.quincena_desde` → `periodo.periodo_desde`
- `periodo.quincena_hasta` → `periodo.periodo_hasta`

No cambiar valores ni fórmulas.

### Otras RPC

Renombrar únicamente referencias semánticas directas a quincena. No modificar contratos no relacionados.

## 6. Estrategia de compatibilidad

### Etapa A — Backend compatible

1. Crear `solog_periodo_desde/hasta`.
2. Actualizar internamente el motor para usar helpers genéricos.
3. Introducir claves RPC nuevas con `periodo`.
4. Mantener temporalmente aliases `quincenal` solo cuando sean necesarios para no romper el frontend vigente.
5. No cambiar comportamiento.

### Etapa B — Frontend

Adaptar tipos, contratos, labels y UI para consumir exclusivamente nombres `periodo`.

No implementar lógica dual en frontend.

### Etapa C — Limpieza backend

Cuando el frontend ya use `periodo`:

- eliminar aliases RPC `quincenal`;
- eliminar `solog_quincena_desde/hasta`;
- confirmar que no queden consumidores;
- dejar únicamente nomenclatura genérica.

La columna final queda como `cobertura_periodo`.

## 7. Elementos que NO cambian

- `Contado`
- `Cambio_reciente`
- `Coincide`
- `Recontar`
- `Confirmada`
- `Inconsistente`
- primer snapshot posterior
- snapshot de reconteo
- reglas de reconteo
- buffer V4
- recuperación de sesión expirada
- Conteo Diario
- Revisar
- Historial
- Control
- Exportación
- ConeXion
- ingestión de snapshots

## 8. Criterios de aceptación

1. 1–15 / 16–fin produce exactamente los mismos límites que antes.
2. No cambian resultados de cobertura.
3. No cambian colas de Conteo, Diario o Revisar.
4. No cambian diferencias ni reconteos.
5. Frontend consume únicamente contratos `periodo`.
6. Backend final no necesita aliases `quincenal`.
7. `estado_stock_grupo` usa `cobertura_periodo`.
8. No quedan usos funcionales de `quincena/quincenal`, salvo documentación histórica.
9. TypeScript, build, lint y tests pasan.
10. Las RPC mantienen los mismos valores y solo cambia la semántica nominal.

## 9. Fuera de alcance

No se decide todavía si el período futuro será semanal, cada 5 días, configurable, mensual o personalizado.

## 10. Estado congelado

**Cambio aprobado:** `quincena/quincenal` → `periodo/período`.

**Duración funcional:** sin cambios.

**Regla temporal:** 1–15 / 16–fin de mes.

**Objetivo:** desacoplar el motor de una duración específica para facilitar un cambio futuro de frecuencia.
