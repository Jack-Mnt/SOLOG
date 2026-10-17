# SOLOG — UX Cajero — Tarjeta, productos incluidos y observaciones — Delta V1

**Estado:** APROBADO Y CONGELADO para planificación; implementación, validaciones y smoke visual pendientes.
**Origen:** smoke humano de Etapa A del bloque «Motivos y observaciones de diferencias», capturas del 16/10/2026.
**Clasificación:** Nivel B — composición e interacción frontend, sin cambio de Motor ni backend.
**Rama:** `admin-work`; `master` queda fuera de alcance.

## 1. Autoridad documental

**Fuente primaria de este delta:** `docs/SOLOG_UX_Cajero_Tarjeta_Productos_Observaciones_Delta_V1.md`.

Para este alcance UX específico, este delta complementa y prevalece solamente donde sustituye el disclosure inline, precisa la composición de la tarjeta y corrige el comportamiento del teclado del diálogo. Lo restante sigue gobernado por:
1. `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md` — reglas funcionales de motivo, nota, umbral, reconteo y persistencia.
2. `docs/SOLOG_UX_Cajero_Proteccion_Captura_Sin_Guardar_V1.md` — protección D.1.4, abandono, Guardar/Cancelar/Descartar.
3. `docs/SOLOG_Integracion_Observaciones_Diferencias_SmokeIntegral_V1.md` — matriz y evidencia del smoke global.
4. `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_SinLegacy_Delta_V1.md` — ruta de escritura V5 exclusivamente.
5. Design System y primitives reutilizables de SOLOG — tokens y controles establecidos.

No reabrir decisiones congeladas de negocio por preferencias de presentación. Mejoras no bloqueantes después del smoke vuelven como nuevo delta.

## 2. Preflight funcional y técnico (dirigido, completado)

- La captura actual reside en `src/features/solog/cajero/cajero.v4.ui.tsx`; los estilos relevantes están en `cajero.css`.
- La tarjeta agrupa `nombre`, observación y cuatro KPIs. Un `<details>` con `Productos incluidos` se introduce inline y altera la composición; la altura se ve amplificada por el grid `grid-template-rows: minmax(11rem, 1fr) auto auto` y la alineación centrada de `__information`.
- `CashierV4Group.productos[]` ya incluye `c_interno`, `producto`, `marca` nullable y `precio` por SKU.
- `CashierV4Group` también tiene `precio`, `unidades_por_paquete` nullable y `precio_paquete` nullable, estos **dos últimos únicamente a nivel de grupo**. No existe un contrato remoto de paquete o valorización separado por cada SKU. No inventar esos datos.
- La captura actual ya tiene diálogo de observaciones en `cajero.observacion.dialog.tsx` y usa otra trampa de foco en el modal padre. El diálogo secundario requiere aislar el foco y los eventos de teclado respecto de la capa inferior.
- **No se requiere backend:** todos los datos acordados ya están disponibles en el panel V4 vigente. Si la inspección técnica de Codex descubre que para una ampliación de datos sí haría falta backend, **detenerse** y devolver el bloqueo a ChatGPT; no alterar backend.

## 3. Decisiones aprobadas: A1 — tarjeta y productos incluidos

1. **Eliminar únicamente el disclosure inline** «Productos incluidos» dentro de la tarjeta. No reemplazarlo con lista expansible en la misma tarjeta.
2. Incorporar un **IconButton «Ver productos incluidos»**, situado **inmediatamente a la izquierda del IconButton de observación**, en la zona de acciones del encabezado. Ambos conservan etiquetas accesibles y áreas táctiles razonables.
3. Al activarlo, mostrar un **diálogo/popup de lectura** coherente con las superficies de SOLOG y adaptable al espacio; no sustituir el contenido completo de la tarjeta. El detalle incluirá por SKU: nombre de producto, código interno, marca cuando exista y precio del SKU. Mostrar cantidad total de productos del grupo.
4. Si hay `unidades_por_paquete` y/o `precio_paquete` del grupo, mostrar la **configuración de paquete del grupo**, separada de las filas individuales y correctamente rotulada. `precio` del SKU no se presenta como si fuese `precio_paquete` por SKU. **No calcular ni inventar valorizaciones por SKU.**
5. El popup será de **solo lectura**. Abrir/cerrar no altera cantidad, notas, borradores, el contador n/N ni consulta adicional de Supabase. Debe funcionar con 1, varios o numerosos productos, nombres largos y valores `null`.
6. Compactar la tarjeta en estado normal: nombre y acciones con jerarquía clara, cuatro KPIs legibles en su distribución actual y sin altura vacía desproporcionada. Revisar `min-height`, grid, padding y centrado que provocan espacio artificial; no modificar el comportamiento de la calculadora ni de la navegación.
7. El cierre del detalle (X, Escape, clic fuera cuando corresponda) devuelve el foco al IconButton que lo abrió. Mantener foco interno, scroll y lectura por teclado; evitar clipping en tablet/móvil.

