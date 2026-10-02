# SOLOG — UI Cajero — Plan de bloques UX/UI Post-Motor V1

**Estado:** CONGELADO — PLAN APROBADO  
**Fecha:** 2 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** B — implementación funcional UX/UI del módulo Cajero  
**Rama:** `admin-work`

---

## 1. Propósito

Congelar el plan aprobado para ejecutar la revisión UX/UI del módulo SOLOG Cajero después del Motor V4, separando:

1. trabajo completamente definido y listo para implementación;
2. trabajo que todavía requiere diseño visual, revisión UX o definición adicional.

Este documento organiza la implementación por bloques y fases. No reemplaza la fuente funcional/UX primaria.

---

## 2. Fuente primaria y prevalencia

### Fuente primaria UX/UI

`docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`

**Estado:** CONGELADO — DECISIONES APROBADAS — SIN IMPLEMENTAR.

La fuente primaria anterior prevalece sobre este plan cuando exista una contradicción funcional o UX.

Este documento únicamente congela:

- separación en bloques;
- orden de fases;
- alcance de cada fase;
- puntos de validación técnica.

### Fuentes backend / Motor vigentes

- `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
- `docs/SOLOG_Motor_Cajero_Prioridad_Operativa_Delta_V1.md`
- `docs/SOLOG_Backend_Cajero_Prioridad_Operativa_Baseline_V1.md`
- `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
- `docs/SOLOG_Integracion_Cajero_Cutover_V4_Cierre_V1.md`

El frontend no reconstruirá ni reinterpretará `next_action`, elegibilidad, prioridad o reglas del Motor.

---

# 3. BLOQUE 1 — UX/UI completamente definida

**Estado:** APROBADO — listo para preflight e implementación.

**Objetivo:** implementar exclusivamente decisiones ya congeladas y suficientemente especificadas, sin abrir nuevas decisiones visuales.

## Fase 1.1 — Navegación + Historial

- Historial siempre accesible para un usuario con acceso válido al Cajero.
- Eliminar dependencia de cobertura, Revisar, Conteo diario y `next_action`.
- Footer filtra rutas inaccesibles; no muestra módulos operativos deshabilitados.
- Modelo:
  - `Inicio | Conteo | Historial`
  - `Inicio | Revisar | Historial`
  - `Inicio | Conteo diario | Historial`
  - `Inicio | Historial` cuando no exista trabajo operativo capturable.
- Mantener `next_action` como autoridad exclusiva para la ruta operativa.
- Actualizar tests V4 que congelen el comportamiento anterior.

## Fase 1.2 — Registro de conteos

- Cambiar `Enviar pendientes` / `Enviar conteo` por `Registrar conteo`.
- Conteo y Diario:
  - botón compacto;
  - icono;
  - sin contador dentro del botón.
- Revisar:
  - eliminar completamente acción de registro/envío.
- Inicio:
  - puede conservar contador dentro del KPI/tarjeta correspondiente.
- No modificar la orquestación V4 de envío.

## Fase 1.3 — Selección y progreso de categorías

Mantener:

```text
Tipo de stock
→ Categoría
→ Grupo
```

Restaurar en categorías:

```text
n/N contados
```

en lugar de:

```text
N pendientes
```

El cálculo es exclusivamente presentacional y no interviene en `next_action`.

## Fase 1.4 — Modal de captura: lista

Restaurar:

- contador `n/N` en header;
- barra de progreso;
- porcentaje;
- tabla:
  - Nombre;
  - Stock TumiSoft;
  - Diferencia;
  - acceso al detalle.

Eliminar:

- `Preparado localmente`;
- `Por enviar`.

Colores:

- diferencia negativa → rojo;
- diferencia positiva → azul;
- diferencia cero → verde.

Reutilizar patrones CSS históricos válidos cuando sean compatibles con V4.

## Fase 1.5 — Modal de captura: navegación

Restaurar:

```text
Anterior | Regresar | Siguiente / Continuar
```

Reglas:

- sin dato registrable → `Siguiente`;
- con dato registrable → `Continuar`;
- `Continuar` guarda draft local V4 y avanza;
- `Anterior` retrocede;
- `Regresar` vuelve a la lista;
- mantener navegación secuencial entre grupos;
- mantener soporte de siguiente categoría cuando corresponda.

No recuperar controladores V3 ni lógica legacy. Adaptar el patrón UX al runtime V4 vigente.

## Fase 1.6 — Revisar: estructura funcional congelada

Mantener:

```text
Nombre | Última diferencia | Diferencia actual
```

Eliminar:

- `PendingSend`;
- botón de registro/envío.

La representación visual de transición `-4 → -2` no forma parte de este bloque; se evaluará en Bloque 2.

---

## Validación técnica — Bloque 1

Al terminar las fases 1.1–1.6 ejecutar, según corresponda:

- tests dirigidos de Cajero;
- tests de navegación V4;
- tests de selectors/capabilities afectados;
- tests de drafts y registro;
- typecheck;
- lint;
- build;
- `git diff --check`.

Comprobar explícitamente:

- ningún cambio backend/Supabase;
- contrato V4 intacto;
- `next_action` no se reconstruye;
- elegibilidad del Motor no se reconstruye;
- Historial permanece read-only;
- drafts V4 conservan aislamiento y comportamiento vigente;
- navegación del footer muestra solo rutas accesibles.

