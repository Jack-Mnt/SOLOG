# SOLOG — Backend Dashboard: revisión técnica previa a congelación del contrato RPC V1

| Aspecto | Estado |
|---|---|
| Clasificación | Nivel C — revisión de contrato backend ya desplegado, sin cambios funcionales |
| Estado de este documento | **REVISIÓN COMPLETADA / CANDIDATO APTO PARA APROBACIÓN** — no constituye aprobación ni congelación automática por el usuario |
| Fecha | 2026-10-15, America/Lima |
| Backend inspeccionado | Supabase `fvtohxvcvsflzmftgfzs` |
| Rama documental | `Jack-Mnt/SOLOG` → `admin-work`; `master` no intervenida |
| Fuente primaria **funcional** | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` — CONGELADA |
| Delta prevalente funcional | `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` — CONGELADO para su alcance exacto |
| **Contrato API candidato principal** | `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` — DESPLEGADO, PENDIENTE DE APROBACIÓN |
| Referencia técnica reemplazada solo en transporte | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md` — PROPUESTA/HISTÓRICO en cuanto a shapes y campos que divergen de lo desplegado |
| Implementación autoritativa ejecutable | `public.metrics_dashboard_v1` y funciones `inventario.metrics_dashboard_*` en Supabase, migraciones SQL `SOLOG_Backend_Dashboard_Fase6_*.sql` |
| Alcance de esta revisión | Lectura, inspección de firmas y respuestas reales, invariantes SQL y coherencia documental. No implementa frontend ni altera backend |

## 1. Veredicto

**Contrato de transporte: técnicamente coherente, completo para comenzar el preflight frontend tras aprobación explícita del usuario.**

El contrato existente especifica: siete acciones, payloads, campos y tipos, nullables, calidad, roles/grants, errores, límites, ordenación, cursor y condiciones de consistencia. No se encontró una contradicción entre las formas desplegadas y las declaradas que obligue a un nuevo diseño. No se ha cambiado la fórmula de riesgo, el motor de conteos ni la lógica de aprobación de dispositivos.

Este veredicto **no equivale** a validación extremo a extremo con sesión HTTP real y usuario administrador activo. Eso permanece pendiente y debe constar en el plan de integración/smoke.

## 2. Lectura estructural de los siete actions

| Acción | Datos contrastados con SQL | Hallazgo |
|---|---|---|
| `overview` | Cinco sedes; cada site contiene `site_id, site_name, round, accuracy, surplus, shortage, risk` | Conforme |
| `rounds` | `site_id,current,period_rounds,history`; `history` máx. seis, cortes `N/D` | Conforme |
| `risk` | `group_id,group_name,difference,confirmed_value,level,movement_quality,risk_available` | Conforme |
| `episodes` | `episode_id,group_id,group_name,opened_at,closed_at,recurrences_45d,duration_hours,risk_level,risk_status` | Conforme |
| `activity` | `date,turno,status,completed,required,percent,breakdown,quality` por celda | Conforme |
| `day` | `confirmed_differences,confirmed_next_cursor,confirmed_total,date,episodes,observations_initial_cursor,physical_activity,quality,site_id` | Conforme |
| `day_observations` | `group_id,group_name,kind,observation_id,observed_at,physical,physical_difference,result,theoretical` | Conforme |

**Observación:** el total de `day.confirmed_differences` está limitado de forma natural a una fila por grupo elegible y fecha; el contrato deja `confirmed_next_cursor=null`. El detalle de observaciones sí usa paginación. Esta política ya desplegada constituye la resolución técnica del bloqueo B4 del contrato preparatorio.

## 3. Pruebas dirigidas y muestras del 15-10-2026

### Precisión actual

| Sede | Verde | Amarillo | Rojo | Exento 0/0 | Sin evidencia | Universo | Partición |
|---|---:|---:|---:|---:|---:|---:|---|
| Casuarinas | 168 | 41 | 16 | 259 | 4 | 488 | **CORRECTA** |
| Cutervo | 261 | 64 | 18 | 145 | 0 | 488 | **CORRECTA** |
| Divino | 0 | 0 | 0 | 0 | 488 | 488 | **CORRECTA** |
| Huaca | 0 | 0 | 0 | 0 | 488 | 488 | **CORRECTA** |
| Unidad | 0 | 0 | 0 | 0 | 488 | 488 | **CORRECTA** |

Se verificó el invariante `T=G+Y+Rg+Z+S` para las cinco sedes. Para divisiones con denominador cero, los porcentajes son `null` en vez de un valor artificial.

### Rondas

Se inspeccionaron los cinco cortes `nd` de la ronda previa: `h_g/h_r/h_z/h_s/h_u` y `cobertura_acreditadas/exigibles` permanecen `NULL`. No se transformaron en cero los datos no verificables.

### Actividad

Se solicitó una ventana de 15 días para Cutervo: 45 celdas (tres turnos por fecha); las 45 aparecen `no_data`, con `completed/required` nulos. La tabla de Actividad continúa vacía; no se retrocompletó artificialmente.

