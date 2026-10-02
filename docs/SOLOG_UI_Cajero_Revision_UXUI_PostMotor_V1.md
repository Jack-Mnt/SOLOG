# SOLOG — UI Cajero — Revisión UX/UI Post-Motor V1

**Estado:** CONGELADO — DECISIONES APROBADAS — SIN IMPLEMENTAR  
**Fecha:** 2 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** B — UX/UI funcional del Cajero  
**Rama:** `admin-work`

---

## 1. Propósito

Este documento congela las decisiones UX/UI aprobadas para revisar SOLOG Cajero después del cutover V4.

Estas decisiones NO están implementadas todavía.

La implementación queda pausada hasta desplegar y validar el delta del Motor:

`docs/SOLOG_Motor_Cajero_Prioridad_Operativa_Delta_V1.md`

Este documento será la fuente primaria para el bloque UX/UI posterior, salvo decisiones específicas futuras aprobadas mediante delta.

---

## 2. Navegación e Historial

### 2.1. Historial

Historial debe ser accesible siempre que el usuario tenga acceso válido al módulo Cajero.

No debe depender de:

- cobertura completa;
- Conteo;
- Conteo diario;
- Revisar;
- `next_action`.

Historial es una superficie de lectura y no interfiere con las acciones operativas.

### 2.2. Footer

No deben mostrarse rutas a las que el usuario no puede acceder.

Modelo conceptual:

```text
Inicio | Trabajo disponible | Historial
```

Ejemplos:

```text
Inicio | Conteo | Historial
Inicio | Revisar | Historial
Inicio | Conteo diario | Historial
```

No mostrar simultáneamente módulos operativos deshabilitados.

---

## 3. Inicio — arquitectura por estado

Inicio debe distinguir tres estados.

### 3.1. Estado A — antes de iniciar sesión

#### Cobertura < 100%

Elemento principal:

```text
Cobertura quincenal N
n / N
porcentaje
pendientes
```

Debajo no se mostrarán KPIs secundarios de Revisar/Diario.

En su lugar se explorará un diagrama de flujo interactivo que explique:

```text
Conteo
→ Revisar
→ Diario
```

según la prioridad operativa vigente.

`Pendientes de registro` no se mostrará en este estado.

`Apariencia` se mantiene por ahora.

La sección `Inventario disponible` se conserva, pero su funcionalidad/composición podrá optimizarse en la fase correspondiente.

#### Cobertura = 100%

La tarjeta principal de progreso se sustituye por una tarjeta lineal de confirmación de cobertura completada.

Debajo se muestran dos KPIs secundarios:

- Revisar;
- Conteo diario.

---

### 3.2. Estado B — sesión activa con cobertura incompleta

Principal:

- Cobertura quincenal activa.
- CTA de continuar trabajo.

KPIs secundarios:

- `Stock 0` con tratamiento warning;
- `Stock negativo` con tratamiento danger-soft.

`Revisar` se muestra debajo como KPI horizontal secundario, menos prominente que Cobertura.

Se mantiene:

- pendientes de registro;
- Apariencia.

---

### 3.3. Estado C — cobertura completada / operación diaria

La cobertura pasa a una tarjeta compacta/lineal de estado completado.

El foco operativo pasa a:

- Revisar;
- Conteo diario;

respetando la prioridad autoritativa del Motor.

---

## 4. Terminología de registro

Se reemplaza:

```text
Enviar pendientes
Enviar conteo
```

por:

```text
Registrar conteo
```

Motivo:

`Registrar conteo` describe mejor la transición desde draft local a registro confirmado en SOLOG.

### Inicio

Puede mantenerse dentro de un KPI/tarjeta de pendientes.

### Conteo y Conteo diario

Usar un botón compacto con icono:

```text
[icon] Registrar conteo
```

Sin contador dentro del botón.

### Revisar

Eliminar el botón de registro/envío de esta pantalla.

---

## 5. Selección Tipo → Categoría → Grupo

Se mantiene la profundidad actual:

```text
Tipo de stock
→ Categoría
→ Grupo
```

Motivo:

- listas pequeñas facilitan la selección;
- reducen carga visual;
- fragmentan el trabajo en objetivos manejables.

