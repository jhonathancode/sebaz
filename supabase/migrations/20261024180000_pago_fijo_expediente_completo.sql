-- =====================================================================
-- Pagos fijos con expediente completo: todos llevan requerimiento, orden de
-- servicio, memorando de conformidad y comprobante de pago (sin cotizaciones),
-- salvo los que se marquen como simples (dietas del alcalde y regidores:
-- solo requerimiento y comprobante).
-- =====================================================================
alter table pagos_fijos add column if not exists expediente_completo boolean not null default true;
update pagos_fijos set expediente_completo = false where concepto ilike '%dieta%' and expediente_completo;

-- El expediente recuerda con qué flujo nació (los ya hechos no cambian).
alter table expedientes add column if not exists flujo_completo boolean not null default false;

create or replace function fijar_flujo_pago_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'pago_fijo' and new.pago_fijo_id is not null then
    new.flujo_completo := coalesce((select expediente_completo from pagos_fijos where id = new.pago_fijo_id), false);
  end if;
  return new;
end $$;

drop trigger if exists expedientes_fijar_flujo on expedientes;
create trigger expedientes_fijar_flujo before insert on expedientes
  for each row execute function fijar_flujo_pago_fijo();

-- Un pago fijo simple (dietas) no lleva cotizaciones, orden ni conformidad; con expediente completo sí
create or replace function validar_pago_fijo() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from expedientes where id = new.expediente_id and tipo = 'pago_fijo' and not flujo_completo) then
    raise exception 'Un pago fijo simple no lleva cotizaciones, orden ni conformidad.';
  end if;
  return new;
end $$;

-- El comprobante exige conformidad en todo expediente, salvo el pago fijo simple
create or replace function validar_cp_expediente() returns trigger
language plpgsql as $$
declare v_tipo text; v_sin text; v_completo boolean;
begin
  if new.expediente_id is not null then
    select tipo, sin_almacen_motivo, flujo_completo into v_tipo, v_sin, v_completo from expedientes where id = new.expediente_id and estado = 'aprobado';
    if v_tipo is null then
      raise exception 'El requerimiento del expediente no está aprobado.';
    end if;
    if (v_tipo <> 'pago_fijo' or v_completo)
       and not exists (select 1 from conformidades where expediente_id = new.expediente_id and not anulado) then
      raise exception 'El expediente no tiene conformidad: aún no se puede generar el comprobante de pago.';
    end if;
    if v_tipo = 'compra' and v_sin is null
       and not exists (select 1 from notas_entrada where expediente_id = new.expediente_id and not anulado) then
      raise exception 'Primero registre la entrada al almacén (NEA) de los bienes comprados, o indique por qué no pasan por almacén.';
    end if;
  end if;
  return new;
end $$;
