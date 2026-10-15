# SOLOG — UI Admin Control — Observaciones en cronología — Delta V1

**Estado:** IMPLEMENTADO COMO COMPOSICIÓN PROVISIONAL; validación visual y smoke global PENDIENTES.
**Fecha:** 2026-10-15.
**Nivel:** B dentro del bloque de integración Nivel C.
**Rama:** `admin-work`; **no** se modifica `master`.

## 1. Jerarquía y alcance

**Fuente primaria del bloque:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.

Referencias complementarias:
1. `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md` — forma de las lecturas desplegadas.
2. `docs/SOLOG_Backend_Observaciones_Diferencias_Cronologia_Delta_V1.md` — conservar la cronología existente y permitir dos observaciones en `Coincide` tras reconteo.
3. `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_Plan_V1.md` — fase 4 de la integración.
4. `docs/SOLOG_Backend_Admin_Control_Contrato_V1.md` — contrato funcional histórico del módulo.

El usuario solicitó **continuar con la implementación de Fase 4** y postergar el smoke general y los ajustes visuales hasta completar las cuatro fases. La ubicación y geometría del nuevo popup **no se declaran congeladas**, sino propuestas funcionales implementadas para evaluarlas sobre la UI.

## 2. Decisiones preservadas

- No crear ningún evento adicional ni alterar el orden, las fechas, el `row_id`, los estados, las métricas o el origen temporal de los eventos existentes.
- `observaciones.inicial` y `observaciones.reconteo` son dos objetos opcionales `{motivo, texto, registrada_at}` o `null`; el envelope `observaciones` siempre existe.
- Un evento de reconteo que resuelve físicamente en `Coincide` puede traer ambas observaciones. Cada explicación muestra su **fecha real de registro** en zona `America/Lima`.
- Nunca atribuir un motivo descubierto en reconteo al evento de conteo inicial.
- Los eventos automáticos de snapshots sin anotación humana no muestran icono.
- Solo lectura. Sin nuevos RPC, tablas, permisos, escritura ni copia de observaciones en exportación.

## 3. Composición provisional implementada

1. Incorporar un **IconButton con Info** en la cabecera del punto de cronología, junto a su estado, solamente si existe alguna observación.
2. Con clic o teclado se despliega **un único panel contextual de lectura** dentro del evento. El panel muestra el motivo una sola vez cuando existe.
3. `Conteo inicial` y `Reconteo` son secciones independientes con texto y timestamp propio. Los históricos `null` no crean secciones vacías.
4. Cada popup puede cerrarse con X, Escape, clic fuera o cambio de foco. Escape no debe cerrar el drawer padre.
5. El popup se sitúa **en el flujo del evento** para evitar que quede recortado por el scroll del drawer, especialmente en tablet. La ubicación/densidad se revisará visualmente después.
6. Mantener `current_biweekly` y `previous_counts`, mismo caché de consultas y misma estructura de drawer de Control.

**Este delta no congela geometría ni posición final.** Si el smoke demuestra una alternativa visual mejor, se registrará el ajuste mínimo sin reabrir el contrato backend.

## 4. Validaciones necesarias

Contrato:
- acepta las dos observaciones `null`, solo inicial, solo reconteo y ambas;
- rechaza claves ausentes, razones no reconocidas, notas inválidas o conflicto entre motivos;
- eventos snapshot no heredan anotaciones.

UI:
- botón de información únicamente en eventos con datos;
- apertura/cierre por clic, Escape sin cerrar drawer y ausencia de peticiones RPC extra;
- timestamps iniciales/reconteo diferenciados, `Resuelto` mostrado literalmente;
- tablet/escritorio, saltos de línea, foco, zoom y navegación por teclado.

**Smoke general:** después de Fase 4 y validaciones técnicas, conforme a la decisión expresa del usuario.
