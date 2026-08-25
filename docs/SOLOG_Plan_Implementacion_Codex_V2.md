# SOLOG — Plan de implementación para Codex
**Versión:** 2.0  
**Fecha:** 2026-08-25  
**Estado:** plan actualizado; reemplaza `SOLOG_Plan_Implementacion_Codex_V1`.

---

# 1. Objetivo

Evolucionar SOLOG desde el modelo actual hacia la lógica operacional quincenal/diaria aprobada, preservando los módulos ya implementados.

Prioridad:

```text
correctitud
integridad
seguridad
simplicidad
eficiencia
mantenibilidad
```

Codex implementa frontend/aplicación.

Los cambios remotos de Supabase son responsabilidad de ChatGPT.

Codex no debe modificar:

- DDL;
- RLS;
- RPC;
- Edge Functions;
- Storage;
- Auth;
- triggers;
- Cron.

Si necesita backend nuevo debe documentarlo en:

```text
docs/supabase-required-changes.md
```

---

# 2. Estado actual que debe preservarse

Frontend:

- React 19 + Vite + TypeScript;
- panel cajero;
- panel administración;
- dispositivos;
- dashboard;
- Control;
- Ajuste POS;
- Incidencias;
- Catálogo;
- Grupos.

Backend:

- Conteos V2;
- administración de incidencias;
- catálogo V3;
- propuestas de grupos;
- publicación con validación global.

---

# 3. Nueva lógica objetivo

Periodo:

```text
quincena completa
```

Conteo quincenal:

```text
todos los grupos aplicables deben tener conteo base
```

Conteo diario:

```text
solo grupos requeridos por cambio o seguimiento
```

Unidad de evaluación:

```text
snapshot anterior
+
conteo físico
+
primer snapshot posterior
```

Histórico:

```text
observaciones independientes
```

Saldo:

```text
última diferencia confirmada vigente
```

---

# 4. Fase 0 — inspección

Antes de modificar:

1. revisar panel cajero actual;
2. revisar hooks/API/tipos;
3. revisar `rpc_solog_state`;
4. revisar `rpc_solog_count`;
5. revisar tablas/contratos documentados;
6. identificar qué lógica existente contradice el nuevo modelo;
7. documentar backend necesario antes de programar UI que dependa de él.

---

# 5. Fase 1 — contrato funcional de estados

Definir explícitamente en frontend/domain:

```text
Coincide
Pendiente
Probablemente explicada
Parcialmente explicada
Persistente
Confirmada por reconteo
Conteos inconsistentes
```

y separar:

```text
estado de última observación
```

de:

```text
requiere nueva verificación
```

No inferir que un grupo `Coincide` histórico sigue vigente si el teórico cambió.

---

# 6. Fase 2 — cobertura quincenal

Actualizar panel cajero para que la cobertura quincenal represente:

```text
grupos distintos con conteo base
/
grupos aplicables
```

Mostrar:

- contados;
- pendientes;
- porcentaje.

Un grupo contado con diferencia cuenta como cubierto.

Reconteos no aumentan cobertura.

---

# 7. Fase 3 — cola diaria

Reemplazar conceptualmente:

```text
contados hoy / todos
```

por:

```text
verificados hoy / requeridos hoy
```

La cola diaria debe incluir:

- teórico cambió desde última observación relevante;
- diferencia por seguir;
- reconteo;
- verificación pendiente.

No mostrar como requeridos grupos sin cambios ni seguimiento.

---

# 8. Fase 4 — conteo base

Para cada grupo:

```text
T0 = teórico
F0 = físico
D0 = F0 - T0
```

Resultado inicial:

```text
D0 = 0  → Coincide
D0 != 0 → Pendiente
```

Congelar los datos históricos del conteo.

---

# 9. Fase 5 — primer snapshot posterior

La lógica debe localizar exclusivamente:

```text
primer snapshot posterior a contado_at
```

No encadenar el mismo conteo contra snapshots siguientes.

Clasificar:

```text
T1 = F0
→ Probablemente explicada

distancia menor
→ Parcialmente explicada

T1 = T0 y diferencia sigue
→ Persistente

movimiento posterior invalida comparación
→ requiere nueva observación
```

