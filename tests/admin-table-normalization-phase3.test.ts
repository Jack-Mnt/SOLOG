import { describe, expect, test } from "bun:test";

const source = (path: string) => Bun.file(path).text();

describe("Admin table normalization — Phase 3 Catálogo + Productos", () => {
  test("Catálogo usa main table en propuestas y conserva su tabla auxiliar interna fuera del alcance", async () => {
    const catalog = await source(
      "src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx",
    );

    expect(catalog).toContain(
      'className="admin-main-table admin-catalog__table"',
    );
    expect(catalog).toContain(
      'className="admin-auxiliary-table admin-catalog__table"',
    );
    expect(catalog).toContain('<th scope="col">Tipo</th>');
    expect(catalog).toContain('<th scope="col">Producto</th>');
    expect(catalog).toContain('<th scope="col">Cambio</th>');
    expect(catalog).toContain(
      'className="admin-table-action-cell">Acción</th>',
    );
  });

  test("Catálogo normaliza identidad y acción sin perder lectura accesible de Cambio", async () => {
    const catalog = await source(
      "src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx",
    );

    expect(catalog).toContain("admin-table-cell-stack");
    expect(catalog).toContain("admin-table-cell-primary");
    expect(catalog).toContain("admin-table-cell-secondary");
    expect(catalog).toContain('className="admin-table-actions"');
    expect(catalog).toContain("<IconButton");
    expect(catalog).toContain('title="Ver detalle"');
    expect(catalog).toContain("admin-catalog__change-sr");
    expect(catalog).toContain("cambia a nuevo");
  });

  test("Productos usa main table, precio numérico y contrato común de acciones", async () => {
    const products = await source(
      "src/features/solog/admin/productos/admin.productos.v1.tsx",
    );

    expect(products).toContain('className="admin-main-table"');
    expect(products).not.toContain('<div className="admin-v2-table">');
    expect(products).toContain('className="admin-table-number">Precio</th>');
    expect(products).toContain('<td className="admin-table-number">');
    expect(products).toContain(
      'className="admin-table-action-cell">Acción</th>',
    );
    expect(products).toContain('className="admin-table-actions"');
    expect(products).toContain("variant={");
    expect(products).toContain('? "primary" : "danger"');
    expect(products).toContain("disabled={!!proposalState}");
  });

  test("la composición funcional de ambas tablas permanece congelada", async () => {
    const [catalog, products] = await Promise.all([
      source("src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx"),
      source("src/features/solog/admin/productos/admin.productos.v1.tsx"),
    ]);

    expect(catalog).toMatch(/Tipo[\s\S]*Producto[\s\S]*Cambio[\s\S]*Acción/);
    expect(products).toMatch(
      /Producto[\s\S]*C\. interno[\s\S]*Categoría[\s\S]*Grupo[\s\S]*Precio[\s\S]*Acción/,
    );
  });
});
