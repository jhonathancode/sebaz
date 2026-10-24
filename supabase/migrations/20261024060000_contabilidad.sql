-- =====================================================================
-- Contabilidad
--   Datos que el resto del sistema no tiene y que la contabilidad necesita:
--   * Saldo inicial del año (banco y caja).
--   * Transferencias recibidas (fecha real y N° de operación).
--   * Saldo del extracto bancario de cada mes (conciliación).
--   * Cheques cobrados por el banco (para saber cuáles están en tránsito).
--   Todo lo demás (libro bancos, ejecución, libro diario) se calcula de los
--   comprobantes de pago e ingresos ya registrados.
-- =====================================================================
create table if not exists saldos_iniciales (
  id           uuid primary key default gen_random_uuid(),
  mcp_id       uuid not null references mcps(id),
  anio         int  not null,
  saldo_banco  numeric(12,2) not null default 0,
  saldo_caja   numeric(12,2) not null default 0,
  observacion  text,
  creado_por   uuid default auth.uid() references perfiles(id),
  creado_en    timestamptz not null default now(),
  unique (mcp_id, anio)
);

create table if not exists transferencias_recibidas (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  fuente_id       uuid not null references fuentes(id),
  periodo         text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fecha           date not null,
  monto           numeric(12,2) not null check (monto > 0),
  documento       text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create unique index if not exists transferencia_vigente_unica on transferencias_recibidas (fuente_id, periodo) where not anulado;

create table if not exists conciliaciones (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  periodo         text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  saldo_extracto  numeric(12,2) not null,
  observacion     text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (mcp_id, periodo)
);

create table if not exists cheques_cobrados (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  comprobante_id  uuid not null references comprobantes_pago(id),
  fecha_cobro     date not null,
  anulado         boolean not null default false,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create unique index if not exists cheque_cobrado_unico on cheques_cobrados (comprobante_id) where not anulado;

create or replace function validar_transferencia() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.anulado then raise exception 'La transferencia está anulada y no se puede cambiar.'; end if;
    if new.anulado and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
      raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
    end if;
  end if;
  if not exists (select 1 from fuentes where id = new.fuente_id and mcp_id = new.mcp_id and tipo <> 'propios') then
    raise exception 'La municipalidad que transfiere no pertenece a esta MCP.';
  end if;
  return new;
end $$;
drop trigger if exists transferencias_validar on transferencias_recibidas;
create trigger transferencias_validar before insert or update on transferencias_recibidas
  for each row execute function validar_transferencia();

drop trigger if exists transferencias_recibidas_periodo on transferencias_recibidas;
create trigger transferencias_recibidas_periodo before insert or update on transferencias_recibidas
  for each row execute function validar_periodo_abierto();

do $$
declare t text;
begin
  foreach t in array array['saldos_iniciales','transferencias_recibidas','conciliaciones','cheques_cobrados'] loop
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
