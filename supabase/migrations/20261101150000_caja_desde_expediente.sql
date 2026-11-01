-- =====================================================================
-- La caja chica se abre desde un expediente: se pide el fondo con un
-- requerimiento («Apertura de caja chica»); al aprobarlo, la caja del mes
-- se abre sola con el monto, el cheque y el responsable del expediente.
-- =====================================================================
alter table expedientes drop constraint if exists expedientes_tipo_check;
alter table expedientes add constraint expedientes_tipo_check
  check (tipo in ('compra', 'servicio', 'pago_fijo', 'caja_chica'));

alter table expedientes add column if not exists caja_periodo text;
alter table expedientes add column if not exists caja_responsable_id uuid references perfiles(id);
alter table cajas_chicas add column if not exists expediente_id uuid references expedientes(id);
create index if not exists cajas_chicas_expediente on cajas_chicas (expediente_id);

-- Un expediente de caja chica no lleva cotizaciones, orden, conformidad ni comprobante propio
-- (el comprobante se genera al liquidar la caja, por lo gastado)
create or replace function validar_expediente_caja() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from expedientes where id = new.expediente_id and tipo = 'caja_chica') then
    raise exception 'El requerimiento de caja chica no lleva cotizaciones, orden, conformidad ni comprobante: el comprobante sale al liquidar la caja.';
  end if;
  return new;
end $$;
drop trigger if exists cotizaciones_exp_caja on cotizaciones;
create trigger cotizaciones_exp_caja before insert on cotizaciones for each row execute function validar_expediente_caja();
drop trigger if exists ordenes_exp_caja on ordenes;
create trigger ordenes_exp_caja before insert on ordenes for each row execute function validar_expediente_caja();
drop trigger if exists conformidades_exp_caja on conformidades;
create trigger conformidades_exp_caja before insert on conformidades for each row execute function validar_expediente_caja();
drop trigger if exists comprobantes_exp_caja on comprobantes_pago;
create trigger comprobantes_exp_caja before insert on comprobantes_pago for each row
  when (new.expediente_id is not null) execute function validar_expediente_caja();

-- Al aprobar el requerimiento, se abre la caja chica del mes
create or replace function abrir_caja_al_aprobar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_monto numeric;
begin
  if new.tipo = 'caja_chica' and new.estado = 'aprobado' and old.estado is distinct from 'aprobado'
     and not exists (select 1 from cajas_chicas where expediente_id = new.id) then
    select coalesce(sum(total), 0) into v_monto from expediente_items where expediente_id = new.id and not anulado;
    if v_monto <= 0 then raise exception 'El requerimiento de caja chica no tiene monto.'; end if;
    if new.fuente_id is null or new.caja_periodo is null or new.caja_responsable_id is null then
      raise exception 'Faltan datos para abrir la caja chica (dinero, mes o responsable).';
    end if;
    insert into cajas_chicas (mcp_id, periodo, fuente_id, monto_fondo, responsable_id, numero_cheque, expediente_id)
    values (new.mcp_id, new.caja_periodo, new.fuente_id, v_monto, new.caja_responsable_id, new.cheque_previsto, new.id);
  end if;
  return new;
end $$;
drop trigger if exists expedientes_abre_caja on expedientes;
create trigger expedientes_abre_caja after update on expedientes
  for each row execute function abrir_caja_al_aprobar();

notify pgrst, 'reload schema';
