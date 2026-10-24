-- =====================================================================
-- Anular un expediente en cualquier punto, también completo al 100 %:
-- se anulan, en un solo paso (todo o nada), su comprobante de pago y su
-- NEA, y por último el expediente. Nada se borra. Si el comprobante ya
-- está en una rendición, primero se anula la rendición.
-- =====================================================================
create or replace function anular_expediente_total(p_expediente uuid, p_motivo text)
returns text
language plpgsql as $$
declare
  v_exp expedientes;
  v_cp record;
  v_cps int := 0;
  v_neas int := 0;
  v_cheques text := '';
  v_motivo_hijo text;
begin
  if coalesce(length(trim(p_motivo)), 0) < 10 then
    raise exception 'Escriba un motivo de al menos 10 caracteres.';
  end if;
  select * into v_exp from expedientes where id = p_expediente for update;
  if not found then raise exception 'Expediente no encontrado.'; end if;
  if v_exp.estado = 'anulado' then raise exception 'El expediente ya está anulado.'; end if;
  if not puede_registrar(v_exp.mcp_id) then raise exception 'Sin permiso para anular este expediente.'; end if;

  -- Con un comprobante ya aprobado, solo el alcalde o el administrador anulan
  if exists (select 1 from comprobantes_pago where expediente_id = p_expediente and estado not in ('anulado', 'borrador'))
     and not tiene_rol(v_exp.mcp_id, array['admin', 'alcalde']::rol_mcp[]) then
    raise exception 'El comprobante de pago ya está aprobado: solo el alcalde o el administrador pueden anular el expediente.';
  end if;

  if exists (select 1 from comprobantes_pago where expediente_id = p_expediente and estado = 'rendido') then
    raise exception 'El comprobante de pago ya está en una rendición. Primero anule la rendición (menú Rendición) y luego anule el expediente.';
  end if;

  v_motivo_hijo := 'Se anuló el expediente ' || lpad(coalesce(v_exp.numero, 0)::text, 3, '0') || '-' || v_exp.anio || ': ' || trim(p_motivo);

  for v_cp in select id, cheque from comprobantes_pago where expediente_id = p_expediente and estado <> 'anulado' loop
    update comprobantes_pago set estado = 'anulado', anulado_motivo = v_motivo_hijo where id = v_cp.id;
    v_cps := v_cps + 1;
    if v_cp.cheque is not null then v_cheques := v_cheques || case when v_cheques = '' then '' else ', ' end || v_cp.cheque; end if;
  end loop;

  update notas_entrada set anulado = true, anulado_motivo = v_motivo_hijo where expediente_id = p_expediente and not anulado;
  get diagnostics v_neas = row_count;

  update expedientes set estado = 'anulado', anulado_motivo = trim(p_motivo) where id = p_expediente;

  return v_cps || '|' || v_neas || '|' || v_cheques;
end $$;

revoke execute on function anular_expediente_total(uuid, text) from public, anon;
grant execute on function anular_expediente_total(uuid, text) to authenticated;
