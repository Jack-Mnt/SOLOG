alter table inventario.catalogo_supresiones_evidencia enable row level security;

create index if not exists idx_catalogo_supresiones_evidencia_creado_por
  on inventario.catalogo_supresiones_evidencia(creado_por);

create index if not exists idx_catalogo_supresiones_evidencia_revocado_por
  on inventario.catalogo_supresiones_evidencia(revocado_por)
  where revocado_por is not null;

create index if not exists idx_cambios_catalogo_descartado_por
  on inventario.cambios_catalogo(descartado_por)
  where descartado_por is not null;

revoke all on table inventario.catalogo_supresiones_evidencia from anon, authenticated;
