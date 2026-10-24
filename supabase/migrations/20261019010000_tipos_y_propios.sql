-- =====================================================================
-- 1. Tipo de gasto "pago fijo": dietas del alcalde y regidores, personal
--    contratado, servicios mensuales fijos. No lleva cotizaciones, orden
--    ni conformidad: del requerimiento aprobado pasa al comprobante de pago.
-- 2. Ingresos propios como fuente de pago, además de Perené y Chanchamayo.
-- =====================================================================

-- 1. Pago fijo -----------------------------------------------------------
alter table expedientes drop constraint if exists expedientes_tipo_check;
alter table expedientes add constraint expedientes_tipo_check
  check (tipo in ('compra', 'servicio', 'pago_fijo'));

create or replace function validar_cp_expediente() returns trigger
language plpgsql as $$
declare v_tipo text;
begin
  if new.expediente_id is not null then
    select tipo into v_tipo from expedientes where id = new.expediente_id and estado = 'aprobado';
    if v_tipo is null then
      raise exception 'El requerimiento del expediente no está aprobado.';
    end if;
    if v_tipo <> 'pago_fijo'
       and not exists (select 1 from conformidades where expediente_id = new.expediente_id and not anulado) then
      raise exception 'El expediente no tiene conformidad: aún no se puede generar el comprobante de pago.';
    end if;
  end if;
  return new;
end $$;

-- Un pago fijo no lleva cotizaciones ni orden
create or replace function validar_pago_fijo() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from expedientes where id = new.expediente_id and tipo = 'pago_fijo') then
    raise exception 'Un pago fijo no lleva cotizaciones, orden ni conformidad.';
  end if;
  return new;
end $$;
drop trigger if exists cotizaciones_pago_fijo on cotizaciones;
create trigger cotizaciones_pago_fijo before insert on cotizaciones for each row execute function validar_pago_fijo();
drop trigger if exists ordenes_pago_fijo on ordenes;
create trigger ordenes_pago_fijo before insert on ordenes for each row execute function validar_pago_fijo();
drop trigger if exists conformidades_pago_fijo on conformidades;
create trigger conformidades_pago_fijo before insert on conformidades for each row execute function validar_pago_fijo();

-- 2. Ingresos propios como fuente ------------------------------------------
alter table fuentes drop constraint if exists fuentes_tipo_check;
alter table fuentes add constraint fuentes_tipo_check check (tipo in ('distrito', 'provincia', 'propios'));

insert into fuentes (mcp_id, tipo, municipalidad, monto_mensual, formato)
select id, 'propios', 'Ingresos propios (recursos directamente recaudados)', 0, 'general' from mcps
on conflict (mcp_id, tipo) do nothing;

-- Toda MCP nueva nace con su fuente de ingresos propios
create or replace function crear_fuente_propios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into fuentes (mcp_id, tipo, municipalidad, monto_mensual, formato)
  values (new.id, 'propios', 'Ingresos propios (recursos directamente recaudados)', 0, 'general')
  on conflict (mcp_id, tipo) do nothing;
  return new;
end $$;
drop trigger if exists mcps_fuente_propios on mcps;
create trigger mcps_fuente_propios after insert on mcps for each row execute function crear_fuente_propios();

-- La rendición a una municipalidad puede incluir lo pagado con ingresos propios
-- (en el informe de Perené sale aparte, en el punto 2.2)
create or replace function generar_rendicion(p_mcp uuid, p_fuente uuid, p_periodo text, p_comprobantes uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_fuente fuentes; v_malos int; v_propios uuid;
begin
  if not tiene_rol(p_mcp, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para generar la rendición.';
  end if;
  select * into v_fuente from fuentes where id = p_fuente and mcp_id = p_mcp and tipo <> 'propios';
  if not found then raise exception 'La municipalidad que transfiere no pertenece a esta MCP.'; end if;
  if coalesce(array_length(p_comprobantes, 1), 0) = 0 then
    raise exception 'Marque al menos un comprobante de pago.';
  end if;
  select id into v_propios from fuentes where mcp_id = p_mcp and tipo = 'propios';

  select count(*) into v_malos from unnest(p_comprobantes) c(id)
  left join comprobantes_pago cp on cp.id = c.id
  where cp.id is null or cp.mcp_id <> p_mcp
     or (cp.fuente_id <> p_fuente and cp.fuente_id is distinct from v_propios)
     or cp.estado <> 'aprobado' or cp.cheque is null;
  if v_malos > 0 then
    raise exception 'Hay % comprobante(s) que no están aprobados, no tienen cheque o son de otra fuente.', v_malos;
  end if;

  insert into rendiciones (mcp_id, fuente_id, periodo, anio, transferencia)
  values (p_mcp, p_fuente, p_periodo, left(p_periodo, 4)::int, v_fuente.monto_mensual)
  returning id into v_id;

  insert into rendicion_items (mcp_id, rendicion_id, comprobante_id)
  select p_mcp, v_id, c from unnest(p_comprobantes) c;

  update comprobantes_pago set estado = 'rendido' where id = any(p_comprobantes);
  update expedientes e set estado = 'rendido'
    from comprobantes_pago cp
    where cp.id = any(p_comprobantes) and cp.expediente_id = e.id and e.estado = 'aprobado';
  return v_id;
end $$;

-- 3. Los ítems de un requerimiento solo cambian mientras está en borrador -----
create or replace function validar_item_expediente() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from expedientes where id = new.expediente_id and estado = 'borrador') then
    raise exception 'El requerimiento ya fue aprobado: para corregirlo, el alcalde debe devolverlo a borrador.';
  end if;
  return new;
end $$;
drop trigger if exists expediente_items_borrador on expediente_items;
create trigger expediente_items_borrador before insert or update on expediente_items
  for each row execute function validar_item_expediente();
