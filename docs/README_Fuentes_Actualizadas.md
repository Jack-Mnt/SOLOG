# Paquete de fuentes actualizadas — 2026-08-25

Este ZIP reemplaza las fuentes documentales anteriores del proyecto.

## Archivos

1. `Backend_Decisiones_y_Modelo_DatosV2.md`
2. `Arquitectura_SupabaseV2.md`
3. `Especificaciones_funcionalesV2.md`
4. `SOLOG_Plan_Implementacion_Codex_V2.md`
5. `SOLOG_Decisiones_V2.md`
6. `SOLOG_Logica_Operacional_Conteos_V1.md`

## Autoridad documental

En caso de contradicción con versiones V1 anteriores, estas versiones tienen prioridad.

La lógica de conteos más específica se encuentra en:

```text
SOLOG_Logica_Operacional_Conteos_V1.md
```

y debe prevalecer para:

- periodo quincenal;
- cobertura diaria;
- seguimiento;
- estados;
- reconteos;
- diferencias históricas;
- saldo operativo vigente.

## Cambios importantes frente a las fuentes antiguas

- catálogo vigente V3, 972 SKU, 482 grupos activos;
- incidencias actuales y acciones `ignore_15d`, `deleted`, `reviewed`;
- módulo de catálogo/grupos y publicación por propuestas;
- `withdraw` para retirar aprobación;
- administración de grupos;
- quincena como periodo operativo;
- conteo diario selectivo;
- evaluación `S0 + F0 + S1`;
- histórico no acumulable;
- saldo operativo = última diferencia confirmada;
- ajustes POS intermedios no reinician el periodo;
- histórico como evidencia operativa, no atribución automática.

## Recomendación

Retirar de las fuentes activas las versiones V1 reemplazadas para evitar recuperación de reglas obsoletas.
