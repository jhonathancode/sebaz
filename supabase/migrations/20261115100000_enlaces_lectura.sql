-- Enlaces de solo lectura para el alcalde, regidores o fiscalizadores: ven la rendición sin crear cuenta.
-- Solo se guarda el hash del enlace; nada se borra: se revoca con motivo.
create table if not exists enlaces_lectura (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  nombre          text not null,
  token_hash      text not null unique,
  activo          boolean not null default true,
  revocado_motivo text,
  ultimo_acceso   timestamptz,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists enlaces_lectura_mcp on enlaces_lectura (mcp_id);

alter table enlaces_lectura enable row level security;
drop policy if exists enlaces_lectura_ver on enlaces_lectura;
create policy enlaces_lectura_ver on enlaces_lectura for select using (tiene_rol(mcp_id, array['admin']::rol_mcp[]));
drop policy if exists enlaces_lectura_crear on enlaces_lectura;
create policy enlaces_lectura_crear on enlaces_lectura for insert with check (tiene_rol(mcp_id, array['admin']::rol_mcp[]));
drop policy if exists enlaces_lectura_editar on enlaces_lectura;
create policy enlaces_lectura_editar on enlaces_lectura for update using (tiene_rol(mcp_id, array['admin']::rol_mcp[])) with check (tiene_rol(mcp_id, array['admin']::rol_mcp[]));
drop trigger if exists enlaces_lectura_auditoria on enlaces_lectura;
create trigger enlaces_lectura_auditoria after insert or update on enlaces_lectura for each row execute function registrar_auditoria();
drop trigger if exists enlaces_lectura_sin_borrado on enlaces_lectura;
create trigger enlaces_lectura_sin_borrado before delete on enlaces_lectura for each row execute function prohibir_borrado();
