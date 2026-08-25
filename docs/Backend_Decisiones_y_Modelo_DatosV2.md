# ConeXion + SOLOG — Backend: decisiones y modelo de datos
**Versión:** 2.0  
**Fecha:** 2026-08-25  
**Supabase:** `PuertoRicoOnline`  
**Project ID:** `fvtohxvcvsflzmftgfzs`  
**Schema principal:** `inventario`  
**Estado:** backend operativo; catálogo oficial V3; modelo de conteos V2 y administración de catálogo/grupos implementados.

---

## 1. Alcance

Este documento describe el estado vigente del backend compartido por:

- **ConeXion**: ingestión de Excel del POS, snapshots, stock teórico e incidencias.
- **SOLOG**: conteo físico, evaluación de diferencias, administración de catálogo, grupos y dispositivos.

SOLOG no reemplaza a ConeXion y ConeXion no realiza conteo físico.

```text
POS → Excel → ConeXion → snapshots → stock_actual
                                  ↓
                                SOLOG
                         conteos + diferencias
```

---

## 2. Principios de arquitectura

1. Supabase administrado, sin VPS propio.
2. Backend orientado a eventos.
3. Sin polling continuo, workers permanentes ni loops de retry de servidor.
4. SQL set-based para procesamiento masivo.
5. Operaciones críticas atómicas.
6. Mínimo número coherente de RPC/Edge Functions.
7. ConeXion nunca recibe `service_role`.
8. SOLOG web usa autenticación de usuarios y RPC públicas controladas.
9. No duplicar `stock_actual` por grupo: la agrupación se calcula mediante joins.
10. Antes de agregar tablas, RPC, triggers o Cron se debe justificar seguridad, atomicidad, rendimiento o mantenibilidad.

---

## 3. Componentes principales vigentes

### Edge Functions ConeXion

```text
conexion-auth
conexion-sync
conexion-admin
```

### RPC públicas principales

```text
rpc_conexion_auth_state
rpc_conexion_sync_snapshot
rpc_conexion_admin

rpc_solog_state
rpc_solog_count
rpc_solog_admin
rpc_solog_dashboard
```

### Mantenimiento

```text
inventario.cleanup_snapshot_stock()
```

Cron:

```text
cleanup_snapshot_stock
→ 1 vez al día
→ elimina snapshot_stock con antigüedad > 48 h
```

Triggers personalizados:

```text
0
```

Bucket privado:

```text
conexion-catalogos
```

---

## 4. Schema `inventario`

Tablas vigentes relevantes:

```text
inventario
├── instalaciones
├── versiones_catalogo
├── categorias
├── grupos_conteo
├── catalogo
├── catalogo_version_skus
├── snapshots
├── snapshot_stock
├── stock_actual
├── incidencias
├── exclusiones_incidencias
├── cambios_catalogo
├── conteos
├── conteo_detalle
├── dispositivos_solog
├── auditoria
└── cambios_catalogo
```

Tabla común:

```text
public.sedes
```

---

# 5. ConeXion

## 5.1 Instalaciones

Una instalación permanente por sede.

Credenciales:

```text
installation_id
installation_secret
```

Supabase almacena únicamente:

```text
secret_hash
```

Sedes operativas:

- Casuarinas
- Cutervo
- Divino
- Huaca
- Unidad

Aprovisionamiento:

```text
TXT de sede
↓
ConeXion Admin
↓
conexion-auth
↓
validación de instalación/sede
↓
DPAPI LocalMachine
↓
catálogo oficial
```

No existen tokens temporales de aprovisionamiento.

---

## 5.2 Catálogo oficial

Estado vigente al 2026-08-25:

```text
versión oficial: 3
productos/SKU: 972
grupos activos: 482
```

Formato:

```text
JSON UTF-8
→ GZIP
→ Base64
→ catalog_vN.prcatalog
```

El catálogo es versionado y se distribuye desde el bucket privado `conexion-catalogos`.

Las cifras antiguas de V2 (`968 SKU`, `481/482 grupos según etapa`) son históricas y no deben usarse como estado vigente.

---

## 5.3 Reglas de grupos

```text
Excluido
→ grupo_conteo_id = NULL

Único
→ grupo unitario real con exactamente 1 SKU

Agrupado
→ grupo real con 2 o más SKU
```

Invariantes:

- todos los SKU de un grupo comparten categoría;
- todos los SKU de un grupo comparten precio;
- los grupos unitarios representan productos `Único`;
- los grupos vacíos pueden desactivarse al publicar una nueva versión.

---

## 5.4 `stock_actual`

Fuente de verdad teórica vigente por sede/SKU:

```text
PRIMARY KEY (sede_id, c_interno)
```

Stock negativo es válido.

No existe FK obligatoria `c_interno → catalogo`, para permitir conservar stock de productos nuevos antes de su incorporación al catálogo.

SOLOG agrega a nivel de grupo dinámicamente mediante joins.

---

## 5.5 Snapshots

Cabecera permanente:

```text
inventario.snapshots
```

Detalle reciente:

```text
inventario.snapshot_stock
```

Retención del detalle:

```text
48 horas
```

Idempotencia:

```text
snapshot_id
UNIQUE(instalacion_id, excel_hash)
```

Reconstrucción:

```text
SKU recibido          → usar stock enviado
SKU normal ausente    → stock = 0
SKU ignorado          → conservar valor anterior
SKU eliminado         → producto_eliminado = true
```

---

## 5.6 Códigos internos

Regla local antes del envío:

