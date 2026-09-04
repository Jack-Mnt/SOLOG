# C4 — Smoke humano Cajero V4

Estado: **PENDIENTE — smoke test humano por dispositivo autorizado**.

Bloque Cajero: **IMPLEMENTACIÓN TÉCNICA COMPLETADA — VALIDACIÓN HUMANA PENDIENTE**. C4 aprobada técnicamente; ejecución de esta guía diferida a integración final. No bloquea D1–D3, A1–A6 ni fases de integración independientes. Es gate obligatorio del cierre definitivo de G3, cierre global y S10 / retirada definitiva de superficies legacy relacionadas. No existe todavía validación E2E aprobada contra producción.

C4 puede aprobarse técnicamente con pruebas automatizadas/simuladas. El cierre definitivo de Cajero y el gate C4/G3 requieren este reporte humano. Codex no ha ejecutado este flujo en producción ni alterado dispositivos, snapshots, sesiones o datos backend.

Contrato: `SOLOG_Backend_Contratos_Optimizacion_Global_V4.md`; las APIs mantienen `contract_version = 2`.

## 1. Preparación y seguridad

1. Usa el navegador/perfil habitual del **dispositivo SOLOG ya autorizado**. No incógnito, no borres almacenamiento, no copies tokens desde otro equipo y no simules autorización.
2. Ingresa con **tu cuenta cajero activa asignada a la sede de ese dispositivo**. Mantén esa misma cuenta y sede durante ambas sesiones: el historial es del usuario, no de todos los cajeros. No uses admin/moderador para capturar.
3. Anota usuario (identificador, sin contraseña), sede que muestra la cabecera, fecha/hora Lima y versión frontend desplegada. No se prescribe Huaca ni otro usuario: no se ha verificado una autorización actual para una sede concreta.
4. Coordina con el responsable de la sede una ventana de conteo normal. No debe haber otra sesión activa que impida iniciar. No cierres sesiones ajenas ni cambies permisos para conseguirlo.
5. Para recorrer **Revisar e Historial**, la navegación vigente requiere cobertura del período completa. Si aún está incompleta, termina el trabajo real pendiente siguiendo el procedimiento habitual; puedes usar el último grupo pendiente adecuado para la primera captura del smoke. No marques grupos ficticiamente para llegar al 100 %. Si no es viable, el smoke queda pendiente de condiciones operativas, no se fuerza.
6. Mantén el equipo activo: la inactividad de 20 minutos puede finalizar la sesión. No cambies el reloj del dispositivo para probar vencimientos. No recargues ni cierres el navegador con borradores o envíos inciertos.

Para evidencia técnica, puedes abrir **DevTools → Network**, activar Preserve log y filtrar por `rpc_solog_cashier`. Úsalo exclusivamente para observar requests/responses normales de la UI. No “Edit and resend”, no ejecutar RPC en consola. No compartas HAR sin sanitizar: elimina Authorization, JWT, cookies y `device_token`.

## 2. Snapshot vigente y punto de partida

1. En **Inicio**, pulsa **Actualizar** solo si necesitas una lectura explícita actualizada. No lo hagas con un envío pendiente.
2. Comprueba la sede de la cabecera, el indicador **Stock actualizado** (o su banda temporal), y abre el indicador para consultar la vigencia.
3. En la respuesta de `rpc_solog_cashier_bootstrap_v2`, registra:
   - `contract_version:2`, `generated_at` y `server_now`;
   - `identity.id`, `site.id`, `device.autorizado:true`;
   - `start_capability.allowed:true`, `snapshot_id`, `snapshot_at`, `confirmado_at`, `snapshot_expira_at`;
   - `panel_state.source:"pre_session"`, `frozen:false`, `session:null`, `basis` y KPI iniciales.
4. Exige snapshot confirmado y vigente **en este momento**, con más de cinco minutos hasta vencimiento y margen cómodo para terminar. La habilitación autoritativa es `start_capability.allowed`; no basta una captura antigua del indicador.
5. Si no está vigente, espera o solicita al operador responsable una actualización **normal** desde ConeXion y vuelve a consultar. No generes snapshots artificiales ni uses SQL. Si hay conflicto de sesión o dispositivo, resuélvelo por el procedimiento operativo habitual antes del smoke.

