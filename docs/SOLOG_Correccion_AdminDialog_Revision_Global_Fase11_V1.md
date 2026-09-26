# SOLOG — Corrección AdminDialog Revisión Global Fase 11 V1

## Estado

**Estado:** APROBADA / CONGELADA.  
**Clasificación:** Nivel A dentro del bloque Nivel B Admin Dialogs/Drawers.  
**Baseline:** `8428971a1e5af974f103cf47932b25f3b68dda79`.

Esta fuente registra únicamente las correcciones derivadas de la revisión global de Fase 11.

## 1. Dispositivos — error normalizado

La confirmación de dispositivo conserva:

- `kind="confirmation"`;
- contexto mediante `admin-dialog-context`;
- notice informativo;
- Footer y semántica de acciones ya aprobados.

El error local deja de renderizarse como:

```tsx
<p role="alert">{error}</p>
```

y pasa a la superficie normalizada:

```tsx
<AdminNotice tone="error">{error}</AdminNotice>
```

No cambia lógica, retry, store, backend ni semántica de la operación.

## 2. Separar producto — contexto definitivo

Se formaliza como delta respecto de `SOLOG_UI_Admin_Dialogs_Fase6_Gestion_Wide_V1.md`:

La confirmación nested `Separar producto` muestra:

```text
Producto       {producto}
C. interno     {c_interno}
Grupo nuevo    {producto}
```

La etiqueta histórica `Grupo actual` queda reemplazada por `Grupo nuevo`.

Justificación funcional:

- separar mediante `make_unique` convierte el SKU en grupo `Único`;
- el grupo unitario utiliza el nombre operativo actual del producto;
- mostrar `Grupo nuevo` comunica la consecuencia de la acción y coincide con el runtime validado.

No se modifica la mutación `make_unique`, el backend ni la estructura del Footer.

## 3. Precedencia

Este documento prevalece únicamente sobre:

- el error visual de Confirmación de dispositivo en fuentes previas;
- la fila de contexto `Grupo actual` de la confirmación `Separar producto` en Fase 6.

Todo lo demás permanece vigente según sus fuentes congeladas.

> **Fase 11 — correcciones globales congeladas.**
