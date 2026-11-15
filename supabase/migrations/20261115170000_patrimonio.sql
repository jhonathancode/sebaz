-- Patrimonio: bienes muebles, inventario anual con acta de conciliación y predios de la MCP. Nada se borra: se da de baja o se anula con motivo.
create table if not exists bienes_patrimonio (
  id                  uuid primary key default gen_random_uuid(),
  mcp_id              uuid not null references mcps(id),
  codigo              text,
  descripcion         text not null,
  marca               text,
  modelo              text,
  serie               text,
  color               text,
  estado_conservacion text not null default 'bueno' check (estado_conservacion in ('bueno','regular','malo')),
  ubicacion           text,
  responsable         text,
  fecha_adquisicion   date,
  valor               numeric(12,2) not null default 0 check (valor >= 0),
  expediente_id       uuid references expedientes(id),
  observacion         text,
  estado              text not null default 'activo' check (estado in ('activo','baja')),
  baja_fecha          date,
  baja_resolucion     text,
  baja_motivo         text,
  creado_por          uuid default auth.uid() references perfiles(id),
  creado_en           timestamptz not null default now()
);
create unique index if not exists bienes_patrimonio_codigo on bienes_patrimonio (mcp_id, codigo) where codigo is not null and codigo <> '';
create index if not exists bienes_patrimonio_mcp on bienes_patrimonio (mcp_id, estado);

create table if not exists inventarios_patrimonio (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  anio            int  not null,
  fecha_cierre    date not null,
  resolucion      text,
  comision        jsonb not null default '[]'::jsonb,
  estado          text not null default 'en_curso' check (estado in ('en_curso','cerrado','anulado')),
  saldo_contable  numeric(12,2),
  informe         text,
  cerrado_en      timestamptz,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create unique index if not exists inventarios_patrimonio_anio on inventarios_patrimonio (mcp_id, anio) where estado <> 'anulado';

create table if not exists inventario_patrimonio_items (
  id                  uuid primary key default gen_random_uuid(),
  mcp_id              uuid not null references mcps(id),
  inventario_id       uuid not null references inventarios_patrimonio(id),
  bien_id             uuid not null references bienes_patrimonio(id),
  resultado           text not null default 'pendiente' check (resultado in ('pendiente','encontrado','no_encontrado')),
  estado_conservacion text,
  observacion         text,
  unique (inventario_id, bien_id)
);

create table if not exists predios_mcp (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  nombre          text not null,
  direccion       text,
  area_m2         numeric(12,2),
  partida         text,
  cus             text,
  uso             text,
  condicion       text not null default 'propiedad' check (condicion in ('propiedad','cesion','posesion','otro')),
  observacion     text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['bienes_patrimonio','inventarios_patrimonio','inventario_patrimonio_items','predios_mcp']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_ver', t);
    execute format('create policy %I on %I for select using (es_miembro(mcp_id))', t || '_ver', t);
    execute format('drop policy if exists %I on %I', t || '_crear', t);
    execute format('create policy %I on %I for insert with check (puede_registrar(mcp_id))', t || '_crear', t);
    execute format('drop policy if exists %I on %I', t || '_editar', t);
    execute format('create policy %I on %I for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id))', t || '_editar', t);
    execute format('drop trigger if exists %I on %I', t || '_auditoria', t);
    execute format('create trigger %I after insert or update on %I for each row execute function registrar_auditoria()', t || '_auditoria', t);
    execute format('drop trigger if exists %I on %I', t || '_sin_borrado', t);
    execute format('create trigger %I before delete on %I for each row execute function prohibir_borrado()', t || '_sin_borrado', t);
  end loop;
end $$;