## 3. Primera sesión — start y save_batch

1. Pulsa **Iniciar conteo** en Inicio. Debe producirse `rpc_solog_cashier_mutate_v2` con acción `start`.
2. Comprueba que aparece **Sesión congelada**. Registra `state.session.id` como **S1**, su `expira_at`, snapshot, versión de catálogo, revisión de grupos, período y `state.kpis`. Estos datos reemplazan la proyección previa.
3. En **Conteo** (o **Conteo diario**, según cobertura), elige tipo de stock, categoría y grupo. Cuenta físicamente **todos los SKU integrantes** indicados. Introduce el total real en la calculadora y pulsa **Continuar**. Cierra el diálogo cuando corresponda.
4. Antes de enviar, el valor es borrador en memoria: debe verse en pendientes de envío; todavía no es un guardado confirmado.
5. Pulsa **Enviar conteo** una vez. Espera respuesta de `save_batch`. Confirma que el pendiente desaparece solo al recibirse éxito, que `items[]` identifica el grupo/detalle y que la UI toma los KPI de `state.kpis`.
6. Para un grupo antes no cubierto: `count_pending` disminuye, `coverage_counted` aumenta y `coverage_percent` refleja el nuevo valor; `groups_total` permanece igual al inicio de S1. Un grupo ya cubierto no obliga a aumentar cobertura. No esperes avance de KPI antes de enviar.
7. Guarda el `detalle_id`, `contado_at`, stock teórico/físico, diferencia y estado devueltos.

### Conseguir una diferencia sin falsear datos

Busca, durante el conteo habitual, un grupo cuya existencia física real difiera de la referencia congelada. Un movimiento real y autorizado ocurrido después del snapshot puede producir esa diferencia; registra únicamente el total efectivamente contado y conserva el comprobante normal del movimiento si existe.

**No ingreses “una unidad menos” solo para provocar Recontar; no retires mercancía ni alteres ventas/inventario para fabricar el caso.** Si todo coincide y no aparece una diferencia real, no hay una forma honesta de garantizar esta rama en producción: registra ese resultado y espera un caso operativo apropiado.

Un primer snapshot posterior puede convertir el caso automáticamente a **Coincide** si su stock coincide con el primer conteo. Eso es un resultado válido del Motor, pero ese caso ya no sirve para probar reconteo; hará falta otro caso real que siga **Recontar**.

## 4. Prohibición dentro de la sesión de origen

Antes de finalizar S1:

1. Conserva su ID y el detalle recién guardado. Si **Revisar** está disponible, ábrelo y busca ese grupo.
2. El detalle recién contado **no debe ofrecer un reconteo ejecutable dentro de S1**. No debe entrar en la cola elegible de esa sesión; tampoco debe reaparecer como conteo normal pendiente.
3. Si el primer snapshot posterior todavía no existe, anótalo: la indisponibilidad por sí sola no demuestra un rechazo backend por “misma sesión”.
4. No fuerces una RPC ni cambies el DOM. Si por una regresión la UI ofreciera ejecutar ese reconteo, detén la prueba y conserva evidencia. El error contractual esperado es `SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN`.
5. Registra la comprobación como **prohibición UI verificada**. No declares observado el error real de backend si la UI, correctamente, no envió la petición. La defensa del frontend y ese código se cubren además mediante pruebas simuladas/inspección contractual; una certificación adicional del rechazo backend real debe coordinarse con ChatGPT/Supabase en un entorno autorizado, no mediante bypass en producción.

## 5. Finish, snapshot posterior y nueva sesión