Realizar además validación visual dirigida de las superficies restauradas del modal y navegación, sin abrir todavía una revisión UX general.

---

# 4. BLOQUE 2 — UX/UI pendiente de diseño o revisión

**Estado:** APROBADO como alcance de exploración posterior.  
**No implementar estas fases sin realizar primero la exploración/definición correspondiente.**

## Fase 2.1 — Inicio: arquitectura A / B / C

Revisar y definir composición visual para:

### A. Antes de sesión — cobertura incompleta

Ya definido funcionalmente:

- cobertura principal;
- `n/N`;
- porcentaje;
- pendientes;
- sin KPI Revisar/Diario;
- sin Pendientes de registro.

Pendiente de diseño:

- diagrama interactivo `Conteo → Revisar → Diario`;
- estado visual de etapa/prioridad;
- composición de `Inventario disponible`.

### B. Sesión activa — cobertura incompleta

Ya definido funcionalmente:

- cobertura principal;
- CTA continuar;
- Stock 0 warning;
- Stock negativo danger-soft;
- Revisar horizontal secundario;
- Pendientes de registro;
- Apariencia.

Pendiente:

- jerarquía y composición visual definitiva.

### C. Cobertura completada

Pendiente de definir visualmente:

- cobertura lineal/compacta;
- jerarquía Revisar vs Diario;
- transición de presentación ante cambios de `next_action`.

## Fase 2.2 — Filtro de Revisar

Dirección funcional aprobada:

```text
Todos | Faltantes | Sobrantes
```

Pendiente de revisión:

- composición exacta de pastilla segmentada;
- tamaño;
- contadores;
- responsive;
- estado seleccionado.

## Fase 2.3 — Transición de diferencias

Explorar representación de:

```text
-4 → -2
```

sin alterar la estructura base:

```text
Nombre | Última diferencia | Diferencia actual
```

Evaluar jerarquía, densidad y tratamiento cromático.

## Fase 2.4 — Historial: revisión visual

Después de desbloquearlo en Bloque 1, validar:

- Hoy/Ayer;
- categorías;
- lista;
- expansión;
- diferencia;
- valorizado;
- reconteo;
- colores.

Rediseñar únicamente si aparece un problema UX concreto.

## Fase 2.5 — Calculadora

Esperar la referencia visual del usuario.

Definir entonces:

- composición;
- multiplicadores;
- entrada manual;
- operaciones;
- interacción táctil;
- responsive;
- estados.

No modificar multiplicadores ni composición antes de esta definición.

## Fase 2.6 — Inventario de terminología

Revisar específicamente copy técnico del Cajero, incluyendo:

- Stock TumiSoft;
- Inventario disponible;
- Conteo;
- Conteo diario;
- Revisar;
- Registrar conteo;
- Diferencia actual;
- Última diferencia;
- Stock vencido;
- Finalizar conteo;
- Productos incluidos;
- demás copy encontrado durante la revisión.

Los cambios adicionales de terminología requerirán aprobación antes de implementarse.

## Fase 2.7 — CSS Cajero final

Después de completar la UX:

Clasificar clases como:

- vigente;
- reutilizada;
- incompatible con V4;
- muerta.

Luego:

- retirar CSS realmente muerto;
- consolidar duplicados claros;
- revisar cascade;
- preservar tokens y Design System;
- evitar refactors generales.

---

## Validación técnica — Bloque 2

Al terminar:

- suite completa de tests Cajero;
- tests visuales/estructurales afectados;
- typecheck;
- lint;
- build;
- `git diff --check`;
- revisión de consola/runtime;
- responsive;
- teclado y foco;
- touch;
- modal y overlays;
- reduced motion cuando corresponda;
- revisión de CSS/cascade;
- verificación final de autoridad V4.

Después:

- smoke test humano integral del Cajero.

---

# 5. Orden congelado

```text
BLOQUE 1 — UX/UI completamente definida
  1.1 Navegación + Historial
  1.2 Registrar conteo
  1.3 Selección + progreso n/N
  1.4 Modal — lista
  1.5 Modal — navegación
  1.6 Revisar — estructura definida

  → VALIDACIÓN TÉCNICA BLOQUE 1

BLOQUE 2 — Diseño / revisión UX pendiente
  2.1 Inicio A/B/C
  2.2 Filtro Revisar
  2.3 Transición de diferencias
  2.4 Historial
  2.5 Calculadora
  2.6 Terminología
  2.7 CSS final

  → VALIDACIÓN TÉCNICA BLOQUE 2
  → SMOKE HUMANO GLOBAL
```

---

# 6. Restricciones

- No modificar `master`.
- No tocar backend/Supabase.
- No cambiar contrato V4.
- No rederivar `next_action`.
- No reconstruir reglas del Motor en frontend.
- No realizar refactors generales.
- Preservar cambios preexistentes.
- No limpiar CSS antes de completar la restauración y auditoría histórica.
- Si aparece una incompatibilidad real con el Motor V4, detener esa parte y reportar:
  - bloqueo;
  - evidencia;
  - impacto;
  - cambio mínimo propuesto.
- No tratar decisiones del Bloque 2 como aprobadas para implementación antes de su definición específica.

---

# 7. Estado final

**PLAN CONGELADO Y APROBADO.**

El siguiente paso autorizado es:

```text
Preflight técnico Bloque 1
→ confirmar alcance/archivos/dependencias/tests
→ implementar fases 1.1–1.6
→ validación técnica Bloque 1
```
