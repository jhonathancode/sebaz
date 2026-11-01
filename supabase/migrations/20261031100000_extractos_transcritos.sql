-- Estado de cuenta del banco transcrito a mano por la tesorera, con las mismas columnas del original
create table if not exists extractos_transcritos (
  id                    uuid primary key default gen_random_uuid(),
  mcp_id                uuid not null references mcps(id),
  periodo               text not null check (periodo ~ '^\d{4}-\d{2}$'),
  fecha_corte           date,
  fecha_saldo_anterior  date,
  saldo_anterior        numeric(14,2),
  n_movimientos_pdf     int,
  total_cargos_pdf      numeric(14,2),
  total_abonos_pdf      numeric(14,2),
  saldo_actual_pdf      numeric(14,2),
  lineas                jsonb not null default '[]'::jsonb,
  creado_por            uuid default auth.uid() references perfiles(id),
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  unique (mcp_id, periodo)
);

alter table extractos_transcritos enable row level security;
drop policy if exists extractos_transcritos_ver on extractos_transcritos;
create policy extractos_transcritos_ver on extractos_transcritos for select using (es_miembro(mcp_id));
drop policy if exists extractos_transcritos_crear on extractos_transcritos;
create policy extractos_transcritos_crear on extractos_transcritos for insert with check (puede_registrar(mcp_id));
drop policy if exists extractos_transcritos_editar on extractos_transcritos;
create policy extractos_transcritos_editar on extractos_transcritos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists extractos_transcritos_auditoria on extractos_transcritos;
create trigger extractos_transcritos_auditoria after insert or update on extractos_transcritos for each row execute function registrar_auditoria();
drop trigger if exists extractos_transcritos_sin_borrado on extractos_transcritos;
create trigger extractos_transcritos_sin_borrado before delete on extractos_transcritos for each row execute function prohibir_borrado();

notify pgrst, 'reload schema';