## 4. Decisiones aprobadas: A2 — refinamiento visual del diálogo de observaciones

1. Conservar los **cinco motivos**, ausencia de selección por defecto, explicación y acciones funcionales actuales.
2. Mejorar jerarquía del encabezado, separación entre secciones, legibilidad de radios, feedback de selección, apariencia del textarea, texto de ayuda y composición del footer, usando **tokens/primitives actuales**, sin colores ni sombras hardcoded de nueva identidad.
3. Estados visibles: hover/focus/selected/disabled; error y obligatorio sin ruido visual excesivo. Responsivo y cómodo para teclado/táctil.
4. No cambiar reglas de obligatoriedad, `Resuelto`, motivo original bloqueado ni acciones Aplicar, Limpiar, Cancelar u Omitir.

## 5. Decisiones aprobadas: A3 — accesibilidad del diálogo de observaciones

1. Corregir el manejo de foco entre el **modal padre de captura** y el **diálogo secundario**. Solo la capa superior activa captura `Tab`/Escape; evitar que el trap padre secuestre foco o cierre la captura al pulsar Escape.
2. **Contrato de radio nativo:** `Tab` entra al grupo de cinco motivos como **un único tab stop**; las flechas cambian opción, Espacio selecciona. `Shift+Tab` retrocede. **No exigir un Tab por cada radio**, por ser contrario al patrón accesible del grupo nativo.
3. Orden lógico: cerrar → grupo de motivos habilitados → explicación cuando exista → acciones habilitadas, según la composición definitiva.
4. En reconteo con motivo bloqueado, los radios deshabilitados no deben provocar pérdida de foco; el motivo previo debe seguir legible.
5. Trap sin escape hacia la calculadora subyacente, navegación inversa simétrica, foco inicial apropiado y **restauración al activador** al cerrar. Comprobar aperturas sucesivas, cambios de grupo y estado obligatorio (sin Limpiar, con Omitir).
6. Probar mediante navegador real (Playwright o equivalente) y, cuando corresponda, pruebas unitarias dirigidas. Los tests de source strings no sustituyen la prueba de teclado.

## 6. Fuera de alcance

- Supabase, RLS, RPC, contratos backend, modelo de datos y ConeXion.
- Lógica de negocio V5, umbral ±12, motivo/observación, cambios de Motor, prioridades, estado del conteo, cálculo/valorización, persistencia, envío, retry o idempotencia.
- D.1.4 salvo la coordinación necesaria del foco para el diálogo secundario.
- Historial de Cajero, Detalles, Admin Control, tablas generales, home, login y refactors CSS globales.
- `master`, merges y despliegues.

## 7. Secuencia recomendada de implementación

- **A3**: corregir foco, Tab y Escape en los diálogos anidados y añadir test de navegador.
- **A1**: compactar la tarjeta, cambiar disclosure por IconButton y añadir detalle de productos de solo lectura; validar precios y nulabilidad.
- **A2**: refinar visualmente el diálogo de observaciones dentro del diseño vigente.

Codex puede proponer distinta agrupación técnica si preserva estos alcances y permite validación independiente. Debe **planificar antes de implementar**.

## 8. Criterios de aceptación

- Tarjeta compacta, sin disclosure inline y sin gran espacio artificial; KPIs y calculadora preservados.
- IconButton de productos a la izquierda del de observación; detalle de SKU legible con código, precio y paquete del grupo si aplica, sin RPC extra.
- Motivos y textarea visualmente claros sin cambiar datos enviados.
- Teclado y foco correcto con radios, textarea, botones, Escape y traps anidados; cierre devuelve foco al activador.
- Sin regresión de D.1.4 (Guardar, Descartar, Omitir, Continuar) ni de casos de reconteo.
- `bun test` dirigido/completo según impacto, `bun run lint`, `bun run build`, `git diff --check`, revisión responsive y browser smoke. Nada se declara validado si no se ejecutó.
- Smoke visual humano posterior: ajustes nuevos se registrarán como delta y no se anticiparán cambios por especulación.

**Estado al congelar:** decisiones aprobadas; **Codex baseline y plan pendientes de autorización de implementación**.
