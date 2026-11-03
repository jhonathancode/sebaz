-- =====================================================================
-- Caja chica: expediente + comprobante de pago + relación de gastos.
-- Al liquidar NO se genera otro comprobante de pago: el del expediente
-- es el que entra en la rendición, y la relación de gastos lo sustenta.
-- =====================================================================

-- El expediente de caja chica sí lleva comprobante de pago (sin orden ni conformidad)
drop trigger if exists comprobantes_exp_caja on comprobantes_pago;

create or replace function validar_cp_expediente() returns trigger
language plpgsql as $$
declare v_tipo text; v_sin text; v_completo boolean;
begin
  if new.expediente_id is not null then
    select tipo, sin_almacen_motivo, flujo_completo into v_tipo, v_sin, v_completo from expedientes where id = new.expediente_id and estado = 'aprobado';
    if v_tipo is null then
      raise exception 'El requerimiento del expediente no está aprobado.';
    end if;
    if (v_tipo not in ('pago_fijo', 'caja_chica') or v_completo)
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

-- Liquidar: si la caja nació de un expediente, se usa el comprobante de ese expediente
create or replace function liquidar_caja_chica(p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_caja cajas_chicas; v_total numeric; v_cp uuid; v_resp text;
begin
  select * into v_caja from cajas_chicas where id = p_caja for update;
  if not found then raise exception 'Caja chica no encontrada.'; end if;
  if not tiene_rol(v_caja.mcp_id, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para liquidar la caja chica.';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'La caja chica ya no está abierta.'; end if;
  select coalesce(sum(monto), 0) into v_total from caja_chica_gastos where caja_id = p_caja and not anulado;
  if v_total = 0 then raise exception 'La caja chica no tiene gastos.'; end if;

  if v_caja.expediente_id is not null then
    select id into v_cp from comprobantes_pago
      where expediente_id = v_caja.expediente_id and estado <> 'anulado' order by creado_en desc limit 1;
    if v_cp is null then
      raise exception 'Primero genere el comprobante de pago del expediente de esta caja chica: ese es el comprobante que se rinde.';
    end if;
    update cajas_chicas set estado = 'liquidada', comprobante_id = v_cp where id = p_caja;
    return v_cp;
  end if;

  -- Cajas antiguas (sin expediente): se genera el comprobante por lo gastado
  select nombre into v_resp from perfiles where id = v_caja.responsable_id;
  insert into comprobantes_pago (mcp_id, anio, fecha, origen, caja_id, fuente_id, beneficiario,
                                 concepto, importe, partida, funcion, categoria, cheque)
  values (v_caja.mcp_id, left(v_caja.periodo, 4)::int,
          least(current_date, (to_date(v_caja.periodo, 'YYYY-MM') + interval '1 month - 1 day')::date),
          'caja_chica', p_caja, v_caja.fuente_id, coalesce(v_resp, 'Responsable del fondo'),
          'Liquidación de caja chica ' || v_caja.periodo || case when v_caja.numero > 1 then ' (caja ' || v_caja.numero || ')' else '' end, v_total, '2.3 Bienes y servicios',
          'Administrativa del Estado', 'Gastos operativos diversos', v_caja.numero_cheque)
  returning id into v_cp;
  update cajas_chicas set estado = 'liquidada', comprobante_id = v_cp where id = p_caja;
  return v_cp;
end $$;
notify pgrst, 'reload schema';