La validación autoritativa debe quedar en backend.

---

# 10. Fase 6 — reconteo como nueva observación

El reconteo debe usar:

```text
Tn vigente
Fn físico
Dn = Fn - Tn
```

No asumir que basta `Fn == F0`.

La UI debe mostrar claramente:

- observación anterior;
- teórico vigente;
- nuevo físico;
- nueva diferencia.

---

# 11. Fase 7 — saldo operativo

El frontend debe consumir/mostrar:

```text
última diferencia confirmada vigente
```

Nunca sumar diferencias históricas.

Ejemplo permitido:

```text
Histórico:
-2 → -3 → 0 → -1

Saldo vigente:
-1
```

---

# 12. Fase 8 — histórico

Administración debe conservar una cronología por grupo:

```text
fecha/hora
teórico
físico
diferencia
estado
snapshot
usuario
reconteo/observación posterior
```

Opcionalmente mostrar variación respecto a la observación confirmada anterior, pero siempre como información, no como saldo.

---

# 13. Fase 9 — Ajuste POS

El módulo debe trabajar con:

```text
última diferencia confirmada vigente
```

No con suma histórica.

No detectar automáticamente ajuste POS.

Si una observación posterior queda en cero, ese cero pasa a ser el saldo vigente.

---

# 14. Fase 10 — dashboard/Control

Actualizar métricas para distinguir:

```text
Cobertura quincenal
Requeridos hoy
Verificados hoy
Diferencias vigentes
Diferencias por confirmar
```

No mezclar cobertura con resolución.

---

# 15. Fase 11 — UX del cajero

El panel debe responder prioritariamente:

```text
1. ¿La referencia de stock es válida?
2. ¿Qué falta del conteo base quincenal?
3. ¿Qué debo verificar hoy?
4. ¿Qué diferencias necesitan reconteo?
```

Reducir métricas administrativas en la vista cajero.

Mantener botones grandes y tablet-first.

---

# 16. Fase 12 — rendimiento

No cargar ~1000 SKU si no son necesarios.

Preferir:

- grupos paginados/filtrados;
- detalle bajo demanda;
- consultas de cola diaria;
- memoización local razonable;
- cero polling agresivo.

---

# 17. Fase 13 — pruebas sintéticas

Casos mínimos:

### Conteo base

```text
Coincide
Faltante
Sobrante
Stock 0
Stock negativo
```

### Primer snapshot posterior

```text
Probablemente explicada
Parcialmente explicada
Persistente
Movimiento que invalida comparación
```

### Ciclo continuo

```text
Coincide → teórico cambia → nuevo conteo
Confirmada -2 → teórico cambia → nueva observación -3
Confirmada -2 → ajuste POS indirecto → nueva observación 0
```

### Histórico

Verificar:

```text
-2, -2, -3, 0, -1
```

no produce:

```text
-8
```

### Cobertura

- base quincenal;
- requeridos diarios;
- reconteo no duplica cobertura.

---

# 18. Fase 14 — seguridad

Mantener:

- sede derivada del usuario;
- dispositivo autorizado;
- una sesión activa;
- backend autoritativo;
- sin acceso directo a `inventario`.

---

# 19. Fase 15 — documentación

Al terminar actualizar:

```text
docs/SOLOG_Contrato_Tecnico_Backend_V2.md
docs/backend-current-state.md
docs/supabase-required-changes.md
```

y documentación de usuario si corresponde.

---

# 20. Criterio de finalización

La evolución se considera completa cuando:

```text
quincena inicia
↓
todos los grupos obtienen conteo base
↓
grupos con cambios entran a cola diaria
↓
cada conteo usa S0 + F0 + S1
↓
reconteos generan nuevas observaciones
↓
histórico conserva la secuencia
↓
saldo vigente = última diferencia confirmada
↓
ajustes POS intermedios no rompen la quincena
↓
administración puede investigar temporalmente
```

sin sumar diferencias históricas ni atribuir automáticamente responsabilidad.
