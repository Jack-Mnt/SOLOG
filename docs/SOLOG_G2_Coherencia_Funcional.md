# G2 — Coherencia funcional entre bloques

**Estado: IMPLEMENTACIÓN TÉCNICA COMPLETADA — PENDIENTE DE REVISIÓN**

## Baseline y alcance

- Fecha: 2026-09-04. Branch: master. HEAD: 9df147a772050a926697f85d4afcb781cf8cd5d5.
- Working tree inicial: cambios de G1 pendientes de commit (Auth, routing, stores, pruebas y documentación). Se preservaron; G2 no modifica código de aplicación ni pruebas de G1.
- Autoridad: decisiones funcionales congeladas; contrato frontend/backend V6; G2 del plan aprobado. APIs contract_version=2, publicación conexion-admin v4.
- Se revisaron Dashboard, Control, exportaciones, fechas, maestro, incidencias y dispositivos. No se encontró una corrección funcional necesaria ni una incompatibilidad backend nueva.
- Sin cambios Supabase, migraciones, datos productivos, consumidores v1 nuevos, S10, despliegue o commit.

## Cambios propios de G2

1. Fixture compartido de respuestas sintéticas para un caso cuyo conteo nació el 15 de septiembre a las 23:59:59 Lima y cuyo reconteo ocurrió el 16, en la quincena siguiente.
2. Diecisiete pruebas de integración/contrato que conservan respuestas autoritativas y comprueban relaciones entre consumidores.
3. Prueba browser cruzada con UI real, descarga y lectura de ambos XLSX, usando la zona horaria del navegador Asia/Tokyo.
4. Registro de cierre técnico y corrección documental de la referencia obsoleta a Edge v3 en G2: V6 exige Edge v4.

Archivos nuevos:

- tests/fixtures/global-g2.mjs
- tests/global-g2.test.ts
- tests/global-g2.browser.mjs
- docs/SOLOG_G2_Coherencia_Funcional.md

Archivo actualizado: docs/SOLOG_Plan_Implementacion_Optimizacion_Global.md (estado de G1/G2 y referencia vigente).

## Matriz de coherencia y evidencia

| Criterio G2 | Validación realizada |
|---|---|
| Dashboard/Control/export comparten valores de un caso | Fixture compartido, validadores reales, mismo case_id/origen/estado/diferencia/valorizado; browser compara UI y celdas de ambos XLSX |
| Reconteo en otra quincena | Origen 15/09 Lima conservado aunque recontado_at corresponda al 16/09; exportación de quincena anterior |
| Fechas y turnos Lima | Bordes de año, días 1/15/16, febrero bisiesto, medianoche y 07:30/15:30; presentación de timestamps en ambos motores Intl |
| Total y sede sin conteos | Respuesta con Total cero y denominador congelado no desaparece ni se suma desde turnos; regresión A2 de aislamiento V5 |
| Último confirmado cero | adjustments vacío y all con cero: el workbook no recupera un ajuste antiguo ni vuelve a seleccionar datos |
| Cinco hojas Admin | Resumen, Ajustes, Por recontar, Inconsistentes y Todas; test unitario y lectura del XLSX descargado |
| Exportación Detalles | Resumen y Diferencias: mismas magnitudes y fecha de origen del caso compartido; XLSX serializa fecha Lima aun con browser Tokio |
| Inconsistentes | Sin valorización en Detalles; esquema de hoja Admin sin columna de valorización; regresiones existentes de datasets vacíos y ambas quincenas |
| Paquete independiente e histórico | Explicación usa precio unitario/paquete congelados y conserva valorizado backend; mutation update_package_price no altera el store Cajero congelado |
| Dos administradores | Primera escritura simulada avanza revisión; segunda recibe conflicto, no éxito; recarga fuente y crea UUID nuevo |
| Incidencias | family_key estable en ignore_30d/reactivate/propose_delete, scope global/sede y until autoritativo; sin descargar detalle; propuesta invalida catálogo |
| Revocación | Estado devuelto por Admin y siguiente bootstrap Cajero simulados para el mismo dispositivo/sede; invalida borradores, sin inventar autorización |
| Replay y publicación preparada | Regresiones A4–A6/G1: mismo UUID/payload; respuesta comprometida conservada; cliente no crea hash/timestamp ni sube artefactos |

Las respuestas de prueba se declaran explícitamente: no son un Motor alternativo ni prueban la selección SQL interna. Tampoco equiparan todos los KPI de módulos que tienen significados distintos (cobertura quincenal, cobertura diaria y diferencias).

## Validaciones ejecutadas

- bun test: **228 pass, 0 fail; 847 assertions; 27 archivos**.
- global-g2.test.ts: **17 pass; 53 assertions**.
- bun run lint: correcto.
- bunx tsc -b: correcto.
- bun run build: correcto.
- git diff --check: correcto.

Browser con backend simulado, todos aprobados:

1. global-g2.browser.mjs: 8 RPC simuladas, UI Dashboard/Control y XLSX cruzados; cero tráfico productivo.
2. global-g1.browser.mjs: carreras Auth, usuarios y dos tabs.
3. index-phase1.browser.mjs: portada cero Supabase.
4. cajero-v4.browser.mjs: C1–C4, caché, replay, historial y temporización.
5. details-v2.browser.mjs: D1–D3, cursor, acceso, exportación y caché.
6. admin-v2.browser.mjs: A1–A3, 16 llamadas simuladas.
7. admin-management.browser.mjs: A4–A6, 65 llamadas simuladas, errores/replay y publicación.

Los primeros intentos del harness nuevo detectaron un selector ambiguo y la diferencia de presentación horaria Intl entre Bun y Chrome (23:59 frente a 11:59 p. m.). Se corrigió el test, no el código funcional. Un fixture Inconsistente requirió actualizar también su summary para respetar la validación existente. Las ejecuciones finales pasaron.

## Legacy y límites de evidencia

- Persiste getSologBootstrap → rpc_solog_state('bootstrap') en api.ts, consumido por el SologProvider histórico de context.tsx.
- No se encontró ese provider montado/importado por el árbol protegido vigente. Los transportes de Cajero, Detalles y Admin vigentes son v2; los browsers rechazan RPC legacy.
- No se retiraron estos restos ni se afirma ausencia de consumidores backend/tráfico histórico. Su evaluación definitiva pertenece a G3/S10.
- Cron 07:30/15:30/00:00 Lima y sus garantías siguen fundamentados en V6. G2 comprueba presentación y consumo, no ejecuta Cron ni revalida SQL en producción.
- No se certifican con mocks la selección real del último confirmado, supresión SQL ON CONFLICT, invariantes de grupos, locks/deadlocks ni recuperación real de Storage. Se conserva la evidencia backend congelada y no se reemplaza por simulación frontend.

## Preparación para G3

G2 queda técnicamente lista para revisión; no hay bloqueos contractuales nuevos ni regresiones detectadas. G3 puede iniciarse después de aprobación explícita, conservando sus mediciones y gates propios. No se ejecutó G3 ni S10.

Cajero mantiene **IMPLEMENTACIÓN TÉCNICA COMPLETADA — VALIDACIÓN HUMANA PENDIENTE**.

Gate: **PENDIENTE — smoke test humano por dispositivo autorizado**. No bloquea esta validación técnica de G2; sigue bloqueando cierre definitivo G3, cierre global y retirada legacy relacionada. No se ha aprobado ni ejecutado E2E productivo.
