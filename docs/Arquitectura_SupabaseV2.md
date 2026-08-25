# ConeXion + SOLOG — Arquitectura Supabase
**Versión:** 2.0  
**Fecha:** 2026-08-25  
**Backend:** Supabase — `PuertoRicoOnline`  
**Project ID:** `fvtohxvcvsflzmftgfzs`  
**Estado:** arquitectura vigente y desplegada.

---

## 1. Objetivo

Definir la arquitectura backend actual del ecosistema de inventario:

```text
POS
↓
ConeXion
↓
Supabase / inventario
↓
SOLOG
```

Se priorizan:

- pocas llamadas de red;
- SQL set-based;
- transacciones atómicas;
- separación de responsabilidades;
- mínimo consumo;
- ausencia de polling/servicios permanentes innecesarios.

---

# 2. Responsabilidades

## ConeXion

```text
Excel POS
→ validar
→ comparar catálogo
→ detectar incidencias
→ construir snapshot
→ sincronizar
```

## Supabase

```text
autenticación instalaciones
catálogo/versiones
snapshots
stock_actual
incidencias
conteos
catálogo administrativo
grupos
auditoría
```

## SOLOG

```text
leer stock teórico
→ conteo físico
→ evaluar diferencias
→ seguimiento quincenal/diario
→ administración
```

SOLOG nunca mantiene `stock_actual`.

---

# 3. Arquitectura de ConeXion

```text
ConeXion
   │
   ├── conexion-auth
   │       ↓
   │   rpc_conexion_auth_state
   │
   ├── conexion-sync
   │       ↓
   │   rpc_conexion_sync_snapshot
   │
   └── conexion-admin
           ↓
       rpc_conexion_admin
```

Edge Functions finales:

```text
conexion-auth
conexion-sync
conexion-admin
```

---

# 4. Arquitectura de SOLOG

Frontend web autenticado:

```text
SOLOG
  │
  ├── rpc_solog_state
  ├── rpc_solog_count
  ├── rpc_solog_admin
  └── rpc_solog_dashboard
```

El frontend no accede directamente al schema `inventario`.

Toda interacción operativa relevante se concentra en RPC.

---

# 5. Catálogo vigente

Versión oficial:

```text
V3
```

Estado actual:

```text
972 SKU
482 grupos activos
```

Formato:

```text
JSON UTF-8
→ GZIP
→ Base64
→ .prcatalog
```

Bucket:

```text
conexion-catalogos
```

privado.

---

# 6. Stock y snapshots

## `stock_actual`

```text
sede_id + c_interno
```

es la fuente de verdad teórica vigente.

## `snapshots`

Cabecera permanente.

## `snapshot_stock`

Detalle reciente con retención de 48 horas.

El detalle reciente permite:

- diagnóstico;
- evaluación de cambios;
- detección de primer snapshot posterior;
- soporte de vistas operativas.

No se persiste stock agrupado.

---

# 7. Grupos

```text
catalogo
JOIN grupos_conteo
JOIN stock_actual
```

SOLOG agrega stock por grupo bajo demanda.

Invariantes:

```text
Excluido → sin grupo
Único    → grupo unitario real
Agrupado → grupo con >=2 SKU
```

Misma categoría y mismo precio dentro de cada grupo.

---

# 8. Incidencias

Tipos operativos del módulo SOLOG:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

Acciones:

```text
producto_ausente:
  ignore_15d
  deleted

otros:
  reviewed
```

La supresión de 15 días es global por producto/tipo y se representa con `sede_id = NULL`.

---

# 9. Administración de catálogo y grupos

`rpc_solog_admin` enruta acciones hacia funciones internas especializadas.

Acciones actuales relevantes:

```text
incidents
incident_action
catalog_reference

catalog_changes
catalog_change_action
catalog_publication_preview

groups
group_products
group_change_save
```

Los cambios estructurales se guardan como propuestas.

Nunca modifican inmediatamente el catálogo publicado.

---

# 10. Proyección y publicación

Arquitectura:

```text
catálogo actual
+
cambios aprobados
↓
proyección transaccional temporal
↓
validación integral
↓
conflictos estructurados
```

No existen:

- tabla de conflictos;
- tabla de draft;
- worker de publicación;
- publicación parcial silenciosa.

`conexion-admin` realiza:

```text
prepare
→ JSON exacto
→ GZIP
→ Base64
→ SHA-256
→ Storage
→ commit
```

El commit reaplica la validación exacta del conjunto aprobado.

---

# 11. Conteos SOLOG

Modelo vigente:

```text
una sesión general activa por sede
```

La sesión fija un snapshot de referencia y permite recorrer categorías/vistas.

Actualmente se persisten:

- conteo;
- detalle por grupo;
- teórico congelado;
- físico;
- diferencia;
- primer snapshot posterior;
- reconteo.

---

# 12. Nueva arquitectura temporal de conteo

La lógica funcional aprobada a implementar se basa en dos escalas.

## Ciclo corto

```text
S0 → F0 → S1
```

- `S0`: snapshot anterior al conteo;
- `F0`: observación física;
- `S1`: primer snapshot posterior.

La observación se evalúa una sola vez contra `S1`.

## Ciclo largo

```text
observación
→ movimientos
→ nueva observación
→ movimientos
→ nueva observación
→ ...
```

Puede repetirse indefinidamente.

---

# 13. Periodo quincenal

SOLOG usa la quincena completa como ventana operativa.

No intenta detectar un ajuste manual del POS.

La quincena mantiene:

- cobertura base de todos los grupos;
- cola diaria selectiva;
- histórico de observaciones;
- saldo operativo vigente por grupo.

---

# 14. Diferencias

Cada diferencia:

```text
D = stock_fisico - stock_teorico
```

es una observación puntual.

Nunca se acumulan diferencias históricas.

Saldo operativo:

```text
última diferencia confirmada vigente
```

Una nueva observación confirmada puede sustituir:

```text
-3 → 0
```

sin necesidad de conocer si existió un ajuste del POS entre ambos momentos.

---

# 15. Cobertura

## Quincenal

```text
grupos distintos con conteo base
/
grupos aplicables
```

## Diaria

Nueva semántica:

```text
grupos verificados hoy
/
grupos requeridos hoy
```

La cobertura diaria ya no representa `contados hoy / todos los grupos`.

---

# 16. Seguridad

### ConeXion

- credenciales permanentes por instalación;
- DPAPI LocalMachine;
- sede derivada del `installation_id`;
- sin acceso directo a tablas/Storage.

### SOLOG

- autenticación de usuarios existente;
- restricciones por sede/rol;
- dispositivo autorizado;
- RPC como frontera de acceso;
- ninguna escritura administrativa directa sobre tablas del schema `inventario`.

---

# 17. Procesos recurrentes

Solo mantenimiento necesario:

```text
cleanup_snapshot_stock
```

No usar:

- polling de conteos;
- Cron frecuente para estados;
- workers de seguimiento;
- cachés persistentes de stock agrupado.

La evaluación puede producirse de forma event-driven o bajo demanda mediante las RPC vigentes/evolucionadas.

---

# 18. Regla de evolución

Antes de añadir arquitectura:

```text
¿puede resolverse en RPC/tabla/componente existente
sin perjudicar seguridad, atomicidad o claridad?
```

Si sí:

```text
integrar
```

Si no:

```text
justificar nueva pieza
```
