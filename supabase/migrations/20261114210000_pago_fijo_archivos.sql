-- Documentos permanentes de un pago fijo (DNI, credencial, contrato…): se suben una vez y valen para todos los meses.
-- Los expedientes de ese pago fijo salen con ellos ya marcados. Nada se borra: al cambiarlos el anterior queda anulado.
create table if not exists pago_fijo_archivos (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  pago_fijo_id    uuid not null references pagos_fijos(id),
  tipo            text not null,
  archivo_path    text not null,
  archivo_nombre  text,
  archivo_tipo    text,
  archivo_tamano  bigint,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists pago_fijo_archivos_pf on pago_fijo_archivos (pago_fijo_id);

alter table pago_fijo_archivos enable row level security;
drop policy if exists pago_fijo_archivos_ver on pago_fijo_archivos;
create policy pago_fijo_archivos_ver on pago_fijo_archivos for select using (es_miembro(mcp_id));
drop policy if exists pago_fijo_archivos_crear on pago_fijo_archivos;
create policy pago_fijo_archivos_crear on pago_fijo_archivos for insert with check (puede_registrar(mcp_id));
drop policy if exists pago_fijo_archivos_editar on pago_fijo_archivos;
create policy pago_fijo_archivos_editar on pago_fijo_archivos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));
drop trigger if exists pago_fijo_archivos_auditoria on pago_fijo_archivos;
create trigger pago_fijo_archivos_auditoria after insert or update on pago_fijo_archivos for each row execute function registrar_auditoria();
drop trigger if exists pago_fijo_archivos_sin_borrado on pago_fijo_archivos;
create trigger pago_fijo_archivos_sin_borrado before delete on pago_fijo_archivos for each row execute function prohibir_borrado();
