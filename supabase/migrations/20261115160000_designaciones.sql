-- Designación de responsables del manejo de fondos (Ley 28693, arts. 7, 9 y 52): quién, con qué resolución y desde cuándo.
create table if not exists designaciones_responsables (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  cargo             text not null,
  nombre            text not null,
  documento         text,
  resolucion        text not null,
  fecha_resolucion  date not null,
  desde             date not null,
  hasta             date,
  observacion       text,
  anulado           boolean not null default false,
  anulado_motivo    text,
  creado_por        uuid default auth.uid() references perfiles(id),
  creado_en         timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);
create index if not exists designaciones_mcp on designaciones_responsables (mcp_id);

alter table designaciones_responsables enable row level security;
drop policy if exists designaciones_ver on designaciones_responsables;
create policy designaciones_ver on designaciones_responsables for select using (es_miembro(mcp_id));
drop policy if exists designaciones_crear on designaciones_responsables;
create policy designaciones_crear on designaciones_responsables for insert with check (tiene_rol(mcp_id, array['admin']::rol_mcp[]));
drop policy if exists designaciones_editar on designaciones_responsables;
create policy designaciones_editar on designaciones_responsables for update using (tiene_rol(mcp_id, array['admin']::rol_mcp[])) with check (tiene_rol(mcp_id, array['admin']::rol_mcp[]));
drop trigger if exists designaciones_auditoria on designaciones_responsables;
create trigger designaciones_auditoria after insert or update on designaciones_responsables for each row execute function registrar_auditoria();
drop trigger if exists designaciones_sin_borrado on designaciones_responsables;
create trigger designaciones_sin_borrado before delete on designaciones_responsables for each row execute function prohibir_borrado();
