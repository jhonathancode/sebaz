-- Arqueo de caja chica, tarifario de movilidad y planilla de movilidad. Nada se borra: se anula con motivo.

-- 1. Arqueos (acta de conteo del efectivo frente al fondo)
create table if not exists arqueos_caja (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  caja_id         uuid not null references cajas_chicas(id),
  numero          int  not null,
  anio            int  not null,
  fecha           date not null,
  hora            text,
  conteo          jsonb not null default '{}'::jsonb,   -- {"200":0,"100":1,...,"0.10":3}
  efectivo        numeric(12,2) not null default 0,
  comprobantes    numeric(12,2) not null default 0,     -- gastos vigentes al momento del arqueo
  fondo           numeric(12,2) not null default 0,
  diferencia      numeric(12,2) not null default 0,     -- efectivo + comprobantes - fondo
  observaciones   text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (mcp_id, anio, numero)
);
create index if not exists arqueos_caja_caja on arqueos_caja (caja_id);

-- 2. Tarifario de movilidad
create table if not exists tarifas_movilidad (
  id          uuid primary key default gen_random_uuid(),
  mcp_id      uuid not null references mcps(id),
  destino     text not null,
  tipo        text not null check (tipo in ('taxi','urbano')),
  monto       numeric(12,2) not null check (monto > 0),
  activo      boolean not null default true,
  creado_por  uuid default auth.uid() references perfiles(id),
  creado_en   timestamptz not null default now()
);
create index if not exists tarifas_movilidad_mcp on tarifas_movilidad (mcp_id);

-- 3. Planillas de movilidad
create table if not exists planillas_movilidad (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  numero          int  not null,
  anio            int  not null,
  caja_id         uuid references cajas_chicas(id),
  gasto_id        uuid references caja_chica_gastos(id),
  comisionado     text not null,
  documento       text,
  cargo           text,
  motivo          text not null,
  total           numeric(12,2) not null default 0,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (mcp_id, anio, numero)
);
create index if not exists planillas_movilidad_caja on planillas_movilidad (caja_id);

create table if not exists planilla_movilidad_items (
  id           uuid primary key default gen_random_uuid(),
  mcp_id       uuid not null references mcps(id),
  planilla_id  uuid not null references planillas_movilidad(id),
  fecha        date not null,
  destino      text not null,
  motivo       text,
  tipo         text not null check (tipo in ('taxi','urbano')),
  monto        numeric(12,2) not null check (monto > 0),
  creado_en    timestamptz not null default now()
);
create index if not exists planilla_movilidad_items_pl on planilla_movilidad_items (planilla_id);

do $$
declare t text;
begin
  foreach t in array array['arqueos_caja','tarifas_movilidad','planillas_movilidad','planilla_movilidad_items']
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
