-- El cheque con el que se abrió la caja chica pasa al comprobante de pago de su liquidación
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
  select nombre into v_resp from perfiles where id = v_caja.responsable_id;

  insert into comprobantes_pago (mcp_id, anio, fecha, origen, caja_id, fuente_id, beneficiario,
                                 concepto, importe, partida, funcion, categoria, cheque)
  values (v_caja.mcp_id, left(v_caja.periodo, 4)::int,
          least(current_date, (to_date(v_caja.periodo, 'YYYY-MM') + interval '1 month - 1 day')::date),
          'caja_chica', p_caja, v_caja.fuente_id, coalesce(v_resp, 'Responsable del fondo'),
          'Liquidación de caja chica ' || v_caja.periodo, v_total, '2.3 Bienes y servicios',
          'Administrativa del Estado', 'Gastos operativos diversos', v_caja.numero_cheque)
  returning id into v_cp;

  update cajas_chicas set estado = 'liquidada', comprobante_id = v_cp where id = p_caja;
  return v_cp;
end $$;

-- Cajas ya liquidadas: copiar el cheque al comprobante si este aún no lo tiene
update comprobantes_pago cp set cheque = c.numero_cheque
from cajas_chicas c
where c.comprobante_id = cp.id and cp.cheque is null and c.numero_cheque is not null;
