-- =====================================================================
-- Módulo de Registro Civil: padrón de pobladores con su partida adjunta.
--   · rc_registros  = cada acta del padrón (nacimiento, matrimonio, defunción u otro)
--                     con su libro, folio y N° de expediente físico.
--   · rc_archivos   = la partida o constancia escaneada (foto o PDF) de cada acta.
--   · rc_entregas   = cada copia que se entregó a un poblador (quién la pidió y cuándo).
-- Nada se borra: un registro o un archivo mal puesto se anula con su motivo.
-- Todo queda en la auditoría. El módulo se habilita por cliente desde el superadmin.
-- =====================================================================
create extension if not exists pg_trgm;

-- El módulo nuevo se suma a la lista de módulos válidos (no se activa solo a nadie)
alter table mcps drop constraint if exists mcps_modulos_validos;
alter table mcps add constraint mcps_modulos_validos
  check (modulos <@ array['caja_chica','ingresos','almacen','rendicion','contabilidad','registro_civil']::text[]);

-- Texto sin tildes y en minúsculas, para buscar «Peña» escribiendo «pena»
create or replace function rc_norm(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''),
    'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ',
    'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'))
$$;

create table if not exists rc_registros (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  tipo              text not null default 'nacimiento' check (tipo in ('nacimiento', 'matrimonio', 'defuncion', 'otro')),
  numero_acta       text,
  libro             text,
  folio             text,
  expediente        text,                 -- N° de expediente físico donde está la partida
  ubicacion         text,                 -- dónde está guardado (estante, caja, tomo)
  fecha_acto        date,                 -- fecha de nacimiento, matrimonio o defunción
  lugar             text,
  apellido_paterno  text not null,
  apellido_materno  text,
  nombres           text not null,
  dni               text check (dni is null or dni ~ '^[0-9]{8}$'),
  sexo              text check (sexo is null or sexo in ('M', 'F')),
  padre             text,
  madre             text,
  conyuge_nombre    text,
  conyuge_dni       text check (conyuge_dni is null or conyuge_dni ~ '^[0-9]{8}$'),
  observaciones     text,
  origen            text not null default 'fisico' check (origen in ('fisico', 'digital')),
  estado            text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  anulado_motivo    text,
  busqueda          text not null default '',
  creado_por        uuid default auth.uid() references perfiles(id),
  creado_en         timestamptz not null default now()
);
create index if not exists rc_registros_mcp on rc_registros (mcp_id, estado);
create index if not exists rc_registros_dni on rc_registros (mcp_id, dni);
create index if not exists rc_registros_busqueda on rc_registros using gin (busqueda gin_trgm_ops);

create or replace function rc_armar_busqueda() returns trigger
language plpgsql as $$
begin
  new.busqueda := rc_norm(concat_ws(' ', new.apellido_paterno, new.apellido_materno, new.nombres, new.dni,
    new.padre, new.madre, new.conyuge_nombre, new.conyuge_dni, new.numero_acta, new.expediente));
  return new;
end $$;
drop trigger if exists rc_registros_busqueda_trg on rc_registros;
create trigger rc_registros_busqueda_trg before insert or update on rc_registros
  for each row execute function rc_armar_busqueda();

create table if not exists rc_archivos (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  registro_id     uuid not null references rc_registros(id),
  descripcion     text not null default 'Partida',
  archivo_path    text not null,
  archivo_nombre  text,
  archivo_tipo    text,
  archivo_tamano  bigint,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists rc_archivos_registro on rc_archivos (registro_id);

create table if not exists rc_entregas (
  id                  uuid primary key default gen_random_uuid(),
  mcp_id              uuid not null references mcps(id),
  registro_id         uuid not null references rc_registros(id),
  solicitante_nombre  text,
  solicitante_dni     text check (solicitante_dni is null or solicitante_dni ~ '^[0-9]{8}$'),
  motivo              text,
  fecha               date not null default (now() at time zone 'America/Lima')::date,
  creado_por          uuid default auth.uid() references perfiles(id),
  creado_en           timestamptz not null default now()
);
create index if not exists rc_entregas_registro on rc_entregas (registro_id);

-- Permisos: ven los miembros de la MCP; registran los mismos que registran en el resto del sistema
do $$
declare t text;
begin
  foreach t in array array['rc_registros', 'rc_archivos', 'rc_entregas']
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