### Drawer diario

Casuarinas, 07-10-2026: `confirmed_total=4`, `confirmed_differences.length=4`. Cutervo, misma fecha: 0/0 sin afirmación de falsos reconteos. Las observaciones físicas y el resumen usan fecha local Lima y no el turno de la sesión.

### Paginación, permisos y errores (evidencia de Fase 6)

Se conservaron los resultados registrados en `SOLOG_Backend_Dashboard_Fase6_Reporte_V1.md`: Risk 3+3 (sin duplicados), Episodes 5+5 (sin duplicados), Day Observations 4+3 (sin duplicados); errores de limit/fecha/rango y rechazo de roles indebidos simulados con rollback. La presente revisión inspeccionó los grants actuales: `anon=false`, `authenticated=true`, `SECURITY DEFINER=true`, autorización interna por `auth.uid()`, usuario activo, rol y sede.

**Los ensayos con identidad simulada no sustituyen una petición real PostgREST/JWT.** No se cambiaron usuarios durante esta revisión.

## 4. Coherencia de reglas congeladas

- **Calidad:** los 0 operativos tienen semántica distinta de `null/N/D`; no convertir indisponibilidad de Movimiento en riesgo medido. `movement_quality='insufficient'` permite puntaje imputado C=1 sin fingir medición completa.
- **Precisión:** categoría única por grupo, amarillo tiene precedencia sobre confirmación subyacente, y el amarillo no borra el aporte confirmado a Sobrantes/Faltantes/Riesgo si sigue siendo comparable.
- **Rondas:** cortes `as-of` históricos binarios y congelados, sin segmento amarillo. Los hitos no dependen de cambios estructurales posteriores.
- **Episodios:** abiertos/cerrados son hechos físicos, persistencia abierta sin truncar a 45 días; 45 días regula recurrencia y cerrados recientes.
- **Actividad:** compacto por sede/turno, sin tabla adicional, con turnos congelados para la sesión. El cero exigible verificable es `no_tasks`, ausencia de evidencia es `no_data`.
- **Drawer:** consulta de una sola fecha, diferencia confirmada histórica con signo, valorización congelada y observaciones físicas separadas.

## 5. Dependencias y riesgos NO resueltos por el contrato

1. **Smoke Admin real:** `public.usuarios` tiene cero `admin` activos y cero `moderador` activos a fecha de revisión. No activar credenciales ni usuarios sin decisión explícita. Es posible congelar el shape del contrato, pero **no declarar acceso HTTP real validado**.
2. **Flujo operativo actual:** `metrics_actividad_turnos=0`. Pendiente primera sincronización vigente ConeXion V2, primera sesión/reconteo efectivo V5 y cierres naturales de rondas/turnos. Las pruebas SQL de la fase previa ya están documentadas, sin smoke operacional final.
3. **Cursores:** el ancla temporal y keyset no garantizan fotografía MVCC entre páginas distintas si el catálogo o las diferencias cambian mientras se navega. El frontend debe reiniciar al refrescar o recibir cursor vencido y no tratar `total` como constante ante mutaciones concurrentes.
4. **Carga tras C24 real:** los tiempos de Fase 6 fueron medidos predominantemente con insuficiencia de Movimiento; volver a medir después de recopilar intervalos comparables.
5. **Errores por contrato:** las excepciones SQL se transportan como errores PostgREST; los nombres en `SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` son mensajes literales para tipado/mapeo UI. Codex debe inspeccionar el patrón existente de manejo de errores sin cambiar autenticación ni permisos.

Estas dependencias no modifican la estructura JSON ni obligan a congelar cifras de las muestras; las cantidades son **datos observados, no constantes del frontend**.

## 6. Propuesta de decisión y traspaso

1. **Para aprobación del usuario:** declarar `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` como **CONGELADO — FUENTE PRIMARIA DE TRANSPORTE RPC DASHBOARD V1**. Mantener vigente `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` y su delta para semántica funcional. El contrato técnico preliminar pasa a `HISTÓRICO` solo donde difiere.
2. **Después de aprobar:** actualizar el estado en la cabecera del contrato (sin reescribirlo), declarar su precedencia en el prompt para Codex y solicitar **solo baseline y plan frontend**, sin implementar. Alcance: pantalla principal del Dashboard y sus secciones Rondas/Riesgo/Episodios/Actividad/Drawer, integración RPC nueva, tipos explícitos, estados N/D, errores y cursores.
3. **Revisión del plan por el usuario:** Codex no puede tocar backend ni `master`; debe preservar cambios preexistentes en `admin-work`, identificar dependencias UX/DesignSystem vigentes, prohibir refactors globales y reportar bloqueos de forma explícita.
4. **Implementación posterior:** solo tras aprobación del plan. Validaciones dirigidas (tests, lint, build, diff check, UI), revisión global y smoke humano cuando exista autorización Admin real.

**No se congela por la presente revisión y no se ha enviado un prompt de implementación a Codex.**
