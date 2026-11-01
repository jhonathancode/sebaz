-- =====================================================================
-- Vouchers de depósito de los ingresos propios: la tesorera deposita lo recaudado
-- (a diario, por semana, por quincena o por mes) y sube la foto o el PDF del voucher.
-- Sirven para comprobar que lo depositado cuadra con los recibos emitidos.
-- =====================================================================
create table if not exists depositos_ingresos (
  id               uuid primary key default gen_random_uuid(),
  mcp_id           uuid not null references mcps(id),
  fecha            date not null,
  monto            numeric(12,2) not null check (monto > 0),
  numero_operacion text,
  desde            date,
  hasta            date,
  nota             text,
  archivo_path     text,
  archivo_nombre   text,
  archivo_tipo     text,
  archivo_tamano   int,
  anulado          boolean not null default false,
  anulado_motivo   text,
  creado_por       uuid default auth.uid() references perfiles(id),
  creado_en        timestamptz not null default now()
);
create index if not exists depositos_ingresos_mcp_fecha on depositos_ingresos (mcp_id, fecha);

alter table depositos_ingresos enable row level security;
drop policy if exists depositos_ingresos_ver on depositos_ingresos;
create policy depositos_ingresos_ver on depositos_ingresos for select using (es_miembro(mcp_id));
drop policy if exists depositos_ingresos_crear on depositos_ingresos;
create policy depositos_ingresos_crear on depositos_ingresos for insert with check (puede_registrar(mcp_id));
drop policy if exists depositos_ingresos_editar on depositos_ingresos;
create policy depositos_ingresos_editar on depositos_ingresos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists depositos_ingresos_auditoria on depositos_ingresos;
create trigger depositos_ingresos_auditoria after insert or update on depositos_ingresos for each row execute function registrar_auditoria();
drop trigger if exists depositos_ingresos_sin_borrado on depositos_ingresos;
create trigger depositos_ingresos_sin_borrado before delete on depositos_ingresos for each row execute function prohibir_borrado();
drop trigger if exists depositos_ingresos_anulable on depositos_ingresos;
create trigger depositos_ingresos_anulable before update on depositos_ingresos for each row execute function validar_anulable();

create or replace function validar_deposito_ingresos() returns trigger language plpgsql as $$
begin
  if new.anulado and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
    raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
  end if;
  if new.desde is not null and new.hasta is not null and new.hasta < new.desde then
    raise exception 'La fecha final del periodo que cubre no puede ser anterior a la inicial.';
  end if;
  return new;
end $$;
drop trigger if exists depositos_ingresos_validar on depositos_ingresos;
create trigger depositos_ingresos_validar before insert or update on depositos_ingresos for each row execute function validar_deposito_ingresos();

notify pgrst, 'reload schema';
