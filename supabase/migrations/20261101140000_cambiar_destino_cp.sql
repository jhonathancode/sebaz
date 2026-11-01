-- =====================================================================
-- Cambiar a qué municipalidad (Perené / Chanchamayo) se rinde un
-- comprobante de pago. Solo mientras no esté rendido ni anulado, con
-- motivo, y queda en auditoría (valor anterior y nuevo).
-- =====================================================================
alter table comprobantes_pago add column if not exists destino_motivo text;

create or replace function validar_documento() returns trigger
language plpgsql as $$
declare
  libres text[] := array['estado','motivo_devolucion','anulado_motivo','anulado_por','anulado_en',
                         'actualizado_por','actualizado_en','fase','sin_almacen_motivo'];
  v_sin_nuevo text := to_jsonb(new)->>'sin_almacen_motivo';
  v_sin_viejo text := to_jsonb(old)->>'sin_almacen_motivo';
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en  := now();

  if old.estado = 'anulado' then
    raise exception 'El documento está anulado y no se puede cambiar.';
  end if;

  if new.estado <> old.estado then
    if not (
      (old.estado = 'borrador' and new.estado in ('aprobado', 'anulado')) or
      (old.estado = 'aprobado' and new.estado in ('borrador', 'rendido', 'anulado')) or
      (old.estado = 'rendido'  and new.estado = 'aprobado')
    ) then
      raise exception 'Cambio de estado no permitido: % → %', old.estado, new.estado;
    end if;
    if old.estado = 'borrador' and new.estado = 'aprobado'
       and not tiene_rol(new.mcp_id, array['alcalde','admin']::rol_mcp[]) then
      raise exception 'Solo el alcalde o el administrador pueden aprobar.';
    end if;
    if old.estado = 'aprobado' and new.estado = 'borrador'
       and coalesce(trim(new.motivo_devolucion), '') = '' then
      raise exception 'Para devolver un documento escriba el motivo.';
    end if;
    if new.estado = 'anulado' then
      if coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
        raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
      end if;
      new.anulado_por := auth.uid();
      new.anulado_en  := now();
    end if;
  end if;

  if v_sin_nuevo is distinct from v_sin_viejo then
    if v_sin_viejo is not null then
      raise exception 'El motivo de "no pasa por almacén" ya se registró.';
    end if;
    if coalesce(length(trim(v_sin_nuevo)), 0) < 10 then
      raise exception 'Explique en al menos 10 caracteres por qué estos bienes no pasan por almacén.';
    end if;
  end if;

  if old.estado <> 'borrador' then
    if tg_table_name = 'expedientes' and (to_jsonb(old)->>'fuente_id') is null then
      libres := array_append(libres, 'fuente_id');
    end if;
    if tg_table_name = 'comprobantes_pago' and (to_jsonb(old)->>'cheque') is null then
      libres := array_append(libres, 'cheque');
    end if;
    -- Cambio de destino de la rendición: solo lo autoriza la función cambiar_destino_cp
    if tg_table_name = 'comprobantes_pago' and current_setting('zebaz.cambio_destino', true) = '1' then
      libres := libres || array['fuente_id', 'destino_motivo'];
    end if;
    if (to_jsonb(new) - libres) is distinct from (to_jsonb(old) - libres) then
      raise exception 'El documento ya no está en borrador: no se puede editar. Devuélvalo o anúlelo.';
    end if;
  end if;
  return new;
end $$;

create or replace function cambiar_destino_cp(p_cp uuid, p_fuente uuid, p_motivo text)
returns void language plpgsql security invoker as $$
declare v_cp comprobantes_pago; v_fuente fuentes;
begin
  select * into v_cp from comprobantes_pago where id = p_cp;
  if v_cp.id is null then raise exception 'No se encontró el comprobante de pago.'; end if;
  if not tiene_rol(v_cp.mcp_id, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Solo el administrador o el tesorero pueden cambiar el destino.';
  end if;
  if v_cp.estado not in ('borrador', 'aprobado') then
    raise exception 'Este comprobante ya está %: anule primero la rendición para cambiarlo.', v_cp.estado;
  end if;
  select * into v_fuente from fuentes where id = p_fuente and mcp_id = v_cp.mcp_id and tipo <> 'propios';
  if v_fuente.id is null then raise exception 'El destino elegido no es válido.'; end if;
  if v_fuente.id = v_cp.fuente_id then raise exception 'El comprobante ya se rinde a %.', v_fuente.municipalidad; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then
    raise exception 'Escriba el motivo del cambio (mínimo 5 caracteres).';
  end if;
  perform set_config('zebaz.cambio_destino', '1', true);
  update comprobantes_pago set fuente_id = p_fuente, destino_motivo = upper(trim(p_motivo)) where id = p_cp;
  perform set_config('zebaz.cambio_destino', '0', true);
end $$;

grant execute on function cambiar_destino_cp(uuid, uuid, text) to authenticated;
notify pgrst, 'reload schema';
