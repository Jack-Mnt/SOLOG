# SOLOG — Decisiones funcionales y lógicas
**Versión:** 2.0  
**Fecha:** 2026-08-25  
**Empresa:** Puerto Rico  
**Estado:** decisiones vigentes; reemplaza `SOLOG_Decisiones_V1`.

---

# 1. Objetivo

SOLOG es la plataforma web para:

- conteo físico;
- comparación físico vs teórico;
- seguimiento de diferencias;
- evidencia histórica;
- administración de incidencias, catálogo y grupos;
- apoyo al ajuste manual del POS.

SOLOG nunca modifica directamente el POS.

---

# 2. Separación con ConeXion

```text
ConeXion
POS → Excel → snapshots → stock_actual

SOLOG
stock_actual + catálogo + grupos
→ conteos físicos
→ diferencias
→ seguimiento
→ administración
```

---

# 3. Usuarios y dispositivo

Rol operativo:

```text
cajero
```

Reglas:

- cajero limitado a su sede;
- dispositivo autorizado requerido;
- una fuente operativa de conteo por sede;
- administración autoriza/revoca/reemplaza dispositivos.

---

# 4. Unidad de conteo

SOLOG trabaja principalmente a nivel de:

```text
grupo_conteo
```

`Único` es un grupo unitario real.

`Agrupado` representa varios SKU compatibles.

`Excluido` no participa del conteo.

La lista de SKU integrantes puede visualizarse como información.

---

# 5. Sesión de conteo

Una sesión:

- pertenece a sede/usuario;
- fija snapshot de referencia;
- es general, no por categoría;
- permite recorrer categorías/vistas;
- tiene vigencia basada en el snapshot de referencia;
- máximo una sesión activa por sede;
- puede finalizar parcialmente.

Los detalles guardados permanecen históricos.

---

# 6. Periodo operativo

Regla vigente:

```text
Periodo operativo = quincena completa
```

La quincena no se reinicia si administración ajusta el POS.

SOLOG no tiene forma de detectar con certeza ese ajuste y no necesita hacerlo.

---

# 7. Conteo quincenal

Objetivo:

> obtener al menos una observación física de todos los grupos aplicables durante la quincena.

Cobertura:

```text
grupos distintos con conteo base
/
grupos aplicables
```

Un grupo con diferencia también cuenta como cubierto.

Cobertura no equivale a diferencia resuelta.

---

# 8. Conteo diario

El conteo diario deja de ser una cobertura completa del inventario.

Su función es seleccionar grupos que requieren nueva observación.

Entran a la cola diaria cuando:

1. cambió el stock teórico desde la última observación física relevante;
2. existe una diferencia pendiente de seguimiento;
3. existe reconteo/verificación pendiente.

No se vuelven a contar diariamente grupos que no cambiaron y no requieren seguimiento.

Cobertura diaria:

```text
verificados hoy
/
requeridos hoy
```

---

# 9. Vistas operativas

Se mantienen como vías de acceso:

- Por categoría
- Stock 0
- Stock negativo
- Cambios recientes / grupos que cambiaron
- seguimiento/reconteos

Estas vistas no alteran la identidad del grupo ni duplican conteos.

---

# 10. Fórmula de diferencia

```text
D = stock_fisico - stock_teorico
```

Interpretación:

```text
D < 0 → faltante observado
D > 0 → sobrante observado
D = 0 → coincide
```

---

# 11. Inmutabilidad de observación

Una observación original no se recalcula retroactivamente.

Se conservan:

- snapshot usado;
- teórico;
- físico;
- diferencia;
- timestamp.

Lo que puede cambiar es su clasificación/evaluación o aparecer una nueva observación posterior.

---

# 12. Unidad temporal de evaluación

Cada conteo físico se evalúa únicamente con:

```text
S0 → F0 → S1
```

- `S0`: último snapshot anterior al conteo;
- `F0`: físico;
- `S1`: primer snapshot posterior.

No se compara el mismo `F0` contra `S2`, `S3`, `S4` indefinidamente.

---

# 13. Estados iniciales

## Coincide

```text
F0 = T0
```

No requiere seguimiento mientras el teórico permanezca igual.

Si el teórico cambia posteriormente:

```text
necesita nueva observación física
```

sin alterar retrospectivamente el `Coincide` histórico.

## Pendiente

```text
F0 ≠ T0
```

espera el primer snapshot posterior.

---

# 14. Evaluación con primer snapshot posterior

## Probablemente explicada

```text
T1 = F0
```

La diferencia inicial queda probablemente explicada por movimientos entre referencia y conteo.

No se trata como faltante confirmado.

## Parcialmente explicada

```text
|T1 - F0| < |T0 - F0|
```

sin igualdad.

Parte de la diferencia se explica, pero queda discrepancia.

Requiere nueva observación/reconteo.

## Persistente

Caso fuerte:

```text
T1 = T0
```

y continúa la diferencia.

