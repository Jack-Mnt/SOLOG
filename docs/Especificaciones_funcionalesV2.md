# ConeXion — Especificaciones funcionales
**Versión:** 2.0  
**Fecha:** 2026-08-25  
**Tipo:** herramienta local de importación y sincronización de stock  
**Backend:** Supabase — `PuertoRicoOnline`  
**Estado:** especificación vigente.

---

# 1. Objetivo

ConeXion es la herramienta Windows local que convierte los archivos Excel exportados por el POS en snapshots confiables para Supabase.

No es un sistema de inventario físico.

Responsabilidades:

```text
validar
comparar
detectar
transformar
sincronizar
```

SOLOG consume posteriormente el stock teórico generado.

---

# 2. Ejecutables

```text
ConeXion
→ operativo
→ usuario estándar

ConeXion Admin
→ aprovisionamiento/configuración/diagnóstico
→ UAC
```

---

# 3. Principios

1. Event-driven.
2. Sin polling.
3. Sin proceso residente.
4. Sin servicio Windows permanente.
5. Sin retry automático en background.
6. Si falla el envío, conservar localmente.
7. Reintentar únicamente en un nuevo evento.
8. Catálogo actualizado antes de procesar un nuevo Excel.
9. Bajo consumo de RAM/CPU/red.
10. Procesamiento eficiente incluso en equipos modestos.

---

# 4. Aprovisionamiento

TXT exacto:

```text
Sede: ...
Installation ID: ...
Installation Secret: ...
```

ConeXion Admin:

1. eleva UAC;
2. carga TXT;
3. valida formato;
4. valida credenciales contra `conexion-auth`;
5. confirma sede;
6. protege credenciales mediante DPAPI LocalMachine;
7. instala/valida catálogo;
8. deja operativa la instalación.

No existen tokens temporales.

---

# 5. Catálogo

Estado oficial vigente:

```text
versión: 3
SKU: 972
grupos activos: 482
```

Archivo local:

```text
catalog.prcatalog
```

Formato:

```text
Base64
→ GZIP
→ JSON UTF-8
```

Validaciones:

- schema;
- versión;
- SHA-256;
- estructura.

Conservación local:

```text
catalog.prcatalog
catalog.previous.prcatalog
```

---

# 6. Entrada Excel

Solo:

```text
.xlsx
```

Métodos:

- drag & drop;
- seleccionar archivo.

Columnas obligatorias:

```text
Nombre de Tienda
Nombre de Almacén
Nombre
C. interno
C. barras
Precio venta
Stock
```

La sede del Excel debe coincidir con la instalación.

---

# 7. Código interno

```text
1000–4000
→ auxiliar del POS
→ ignorar silenciosamente

>20000
→ producto inventariable normal

otro valor inválido
→ ignorar producto
→ generar codigo_interno_invalido
```

Código interno duplicado:

- rechazar solo productos afectados;
- generar `codigo_interno_duplicado`;
- no convertir su ausencia en stock cero.

---

# 8. Stock

Válidos:

```text
positivo
cero
negativo
```

Stock inválido:

- ignorar solo SKU afectado;
- generar incidencia;
- conservar valor anterior en backend.

---

# 9. Comparación de catálogo

Campos:

```text
nombre
código de barras
precio
```

Los cambios no modifican el catálogo local.

Se reportan como incidencias/candidatos administrativos.

Producto nuevo:

- conservar stock;
- reportar;
- no incorporar automáticamente.

Producto ausente del POS:

- informar condición de ausencia/eliminación;
- no confundir con stock cero.

---

# 10. Snapshot

Cada importación genera:

```text
snapshot_id UUID
excel_hash SHA-256
capturado_at
version_catalogo
resumen
stock
eliminados
ignorados
incidencias
```

La sede no es confiable desde payload; se deriva de la instalación.

Optimización:

```text
stock != 0 → enviar
stock = 0  → omitir y reconstruir backend
```

---

# 11. Sincronización

Endpoint:

```text
conexion-sync
```

Una sola solicitud.

Backend:

```text
validar instalación
→ validar catálogo
→ idempotencia
→ crear snapshot
→ reconstruir ceros
→ proteger ignorados
→ eliminados
→ UPSERT stock_actual
→ snapshot_stock
→ incidencias
→ confirmar
```

Atomicidad completa.

---

# 12. Offline

Si falla el envío:

```text
guardar snapshot en SQLite
→ Pendiente
```

No reintentar en background.

Próximo intento:

- al abrir ConeXion;
- al intentar una nueva carga.

Pendientes se envían en orden cronológico.

---

# 13. UI operativa

Pantalla principal:

- nombre ConeXion;
- sede;
- conexión;
- versión app;
- versión catálogo;
- estado catálogo;
- `Stock actualizado hace X`;
- advertencia >2 h;
- pendientes de sincronización;
- drag/drop;
- seleccionar archivo;
- historial;
- incidencias.

Estados:

```text
Validando
Comparando catálogo
Preparando snapshot
Enviando
Completado
```

---

# 14. Incidencias visibles en ConeXion

ConeXion puede mostrar incidencias detectadas, pero no permite:

- aprobar;
- ignorar;
- editar;
- modificar catálogo.

La administración se realiza en SOLOG web.

---

# 15. Relación con SOLOG

ConeXion mantiene:

```text
snapshots
snapshot_stock
stock_actual
incidencias
```

SOLOG utiliza esos datos para:

```text
conteos
diferencias
seguimiento
administración
```

ConeXion no debe implementar:

- sesiones de conteo;
- cobertura quincenal/diaria;
- reconteos;
- saldo operativo de diferencias;
- atribución de responsabilidad.

---

# 16. Funciones fuera del alcance de ConeXion

- editar stock;
- editar catálogo;
- usuarios de trabajadores;
- inventario físico;
- dashboard empresarial;
- administración de grupos;
- aprobación de cambios;
- integración directa con POS;
- monitoreo permanente;
- polling;
- servicios Windows.

---

# 17. Estructura local

Ruta conceptual:

```text
C:\ProgramData\PuertoRico\ConeXion\
```

Archivos:

```text
config.dat
credentials.dat
catalog.prcatalog
catalog.previous.prcatalog
conexion.db
logs\
```

---

# 18. Logs

Registrar:

- inicio/cierre;
- versión;
- catálogo;
- errores;
- validaciones;
- respuestas backend;
- excepciones.

Nunca secrets.

Rotación:

```text
máx. 10 archivos
~5 MB por archivo
```

---

# 19. Prioridad técnica

```text
correctitud
integridad
eficiencia
simplicidad
bajo consumo
```
