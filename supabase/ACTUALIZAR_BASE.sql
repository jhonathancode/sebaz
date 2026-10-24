-- =====================================================================
-- ACTUALIZACIÓN DE LA BASE DE DATOS (pegar completo en Supabase > SQL Editor > Run)
-- Incluye: pago fijo, ingresos propios como fuente de pago, corrección de
-- requerimientos y cuadres obligatorios de caja chica y rendición.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;
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

-- =====================================================================
-- Cuadres obligatorios
--   * La caja chica solo se cierra (liquida) cuando lo gastado es igual al
--     fondo asignado.
--   * La rendición a una municipalidad solo se arma cuando los comprobantes
--     pagados con su transferencia suman exactamente el monto transferido.
-- =====================================================================

create or replace function liquidar_caja_chica(p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_caja cajas_chicas; v_total numeric; v_cp uuid; v_resp text;
begin
  select * into v_caja from cajas_chicas where id = p_caja for update;
  if not found then raise exception 'Caja chica no encontrada.'; end if;
  if not tiene_rol(v_caja.mcp_id, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para cerrar la caja chica.';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'La caja chica ya no está abierta.'; end if;
  select coalesce(sum(monto), 0) into v_total from caja_chica_gastos where caja_id = p_caja and not anulado;
  if v_total <> v_caja.monto_fondo then
    raise exception 'La caja chica no cuadra: el fondo es S/ % y lo gastado S/ %. Falta registrar S/ %.',
      to_char(v_caja.monto_fondo, 'FM999G990D00'), to_char(v_total, 'FM999G990D00'),
      to_char(v_caja.monto_fondo - v_total, 'FM999G990D00');
  end if;
  select nombre into v_resp from perfiles where id = v_caja.responsable_id;

  insert into comprobantes_pago (mcp_id, anio, fecha, origen, caja_id, fuente_id, beneficiario,
                                 concepto, importe, partida, funcion, categoria)
  values (v_caja.mcp_id, left(v_caja.periodo, 4)::int,
          least(current_date, (to_date(v_caja.periodo, 'YYYY-MM') + interval '1 month - 1 day')::date),
          'caja_chica', p_caja, v_caja.fuente_id, coalesce(v_resp, 'Responsable del fondo'),
          'Liquidación de caja chica ' || v_caja.periodo, v_total, '2.3 Bienes y servicios',
          'Administrativa del Estado', 'Gastos operativos diversos')
  returning id into v_cp;

  update cajas_chicas set estado = 'liquidada', comprobante_id = v_cp where id = p_caja;
  return v_cp;
end $$;

create or replace function generar_rendicion(p_mcp uuid, p_fuente uuid, p_periodo text, p_comprobantes uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_fuente fuentes; v_malos int; v_propios uuid; v_suma numeric;
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

  -- Lo pagado con la transferencia debe ser igual a lo transferido
  select coalesce(sum(importe), 0) into v_suma from comprobantes_pago
    where id = any(p_comprobantes) and fuente_id = p_fuente;
  if v_suma <> v_fuente.monto_mensual then
    raise exception 'La rendición no cuadra: se transfirió S/ % y los comprobantes marcados suman S/ %. Diferencia: S/ %.',
      to_char(v_fuente.monto_mensual, 'FM999G990D00'), to_char(v_suma, 'FM999G990D00'),
      to_char(v_fuente.monto_mensual - v_suma, 'FM999G990D00');
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

commit;
select 'Base de datos actualizada' as resultado;
