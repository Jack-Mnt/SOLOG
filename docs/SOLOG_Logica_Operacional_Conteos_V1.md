# SOLOG — Lógica operacional de conteos quincenales y diarios
**Versión:** 1.0  
**Fecha:** 2026-08-25  
**Estado:** definición funcional cerrada.

---

# 1. Idea central

> **SOLOG trabaja por quincenas completas. El conteo quincenal establece una base física de todos los grupos. A partir de esa base, los conteos diarios funcionan como checkpoints selectivos cuando el stock teórico cambia o cuando una diferencia necesita seguimiento. Cada conteo se evalúa únicamente usando el snapshot anterior, el conteo físico y el primer snapshot posterior. Las observaciones pueden repetirse indefinidamente, pero cada evaluación individual permanece temporalmente acotada. Las diferencias históricas son fotografías independientes y nunca se acumulan. El saldo operativo vigente de cada grupo es siempre la última diferencia confirmada. Los ajustes de POS no necesitan ser detectados: una nueva observación confirmada reemplaza naturalmente el saldo anterior.**

---

# 2. Contexto

El stock teórico cambia por:

- ventas;
- transferencias;
- ajustes del POS;
- otros movimientos válidos.

Snapshots aproximados:

```text
cada ~2 horas
```

SOLOG solo conoce:

- stock teórico de snapshots;
- conteos físicos;
- timestamps.

No conoce con certeza la causa de cada movimiento.

---

# 3. Periodo

```text
Periodo operativo = quincena completa
```

No se reinicia por un ajuste POS intermedio.

---

# 4. Conteo quincenal

Objetivo:

```text
obtener al menos un conteo físico
de todos los grupos aplicables
```

Cobertura:

```text
grupos con conteo base / grupos aplicables
```

Una diferencia no impide que el grupo cuente como cubierto.

---

# 5. Conteo diario

No repite todo el inventario.

Requiere conteo cuando:

```text
1. cambió el teórico desde la última observación
2. existe diferencia por seguir
3. existe reconteo/verificación pendiente
```

Cobertura diaria:

```text
verificados hoy / requeridos hoy
```

---

# 6. Evaluación de una observación

```text
S0 = snapshot anterior
F0 = físico
S1 = primer snapshot posterior
```

Flujo:

```text
S0
↓
F0
↓
¿F0 = T0?
├─ Sí → Coincide
└─ No → Pendiente
          ↓
        esperar S1
          ↓
        evaluar
```

---

# 7. Estados

## Coincide

```text
F0 = T0
```

No necesita nuevo conteo mientras el teórico no cambie.

## Pendiente

```text
F0 ≠ T0
```

espera primer snapshot posterior.

## Probablemente explicada

```text
T1 = F0
```

El movimiento entre referencia y conteo probablemente explica la diferencia.

## Parcialmente explicada

```text
|T1 - F0| < |T0 - F0|
```

sin igualdad.

Requiere nueva observación.

## Persistente

```text
T1 = T0
```

y la diferencia continúa.

Reconteo recomendado.

## Movimiento posterior

Si `T1` cambia de forma que el físico anterior ya no sea temporalmente comparable, no asumir automáticamente que el faltante aumentó.

```text
→ nueva observación requerida
```

---

# 8. Reconteo

Un reconteo no es solo “comparar dos números físicos”.

Es otra observación:

```text
Tn + Fn → Dn
```

donde:

```text
Dn = Fn - Tn
```

Puede:

- confirmar la diferencia;
- dejarla en cero;
- mostrar otra magnitud;
- requerir seguimiento posterior.

---

# 9. Ciclo infinito correcto

La operación puede repetirse:

```text
observación
→ movimiento
→ observación
→ movimiento
→ observación
→ ...
```

Esto es necesario porque la posibilidad de errores/pérdidas es constante.

No hacer:

```text
F0 antiguo
→ S1
→ S2
→ S3
→ S4
```

Cada observación se cierra con su primer snapshot posterior.

---

# 10. Histórico

Cada diferencia confirmada/observada es una fotografía.

Ejemplo:

```text
17 ago   0
18 ago   0
19 ago  -1
20 ago  -1
21 ago  -3
23 ago  -4
```

Puede indicar intervalos donde apareció o aumentó una discrepancia.

No demuestra quién fue responsable.

---

# 11. No acumulación

Incorrecto:

```text
-1 + -1 + -3 + -4 = -9
```

Correcto:

```text
última diferencia confirmada = -4
```

Las anteriores son evidencia histórica.

---

# 12. Saldo operativo vigente

```text
saldo vigente
=
última diferencia confirmada
```

Ejemplo:

```text
Día 5  → -2
Día 7  → 0
Día 10 → -1
```

Saldo actual:

```text
-1
```

---

# 13. Ajustes POS

Si administración ajusta el POS a mitad de quincena:

```text
Día 5 → -2
[ajuste POS no detectado por SOLOG]
Día 7 → 0
```

SOLOG no necesita inferir el ajuste.

La nueva observación `0` sustituye el saldo vigente.

---

# 14. Uso administrativo

SOLOG aporta:

- producto/grupo;
- sede;
- timestamp;
- teórico;
- físico;
- diferencia;
- evolución temporal.

Administración puede cruzarlo con trabajadores/turnos y otros datos.

SOLOG no etiqueta automáticamente robo, negligencia o culpabilidad.

---

# 15. Cierre quincenal

Al cierre debe distinguirse:

```text
Cobertura física completa
Diferencias vigentes confirmadas
Casos todavía en seguimiento
```

El valor para ajuste POS es la última diferencia confirmada vigente de cada grupo, nunca la suma del histórico.