No simplificar esta arquitectura.

---

## 6. Tarjetas de categoría

Restaurar:

```text
n/N contados
```

en lugar de:

```text
N pendientes
```

Aplicar donde exista progreso real de grupos contados dentro de una categoría/tipo.

---

## 7. Modal de captura — vista de lista

Se conserva la arquitectura de dos vistas:

1. lista de grupos;
2. detalle del grupo + calculadora.

### Header

Restaurar contador:

```text
n / N
```

junto al botón cerrar.

### Progreso

Restaurar barra de progreso de la categoría con porcentaje.

### Tabla

Restaurar columnas:

```text
Nombre | Stock TumiSoft | Diferencia | >
```

Eliminar la columna/estado visual `Por enviar` de esta tabla.

### Diferencia

Colores:

- negativo → rojo;
- positivo → azul;
- cero → verde.

---

## 8. Modal de captura — detalle

Mantener Stock TumiSoft visible.

Restaurar footer:

```text
Anterior | Regresar | Siguiente / Continuar
```

Semántica:

- sin dato registrable → `Siguiente`;
- con dato registrable → `Continuar`;
- `Continuar` guarda el draft local y avanza;
- navegación secuencial entre grupos;
- mantener soporte para continuar a otra categoría cuando corresponda.

---

## 9. Calculadora

Se aprobará un rediseño específico posterior.

El usuario proporcionará una imagen/borrador cuando se llegue a esta fase.

Objetivo ya identificado:

- incorporar más multiplicadores útiles.

No se congela todavía la lista de multiplicadores ni la composición final.

---

## 10. Revisar

La estructura principal permanece:

```text
Nombre | Última diferencia | Diferencia actual
```

Se puede añadir representación de transición:

```text
-4 → -2
```

cuando exista información suficiente.

---

## 11. Filtro de Revisar

Sustituir botones aislados `+` / `−` por una pastilla segmentada.

Dirección aprobada:

```text
Todos | Faltantes | Sobrantes
```

La composición visual exacta se resolverá durante la fase de implementación UX/UI.

---

## 12. Historial

No rediseñar inicialmente.

La implementación previa se considera conceptualmente válida mientras conserve:

- Hoy/Ayer;
- categorías;
- lista;
- expansión;
- diferencia;
- valorizado;
- reconteo;
- colores de diferencias.

Primero debe desbloquearse el acceso y validarse visualmente.

---

## 13. Terminología

Se realizará un inventario específico en su fase.

Términos a revisar incluyen, entre otros:

- Stock TumiSoft;
- Inventario disponible;
- Conteo;
- Conteo diario;
- Revisar;
- Pendientes de envío;
- Enviar conteo;
- Registrar conteo;
- Diferencia actual;
- Última diferencia;
- Stock vencido;
- Finalizar conteo;
- Productos incluidos.

No se congelan cambios adicionales de copy hasta realizar ese inventario.

---

## 14. CSS histórico

Antes de limpiar CSS del Cajero:

1. comparar JSX/CSS V4 con versiones anteriores al cambio de Motor;
2. identificar patrones UX perdidos;
3. clasificar clases como:
   - reutilizables;
   - incompatibles con V4;
   - realmente muertas;
4. restaurar primero la UX válida;
5. limpiar después.

Se identificaron preliminarmente como candidatas históricas relevantes:

- `.cajero-capture-modal__progress`;
- `.cajero-capture-detail__navigation`;
- `.cajero-capture-summary`;
- `.cajero-capture-summary__head`;
- `.cajero-capture-summary__rows`;
- `.cajero-home-metric--action`;
- `.cajero-send-bar`;
- `.cajero-send-bar--compact`.

No eliminar estas clases antes de completar la auditoría.

---

## 15. Estado de implementación

Todos los cambios de este documento están:

**APROBADOS Y CONGELADOS, PERO NO IMPLEMENTADOS.**

No deben tratarse como parte del baseline actual hasta completar:

1. implementación y validación del delta del Motor;
2. preflight UX/UI específico;
3. plan de implementación;
4. implementación por fases;
5. validación técnica y visual.
