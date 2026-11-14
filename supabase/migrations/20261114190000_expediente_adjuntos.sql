-- Documentos adjuntos de un expediente (contrato, informe, recibo por honorarios, DNI, credencial, etc.).
-- El archivo va al bucket privado "sustentos" (carpeta = id de la MCP). Nada se borra: se anula con motivo.
create table if not exists expediente_adjuntos (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  expediente_id   uuid not null references expedientes(id),
  tipo            text not null,
  descripcion     text,
  archivo_path    text not null,
  archivo_nombre  text,
  archivo_tipo    text,
  archivo_tamano  bigint,
  anulado         boolean not null default false,
  anulado_motivo  text,
  anulado_por     uuid references perfiles(id),
  anulado_en      timestamptz,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists expediente_adjuntos_exp on expediente_adjuntos (expediente_id);

alter table expediente_adjuntos enable row level security;
drop policy if exists expediente_adjuntos_ver on expediente_adjuntos;
create policy expediente_adjuntos_ver on expediente_adjuntos for select using (es_miembro(mcp_id));
drop policy if exists expediente_adjuntos_crear on expediente_adjuntos;
create policy expediente_adjuntos_crear on expediente_adjuntos for insert with check (puede_registrar(mcp_id));
drop policy if exists expediente_adjuntos_editar on expediente_adjuntos;
create policy expediente_adjuntos_editar on expediente_adjuntos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));
drop trigger if exists expediente_adjuntos_auditoria on expediente_adjuntos;
create trigger expediente_adjuntos_auditoria after insert or update on expediente_adjuntos for each row execute function registrar_auditoria();
drop trigger if exists expediente_adjuntos_sin_borrado on expediente_adjuntos;
create trigger expediente_adjuntos_sin_borrado before delete on expediente_adjuntos for each row execute function prohibir_borrado();
