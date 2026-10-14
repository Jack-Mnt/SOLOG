# SOLOG — Integración Frontend — Observaciones sin transición legacy — Delta V1

**Estado:** APROBADO — cambio de estrategia para el frontend, 14 de octubre de 2026.  
**Nivel:** C. Rama: `admin-work`. `master` no se modifica.

## 1. Fuente y precedencia

Fuente primaria que sigue congelada: `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.

Este delta reemplaza **solo** la estrategia de convivencia/migración de clientes y borradores V4 indicada en la fuente primaria (§4.6 y §5) y en el plan `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_Plan_V1.md`, en cuanto exigían compatibilidad activa después de completar este bloque.

**Aprobación del usuario:** el despliegue de SOLOG está temporalmente deshabilitado; se completará y verificará localmente todo el bloque en `admin-work` antes de fusionarlo con `master` y reactivar SOLOG. No hace falta desarrollar una capa de ejecución dual V4/V5 ni migrar borradores legacy; el destino final del frontend es exclusivamente escritura V5.

## 2. Estrategia frontend

1. La Fase 1 prepara tipos, API V5 y la estructura de lotes V5 con persistencia, validación e invariabilidad; no activa la captura V5 antes de disponer del diálogo obligatorio.
2. Durante la implementación por fases la ruta V4 existente puede permanecer **temporalmente**, para no dejar una captura operativa V5 incapaz de explicar una diferencia alta. Se sustituirá al integrar la UI de captura en la Fase 3; esto no constituye soporte legacy definitivo.
3. Al finalizar Fase 3, el frontend activo utilizará `rpc_solog_cashier_mutate_v5` para inicio, conteo, reconteo y cierre dentro de las sesiones V5, y conservará `rpc_solog_cashier_bootstrap_v4` mientras ese endpoint sea el contrato de bootstrap desplegado. `rpc_solog_cashier_orphan_finish_v1` sigue siendo una función especializada para cierre de recovery huérfano, no una mutación V4.
4. No crear rutas duales de replay, ni migradores de `localStorage` V4, ni adaptación permanente del viejo formato de lote. La eliminación del código V4 de mutación activo deberá verificarse en Fase 3; mantener terminología V4 para el Motor/bootstrap si sigue vigente no implica soporte legacy.
5. La implementación mantiene **intactas** las garantías de idempotencia, atomicidad, UUID por operación, confirmaciones, manejo de respuestas inciertas, recovery y no pérdida de drafts **V5 nuevos**.
6. No se modifica el backend V4 ni `master` durante el trabajo; el corte efectivo del backend V4 permanece una tarea independiente si se requiere después de activar el sistema.
7. El despliegue y uso de nuevos conteos no se autorizan hasta completar las fases 1–4, validar el flujo V5 y el smoke operativo.

## 3. Alcance / fuera de alcance

El delta **no altera** cinco motivos, umbral absoluto ≥12, observación ≥3 caracteres efectivos, la omisión de captura, `Resuelto`, cronología, prioridad del Motor ni las decisiones de UI congeladas. No autoriza reescribir las RPC Supabase ni el motor.

## 4. Estado de Fase 1

La capa V5 de contratos/API y preparación de lotes puede quedar sin conectar a la UI hasta Fase 3. No declarar activada V5 ni cerrada la integración completa por compilar esta capa. La validación E2E con sesión autorizada aún sigue pendiente, además de las pruebas de frontend ejecutables localmente.