El nuevo snapshot no aporta explicación.

Reconteo recomendado y útil para confirmar.

## Movimiento posterior que invalida la comparación

Si el nuevo teórico cambia de forma que `F0` ya no representa una comparación temporalmente limpia —por ejemplo una transferencia de entrada— SOLOG no debe afirmar automáticamente que el faltante aumentó.

Debe quedar como:

```text
pendiente de nueva observación/reconteo
```

---

# 15. Reconteos

Un reconteo es una nueva observación física válida.

Debe evaluarse contra el teórico vigente correspondiente:

```text
Dn = Fn - Tn
```

No se compara solamente `Fn` contra el primer físico.

---

# 16. Confirmación

## Confirmada por reconteo

Cuando una nueva observación reproduce la misma diferencia relevante.

## Coincide después del reconteo

Si la nueva diferencia es:

```text
0
```

el saldo operativo vigente pasa a cero.

## Diferencia distinta

Si una nueva observación sigue mostrando discrepancia pero con distinta magnitud, ambas observaciones se conservan y el seguimiento puede continuar.

El sistema puede generar nuevas observaciones indefinidamente durante la operación.

---

# 17. Ciclo infinito correcto

El ciclo operacional puede repetirse indefinidamente:

```text
observación
→ movimientos
→ nueva observación
→ movimientos
→ nueva observación
→ ...
```

Esto es correcto porque ventas, transferencias, errores y pérdidas pueden ocurrir todos los días.

Lo que NO es correcto:

```text
un conteo físico antiguo
→ comparar contra snapshots indefinidos
```

Cada observación individual permanece temporalmente acotada.

---

# 18. Diferencias históricas

Regla fundamental:

> Las diferencias históricas son observaciones, no saldos acumulables.

Ejemplo:

```text
-2 → -2 → -3 → 0 → -1
```

Nunca:

```text
-8
```

Cada valor es una fotografía independiente.

---

# 19. Saldo operativo vigente

El saldo operativo del grupo es:

```text
última diferencia confirmada vigente
```

Ejemplo:

```text
10 ago: -2 confirmado
12 ago: -3 confirmado
13 ago:  0 confirmado
14 ago: -1 confirmado
```

Saldo vigente:

```text
-1
```

---

# 20. Ajustes POS a media quincena

SOLOG no intenta detectar el ajuste.

Ejemplo:

```text
Día 5 → -2 confirmado
[administración ajusta POS]
Día 7 → 0 confirmado
```

SOLOG conserva:

```text
Día 5 → -2
Día 7 → 0
```

El saldo vigente pasa a cero.

No se reinicia la quincena.

---

# 21. Histórico administrativo

El histórico debe permitir identificar cuándo una discrepancia:

- apareció;
- aumentó;
- disminuyó;
- desapareció;
- reapareció.

Puede cruzarse administrativamente con:

- trabajadores presentes;
- turnos;
- ventas;
- transferencias;
- incidencias.

SOLOG no atribuye automáticamente responsabilidad.

---

# 22. Uso como evidencia

SOLOG puede afirmar objetivamente:

```text
entre dos observaciones la diferencia cambió
```

No puede afirmar:

```text
trabajador X robó
trabajador X causó el faltante
```

La atribución es administrativa.

---

# 23. Cierre quincenal

El cierre debe distinguir:

```text
Cobertura quincenal
vs
Diferencias vigentes confirmadas
vs
Casos aún en seguimiento
```

Cobertura 100 % no implica necesariamente que todos los casos estén confirmados.

El reporte para ajuste POS debe tomar la **última diferencia confirmada vigente** por grupo, no sumar observaciones históricas.

---

# 24. Incidencias administrativas

Tipos operativos:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

Acciones:

```text
producto_ausente:
  Ignorar 15 días
  Eliminar

otros:
  Revisado
```

`Eliminar` crea una propuesta de eliminación de catálogo; no elimina inmediatamente.

---

# 25. Catálogo y grupos

Los cambios se acumulan como propuestas.

Estados:

```text
Pendiente
Aprobado
Ignorado
Incorporado
```

Ámbitos:

```text
Producto
Grupo
```

La próxima versión del catálogo se construye con todo el conjunto aprobado y se valida globalmente.

No existe publicación parcial.

---

# 26. Administración de grupos

El módulo `Admin → Grupos` permite preparar:

- nuevas definiciones;
- nombre/categoría/precio;
- mover productos;
- convertir a Único;
- convertir a Agrupado;
- convertir a Excluido.

Los cambios no alteran inmediatamente la estructura oficial.

---

# 27. Regla de evolución

Cualquier implementación futura debe respetar:

```text
1. quincena como periodo
2. conteo base completo
3. seguimiento diario selectivo
4. S0 + F0 + S1 por observación
5. histórico no acumulable
6. saldo = última diferencia confirmada
7. ajustes POS no interrumpen quincena
8. evidencia objetiva, no culpabilidad automática
```
