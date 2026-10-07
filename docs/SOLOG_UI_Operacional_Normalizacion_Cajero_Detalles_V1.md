# SOLOG — UI Operacional — Normalización Cajero + Detalles — V1

**Estado:** CONGELADO — APROBADO
**Fecha:** 7 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel B — normalización estructural frontend
**Rama:** `admin-work`

## 1. Fuente primaria y precedencia

Este documento es la fuente primaria para la normalización transversal entre Cajero, Detalles y `operational.css`.

Prevalece únicamente para este alcance sobre:
- `docs/SOLOG_UI_Cajero_CSS_Limpieza_Final_Delta_V1.md`
- documentación histórica de Detalles relacionada con composición CSS.

No modifica contratos backend, Motor V4, Supabase, lógica de negocio, navegación ni comportamiento operativo.

## 2. Objetivo

Consolidar patrones CSS ya compartidos o duplicados entre Cajero y Detalles antes del smoke transversal, sin ejecutar todavía el refactor de namespace `cajero-* → operational-*`.

## 3. Decisiones congeladas

### 3.1 Heading compartido

La base común de:
- `cajero-module__heading`
- `details-panel__heading`

se centraliza en `operational.css` mediante selector agrupado.

Los estilos específicos de cada módulo permanecen en su CSS local.

### 3.2 Grid base de métricas

La base común de:
- `cajero-home-metrics`
- `details-metrics`

se centraliza en `operational.css`.

Los breakpoints y variantes específicas permanecen locales.

### 3.3 Alertas

`cajero-alert__dismiss` pasa a `operational.css` porque es consumido por ambos módulos.

Se crea la variante compartida:
- `cajero-alert--success`

Detalles deja de usar `details-notice` para color/semántica de éxito y adopta la variante compartida.

### 3.4 Historial de Detalles

`cajero-history-tabs` se elimina del JSX de Detalles.

El selector de período adopta el primitive compartido vigente:
- `cajero-segmented-control`

No se crea un control nuevo.

### 3.5 Stock no disponible

Se conserva:
- `cajero-stock-card--stale`

y se implementa en `operational.css` como variante Warning:

- borde warning;
- fondo warning-soft;
- icono warning.

No se añade CTA nuevo.

Semántica:
- disponible → success;
- no disponible → warning;
- error operativo → danger.

### 3.6 Limpieza de Detalles

Se eliminan como CSS muerto confirmado:
- `details-actions`;
- `details-actions__buttons`;
- `details-request-status`;
- responsive asociado exclusivamente a esas clases.

Se elimina del JSX:
- `details-device-card__copy`, al no tener estilo ni contrato consumido;
- `cajero-home` en la raíz de Detalles, al no recibir estilo en esa ruta.

### 3.7 operational.css

Se actualiza su comentario de cabecera para reflejar que es la base operacional compartida vigente.

## 4. Fuera de alcance

No realizar:
- renombrado masivo de `cajero-*`;
- creación de namespace `operational-*`;
- refactor arquitectónico del Design System;
- cambios backend/Supabase;
- rediseño de dialogs;
- cambios de responsive no necesarios para la normalización;
- nuevas acciones o CTA;
- cambios funcionales en Cajero o Detalles.

## 5. Validación requerida

- tests dirigidos Cajero + Detalles;
- browser smoke Cajero;
- browser smoke Detalles;
- lint;
- build;
- `git diff --check`;
- smoke humano transversal posterior.
