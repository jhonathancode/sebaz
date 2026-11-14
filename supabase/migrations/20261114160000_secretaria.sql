-- =====================================================================
-- Módulo de Secretaría: oficios, cartas, memorandos, informes, citaciones,
-- constancias, solicitudes, acuerdos de consejo, actas y resoluciones.
--   · sec_documentos = cada documento (borrador → emitido con su N° correlativo → anulado).
--   · sec_modelos    = modelos propios de la MCP (los modelos base vienen en la aplicación).
-- Un documento emitido no se edita (solo se le adjunta el escaneado firmado):
-- si hay un error se anula con motivo y se emite otro. Nada se borra; todo se audita.
-- =====================================================================
alter table mcps drop constraint if exists mcps_modulos_validos;
alter table mcps add constraint mcps_modulos_validos
  check (modulos <@ array['caja_chica','ingresos','almacen','rendicion','contabilidad','registro_civil','secretaria']::text[]);

create table if not exists sec_documentos (
  id                 uuid primary key default gen_random_uuid(),
  mcp_id             uuid not null references mcps(id),
  tipo               text not null check (tipo in ('oficio','carta','memorando','informe','citacion','constancia','solicitud','acuerdo','acta','resolucion')),
  numero             int,
  anio               int not null,
  estado             text not null default 'borrador' check (estado in ('borrador','emitido','anulado')),
  fecha              date not null default (now() at time zone 'America/Lima')::date,
  destinatario       text,
  destinatario_cargo text,
  asunto             text,
  referencia         text,
  cuerpo             text not null default '',
  firmante           text,
  firmante_cargo     text,
  con_copia          text,
  modelo_origen      text,
  anulado_motivo     text,
  archivo_path       text,
  archivo_nombre     text,
  archivo_tipo       text,
  emitido_en         timestamptz,
  emitido_por        uuid references perfiles(id),
  creado_por         uuid default auth.uid() references perfiles(id),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create unique index if not exists sec_documentos_numero on sec_documentos (mcp_id, tipo, anio, numero) where numero is not null;
create index if not exists sec_documentos_lista on sec_documentos (mcp_id, fecha desc, creado_en desc);

create table if not exists sec_modelos (
  id          uuid primary key default gen_random_uuid(),
  mcp_id      uuid not null references mcps(id),
  tipo        text not null check (tipo in ('oficio','carta','memorando','informe','citacion','constancia','solicitud','acuerdo','acta','resolucion')),
  nombre      text not null,
  asunto      text,
  cuerpo      text not null default '',
  activo      boolean not null default true,
  creado_por  uuid default auth.uid() references perfiles(id),
  creado_en   timestamptz not null default now()
);
create index if not exists sec_modelos_mcp on sec_modelos (mcp_id, activo);

-- Reglas de cambio de un documento
create or replace function sec_validar_documento() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  if old.estado = 'anulado' then
    raise exception 'El documento está anulado y no se puede cambiar.';
  end if;
  if new.estado <> old.estado then
    if not ((old.estado = 'borrador' and new.estado in ('emitido', 'anulado')) or (old.estado = 'emitido' and new.estado = 'anulado')) then
      raise exception 'Cambio de estado no permitido: % → %', old.estado, new.estado;
    end if;
    if new.estado = 'anulado' and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
      raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
    end if;
  elsif old.estado = 'emitido' then
    -- Emitido: solo se puede adjuntar el escaneado firmado
    if (to_jsonb(new) - array['archivo_path','archivo_nombre','archivo_tipo','actualizado_en']) is distinct from
       (to_jsonb(old) - array['archivo_path','archivo_nombre','archivo_tipo','actualizado_en']) then
      raise exception 'El documento ya fue emitido: no se puede editar. Anúlelo con motivo y emita otro.';
    end if;
  end if;
  if new.estado = 'borrador' then
    new.anio := extract(year from new.fecha)::int;
  end if;
  return new;
end $$;
drop trigger if exists sec_documentos_validar on sec_documentos;
create trigger sec_documentos_validar before update on sec_documentos for each row execute function sec_validar_documento();

-- Emitir: asigna el número correlativo por tipo y año
create or replace function sec_emitir(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare d sec_documentos%rowtype; n int;
begin
  select * into d from sec_documentos where id = p_id;
  if not found then raise exception 'No existe el documento.'; end if;
  if not puede_registrar(d.mcp_id) then raise exception 'No tiene permiso para emitir documentos.'; end if;
  if d.estado <> 'borrador' then raise exception 'El documento ya fue emitido o anulado.'; end if;
  if coalesce(trim(d.asunto), '') = '' then raise exception 'Escriba el asunto antes de emitir.'; end if;
  if coalesce(trim(regexp_replace(d.cuerpo, '<[^>]*>', '', 'g')), '') = '' then raise exception 'El documento no tiene contenido.'; end if;
  n := siguiente_numero(d.mcp_id, 'sec_' || d.tipo, d.anio);
  update sec_documentos set estado = 'emitido', numero = n, emitido_en = now(), emitido_por = auth.uid() where id = p_id;
  return n;
end $$;
revoke execute on function sec_emitir(uuid) from public, anon;
grant execute on function sec_emitir(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['sec_documentos', 'sec_modelos']
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

-- Se activa para la Municipalidad Centro Poblado Puerto Yurinaki
update mcps
   set modulos = coalesce(modulos, array['caja_chica','ingresos','almacen','rendicion','contabilidad']::text[]) || 'secretaria'
 where nombre ilike '%yurinaki%'
   and not ('secretaria' = any (coalesce(modulos, '{}'::text[])));
