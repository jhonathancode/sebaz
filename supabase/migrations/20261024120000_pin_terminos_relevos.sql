-- =====================================================================
-- Responsabilidad en los relevos
--   1. PIN personal y aceptación de términos (tabla privada: solo la
--      aplicación, con su clave de servicio, la lee o escribe).
--   2. Relevos con documento de respaldo (resolución, memorando o acta).
-- =====================================================================
create table if not exists perfil_seguridad (
  user_id             uuid primary key references perfiles(id),
  pin_hash            text,
  pin_actualizado_en  timestamptz,
  pin_intentos        int not null default 0,
  pin_bloqueado_hasta timestamptz,
  acepto_terminos_en  timestamptz,
  acepto_version      text
);
alter table perfil_seguridad enable row level security;
-- Sin políticas: nadie con sesión de usuario la ve ni la cambia.
revoke all on perfil_seguridad from anon, authenticated;

create table if not exists relevos (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  sale              uuid references perfiles(id),
  entra             uuid references perfiles(id),
  rol               rol_mcp not null,
  fecha             date not null,
  documento_tipo    text not null check (documento_tipo in ('resolucion', 'memorando', 'acta', 'otro')),
  documento_numero  text,
  documento_path    text not null,
  confirmado_con    text not null,
  registrado_por    uuid default auth.uid() references perfiles(id),
  creado_en         timestamptz not null default now()
);
alter table relevos enable row level security;
drop policy if exists relevos_ver on relevos;
create policy relevos_ver on relevos for select using (es_soporte() or tiene_rol(mcp_id, array['admin', 'alcalde']::rol_mcp[]));
drop policy if exists relevos_crear on relevos;
create policy relevos_crear on relevos for insert with check (es_soporte());
drop trigger if exists relevos_auditoria on relevos;
create trigger relevos_auditoria after insert or update on relevos for each row execute function registrar_auditoria();
drop trigger if exists relevos_sin_borrado on relevos;
create trigger relevos_sin_borrado before delete on relevos for each row execute function prohibir_borrado();

-- Carpeta privada para los documentos de respaldo
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('relevos', 'relevos', false) on conflict (id) do nothing;
  end if;
end $$;
