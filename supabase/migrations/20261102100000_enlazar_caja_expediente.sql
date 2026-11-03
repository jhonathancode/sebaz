-- =====================================================================
-- Enlazar a una caja chica un expediente que ya existe (con su comprobante
-- de pago y cheque): la caja del mes se abre con ese monto y ese cheque.
-- =====================================================================
create or replace function enlazar_caja_expediente(p_expediente uuid, p_periodo text, p_responsable uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_exp expedientes; v_cp comprobantes_pago; v_caja uuid; v_fuente uuid;
begin
  select * into v_exp from expedientes where id = p_expediente;
  if v_exp.id is null then raise exception 'No se encontró el expediente.'; end if;
  if not tiene_rol(v_exp.mcp_id, array['admin','tesorero','alcalde']::rol_mcp[]) then
    raise exception 'Sin permiso para enlazar la caja chica.';
  end if;
  if v_exp.estado not in ('aprobado', 'rendido') then
    raise exception 'El expediente debe estar aprobado para enlazarlo a la caja chica.';
  end if;
  if exists (select 1 from cajas_chicas where expediente_id = p_expediente and estado <> 'anulada') then
    raise exception 'Este expediente ya está enlazado a una caja chica.';
  end if;
  select * into v_cp from comprobantes_pago
    where expediente_id = p_expediente and estado <> 'anulado' order by creado_en desc limit 1;
  if v_cp.id is null then raise exception 'El expediente aún no tiene comprobante de pago.'; end if;
  if coalesce(trim(v_cp.cheque), '') = '' then raise exception 'El comprobante de pago aún no tiene número de cheque.'; end if;
  v_fuente := coalesce(v_exp.fuente_id, v_cp.fuente_id);
  if v_fuente is null then raise exception 'El expediente no tiene fuente de dinero.'; end if;
  if p_periodo !~ '^\d{4}-\d{2}$' then raise exception 'Mes no válido.'; end if;
  insert into cajas_chicas (mcp_id, periodo, fuente_id, monto_fondo, responsable_id, numero_cheque, expediente_id)
  values (v_exp.mcp_id, p_periodo, v_fuente, v_cp.importe, p_responsable, v_cp.cheque, p_expediente)
  returning id into v_caja;
  return v_caja;
end $$;
grant execute on function enlazar_caja_expediente(uuid, text, uuid) to authenticated;
notify pgrst, 'reload schema';