1. Asegura pendientes de envío en cero y pulsa **Finalizar conteo**. Observa `finish`, estado final y el bootstrap posterior que vuelve a **Vista previa · sin sesión iniciada**.
2. El estado normal de S1 será `finalizado`. Si venció, `expirado` es válido para la prueba de expiración/cierre y conserva registros confirmados, pero no demuestra el happy path completo: repite las partes faltantes con referencia vigente.
3. **Ahora espera el snapshot posterior normal de ConeXion**, confirmado, de la misma sede y capturado después de `contado_at` del caso. No basta publicar nuevamente un snapshot capturado antes del conteo.
4. Pulsa **Actualizar** para conocer el estado nuevo. Comprueba otra vez vigencia y autorización. Para el caso a recontar, el historial debe exponer `primer_snapshot_posterior_id` no nulo y seguir en `Recontar`, sin `stock_reconteo`. En la proyección debe aparecer en `review_queue`.
5. Si se resolvió como Coincide, registra la resolución correcta y busca otro caso real. Si aún no hay snapshot posterior o no es elegible, espera; no lo reconstruyas en frontend ni lo fuerces.
6. En Inicio pulsa **Iniciar conteo**. Registra el ID **S2**, distinto de S1, iniciado después de S1. Comprueba que el caso está en `state.review_queue` y no en `count_queue`. La sesión S2 congela su propia referencia; nunca modifica retroactivamente S1.

## 6. Recount_start y recount_save desde la UI

1. En S2 abre **Revisar** y pulsa **Revisar [nombre del grupo]**.
2. Al abrir la captura debe ejecutarse `recount_start` con S2 y el `detalle_id` original. Registra `snapshot_reconteo_id` y `stock_teorico_reconteo`; no tiene por qué existir una propiedad `state` en esta acción.
3. Cuenta físicamente otra vez los SKU y escribe el total real. Pulsa **Guardar** en el diálogo. Esta acción ejecuta `recount_save`, no el batch de conteo normal.
4. Comprueba el resultado final autoritativo:
   - **Coincide**: diferencia de reconteo cero.
   - **Confirmada**: diferencia inicial y de reconteo del mismo signo; resultado según el Motor.
   - **Inconsistente**: signo opuesto; resultado según el Motor.
5. No necesitas fabricar los tres resultados: cualquiera que corresponda a la realidad y al backend permite validar esta rama. Registra diferencia final y fecha de reconteo.
6. Cierra el diálogo. El caso debe dejar de estar pendiente de revisión según `state.review_queue/kpis`. No debe duplicarse cobertura por recontarlo. El denominador de S2 permanece congelado.
7. Pulsa **Finalizar conteo**, con cero pendientes. Confirma respuesta y regreso al estado pre-sesión.

## 7. Historial, caché, KPI y evidencias de aprobación

- En **Historial → Hoy/Ayer**, verifica la fecha Lima que se muestra y la hora del conteo original. Un caso contado ayer y recontado hoy sigue perteneciendo a **Ayer**.
- Expande el caso con **+**: stock de referencia, conteo, stock posterior, reconteo, hora y estado deben coincidir con las respuestas. Los valores no disponibles aparecen como “—”.
- Alterna Hoy/Ayer y navega dentro de Cajero: cada período ya cargado se reutiliza sin N+1. Una mutación invalida el período afectado; Actualizar puede invalidar los períodos si descubre una revisión externa. Al cambiar el día Lima, no se reutiliza una fecha antigua como Hoy.
- Para comprobar actualizaciones de ConeXion externas, pulsa Actualizar: no se promete polling ni refetch por foco.
- Compara las tarjetas de Inicio con `state.kpis` después de cada guardado. Un replay no debe producir un segundo incremento. No provoques cortes de red reales para este smoke; si ocurre uno, usa el reintento existente, no edites payloads ni UUID.
- Guarda capturas de S1/S2, snapshot inicial/posterior, filas del caso, KPI antes/después, y respuestas sanitizadas de las acciones. Para cada mutación anota acción, operation_id, replay y revisiones, nunca el token.
- Reporte mínimo: usuario/sede/dispositivo verificado; fecha/hora Lima; S1/S2; detalle; snapshots y confirmaciones; resultados de cada paso; prohibición de misma sesión (indicando UI o error backend realmente observado); KPI; errores y reintentos; resultado final.

**Aprobación:** flujo objetivo completado con datos reales, cuenta/sede consistentes, S1 ≠ S2, snapshot posterior válido, reconteo guardado y ambos cierres confirmados, sin duplicados ni deriva de KPI. Si falta una condición operativa o una evidencia, informa exactamente cuál y conserva el gate pendiente. No declares el bloque Cajero definitivamente cerrado hasta reportar y revisar este smoke.
