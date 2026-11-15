-- Viáticos y comisiones de servicio: tarifario por destino y planilla con pasajes, hospedaje, alimentación y movilidad.
create table if not exists tarifas_viaje (
  id          uuid primary key default gen_random_uuid(),
  mcp_id      uuid not null references mcps(id),
  destino     text not null,
  concepto    text not null check (concepto in ('pasaje','hospedaje','alimentacion','movilidad','otro')),
  detalle     text,
  unidad      text not null check (unidad in ('viaje','noche','dia')),
  monto       numeric(12,2) not null check (monto > 0),
  activo      boolean not null default true,
  creado_por  uuid default auth.uid() references perfiles(id),
  creado_en   timestamptz not null default now()
);
create index if not exists tarifas_viaje_mcp on tarifas_viaje (mcp_id);

create table if not exists comisiones_viaje (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  numero          int  not null,
  anio            int  not null,
  caja_id         uuid references cajas_chicas(id),
  gasto_id        uuid references caja_chica_gastos(id),
  comisionado     text not null,
  documento       text,
  cargo           text,
  destino         text not null,
  motivo          text not null,
  fecha_salida    date not null,
  fecha_retorno   date not null,
  total           numeric(12,2) not null default 0,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (mcp_id, anio, numero),
  check (fecha_retorno >= fecha_salida)
);

create table if not exists comision_viaje_items (
  id          uuid primary key default gen_random_uuid(),
  mcp_id      uuid not null references mcps(id),
  comision_id uuid not null references comisiones_viaje(id),
  concepto    text not null check (concepto in ('pasaje','hospedaje','alimentacion','movilidad','otro')),
  detalle     text,
  cantidad    numeric(8,2) not null check (cantidad > 0),
  precio      numeric(12,2) not null check (precio > 0),
  subtotal    numeric(12,2) not null,
  creado_en   timestamptz not null default now()
);
create index if not exists comision_viaje_items_c on comision_viaje_items (comision_id);

do $$
declare t text;
begin
  foreach t in array array['tarifas_viaje','comisiones_viaje','comision_viaje_items']
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
