-- =====================================================================
-- Corrección: al aprobar un comprobante de pago salía error porque la
-- regla de documentos leía un campo que solo tienen los expedientes
-- (sin_almacen_motivo). Ahora se lee de forma segura en ambas tablas.
-- =====================================================================
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
    if tg_table_name = 'comprobantes_pago' and (to_jsonb(old)->>'cheque') is null then
      libres := array_append(libres, 'cheque');
    end if;
    if (to_jsonb(new) - libres) is distinct from (to_jsonb(old) - libres) then
      raise exception 'El documento ya no está en borrador: no se puede editar. Devuélvalo o anúlelo.';
    end if;
  end if;
  return new;
end $$;
