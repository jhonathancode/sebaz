-- =====================================================================
-- Contratos de servicio por ciclos (mensual, bimestral, trimestral…).
-- Un pago fijo con fecha de inicio se vuelve contrato anual: el requerimiento
-- se hace UNA vez (mismo número y fecha en todos los ciclos); cada ciclo tiene
-- su orden (fecha de inicio del ciclo) y su comprobante (fecha de fin del ciclo).
-- Los pagos fijos sin fecha de inicio siguen funcionando mes a mes, como antes.
-- =====================================================================
alter table pagos_fijos add column if not exists periodicidad_meses smallint not null default 1;
alter table pagos_fijos drop constraint if exists pagos_fijos_periodicidad_check;
alter table pagos_fijos add constraint pagos_fijos_periodicidad_check check (periodicidad_meses in (1, 2, 3, 4, 6, 12));
alter table pagos_fijos add column if not exists fecha_inicio date;
alter table pagos_fijos add column if not exists fecha_fin date;
alter table pagos_fijos add column if not exists requerimiento_numero int;
alter table pagos_fijos add column if not exists requerimiento_fecha date;
alter table pagos_fijos add column if not exists requerimiento_anio int;
alter table pagos_fijos drop constraint if exists pagos_fijos_vigencia_check;
alter table pagos_fijos add constraint pagos_fijos_vigencia_check
  check (fecha_inicio is null or (fecha_fin is not null and fecha_fin >= fecha_inicio and extract(year from fecha_fin) = extract(year from fecha_inicio)));

alter table expedientes add column if not exists ciclo_desde date;
alter table expedientes add column if not exists ciclo_hasta date;
alter table expedientes add column if not exists es_ciclo boolean not null default false;

-- Los ciclos del mismo contrato comparten el número del requerimiento: la unicidad vale solo para los requerimientos propios
alter table expedientes drop constraint if exists expedientes_mcp_id_anio_numero_key;
create unique index if not exists expedientes_numero_unico on expedientes (mcp_id, anio, numero) where not es_ciclo;

-- Antes de numerar: si el contrato ya tiene su requerimiento del año, el ciclo nuevo lo reutiliza (número, año y fecha)
create or replace function ciclo_copia_requerimiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.pago_fijo_id is not null and new.ciclo_desde is not null then
    select requerimiento_numero, requerimiento_fecha, requerimiento_anio into p
      from pagos_fijos where id = new.pago_fijo_id and mcp_id = new.mcp_id;
    if p.requerimiento_numero is not null and p.requerimiento_anio = extract(year from new.ciclo_desde)::int then
      new.numero := p.requerimiento_numero;
      new.anio := p.requerimiento_anio;
      new.fecha := p.requerimiento_fecha;
      new.es_ciclo := true;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists expedientes_a_ciclo on expedientes;
create trigger expedientes_a_ciclo before insert on expedientes
  for each row execute function ciclo_copia_requerimiento();

-- El primer ciclo del año fija el requerimiento del contrato
create or replace function ciclo_fija_requerimiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_fijo_id is not null and new.ciclo_desde is not null and not new.es_ciclo then
    update pagos_fijos
       set requerimiento_numero = new.numero, requerimiento_fecha = new.fecha, requerimiento_anio = new.anio
     where id = new.pago_fijo_id and mcp_id = new.mcp_id and requerimiento_numero is null;
  end if;
  return new;
end $$;
drop trigger if exists expedientes_fija_ciclo on expedientes;
create trigger expedientes_fija_ciclo after insert on expedientes
  for each row execute function ciclo_fija_requerimiento();

-- Al renovar el contrato en otro año, el requerimiento se hace de nuevo
create or replace function contrato_renovado() returns trigger
language plpgsql as $$
begin
  if new.fecha_inicio is not null and new.requerimiento_anio is not null
     and extract(year from new.fecha_inicio)::int <> new.requerimiento_anio then
    new.requerimiento_numero := null;
    new.requerimiento_fecha := null;
    new.requerimiento_anio := null;
  end if;
  return new;
end $$;
drop trigger if exists pagos_fijos_renovado on pagos_fijos;
create trigger pagos_fijos_renovado before update on pagos_fijos
  for each row execute function contrato_renovado();