```text
1000 <= C. interno <= 4000
→ ignorar silenciosamente
→ no payload
→ no incidencia

C. interno > 20000
→ inventariable normal

resto inválido
→ ignorar SKU + incidencia codigo_interno_invalido
```

---

# 6. Incidencias vigentes

SOLOG administra únicamente estos tipos operativos:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

## 6.1 Acciones

### `producto_ausente`

```text
Ignorar 15 días
→ action = ignore_15d

Eliminar
→ action = deleted
```

`Eliminar` significa:

> el administrador confirma que el producto fue eliminado del POS.

No elimina inmediatamente el producto del catálogo.

Genera una propuesta:

```text
eliminar_producto
```

para la siguiente publicación.

### Otros tres tipos

```text
Revisado
→ action = reviewed
```

---

## 6.2 Supresión de 15 días

La supresión es global por:

```text
c_interno + tipo
```

Se implementa con:

```text
inventario.exclusiones_incidencias
sede_id = NULL
```

No requiere Cron: la expiración deja de coincidir naturalmente.

---

# 7. Catálogo administrativo

Tabla:

```text
inventario.cambios_catalogo
```

Ámbitos:

```text
producto
grupo
```

Estados:

```text
pendiente
aprobado
ignorado
incorporado
```

Acciones:

```text
approve
ignore
withdraw
```

`withdraw`:

```text
aprobado → pendiente
```

---

## 7.1 Tipos de cambio

Producto:

```text
agregar_producto
eliminar_producto
nombre
precio
codigo
clasificacion_producto
```

Grupo:

```text
definicion_grupo
```

---

## 7.2 Administración de grupos

El backend soporta:

```text
groups
group_products
group_change_save
```

Las modificaciones no alteran inmediatamente el catálogo publicado.

Crean propuestas estructurales para la próxima versión.

Clasificaciones:

```text
Único
Agrupado
Excluido
```

Para una propuesta `Único`, el usuario no selecciona grupo. El backend reserva o reutiliza internamente un grupo unitario real para la publicación.

---

## 7.3 Publicación

Flujo:

```text
cambios aprobados de producto
+
cambios aprobados de grupo
↓
catalog_publication_preview
↓
proyección del estado futuro completo
↓
validación
├─ conflictos → bloquear publicación
└─ sin conflictos → publish_catalog
```

No existe publicación parcial silenciosa.

Invariante:

```text
applied + blocked = approved
```

y solo se publica cuando:

```text
blocked = 0
```

Conflictos son derivados dinámicamente; no existe tabla persistida de conflictos ni borrador de publicación.

---

# 8. SOLOG — conteos V2 actuales

Tablas:

```text
inventario.conteos
inventario.conteo_detalle
```

Modelo actual de `conteos`:

```text
id
sede_id
usuario_id
snapshot_referencia_id
estado
iniciado_at
expira_at
finalizado_at
created_at
updated_at
```

Estados de sesión:

```text
activo
finalizado
expirado
```

Una sesión general activa por sede.

Vigencia operativa de la referencia:

```text
expira_at = snapshot.confirmado_at + 2 horas
```

---

## 8.1 `conteo_detalle`

Campos actuales:

```text
id
conteo_id
grupo_conteo_id
stock_teorico
stock_fisico
diferencia
precio
valor_diferencia
contado_at
estado_diferencia
snapshot_posterior_id
stock_posterior
reconteo_stock
recontado_at
created_at
updated_at
```

La siguiente evolución funcional deberá preservar la historia y adaptar este modelo a la nueva lógica operacional documentada en `SOLOG_Logica_Operacional_Conteos_V1.md`.

---

# 9. Nueva lógica operacional aprobada

A partir de 2026-08-25, la lógica vigente de negocio es:

```text
Periodo operativo = quincena completa
```

El conteo quincenal establece una base física completa.

Los conteos diarios son selectivos y se generan cuando:

- cambió el stock teórico desde la última observación física relevante;
- existe una diferencia por seguir;
- existe reconteo/verificación pendiente.

Cada observación se evalúa con:

```text
snapshot anterior
+
conteo físico
+
primer snapshot posterior
```

No se compara indefinidamente un conteo antiguo contra múltiples snapshots.

Las observaciones sí pueden repetirse indefinidamente a lo largo de la quincena.

---

# 10. Diferencias históricas y saldo operativo

Regla fundamental:

> Las diferencias históricas son observaciones, no saldos acumulables.

Ejemplo:

```text
-2 → -2 → -3 → 0 → -1
```

No se suman.

El saldo operativo vigente del grupo es siempre:

```text
última diferencia confirmada vigente
```

Un ajuste manual del POS a mitad de quincena no necesita ser detectado por SOLOG. La siguiente observación confirmada sustituye naturalmente el saldo vigente.

---

# 11. Seguridad

ConeXion:

- nunca recibe `service_role`;
- no accede directamente a tablas;
- no accede directamente a Storage;
- la sede deriva de la instalación autenticada.

SOLOG:

- reutiliza usuarios existentes;
- aplica permisos por rol;
- cajeros limitados a su sede;
- dispositivo autorizado requerido para conteo;
- acceso a inventario mediante RPC seguras;
- operaciones administrativas reservadas a roles autorizados.

---

# 12. Regla de evolución

Prioridad:

```text
correctitud
↓
integridad
↓
eficiencia
↓
simplicidad
↓
mínimo consumo de recursos
```

Antes de crear un nuevo componente backend, comprobar si puede integrarse limpiamente en la arquitectura vigente.
