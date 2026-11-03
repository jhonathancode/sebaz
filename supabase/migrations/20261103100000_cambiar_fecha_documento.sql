-- =====================================================================
-- Cambiar la fecha de un documento ya creado (expediente, orden,
-- conformidad, entrada al almacén o comprobante de pago): solo con un
-- motivo, y queda registrado quién, cuándo, la fecha anterior y la nueva.
-- =====================================================================
create table if not exists cambios_fecha (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  expediente_id   uuid references expedientes(id),
  tabla           text not null,
  registro_id     uuid not null,
  documento       text not null,
  fecha_anterior  date not null,
  fecha_nueva     date not null,
  motivo          text not null check (length(trim(motivo)) >= 10),
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists cambios_fecha_exp on cambios_fecha (expediente_id, creado_en desc);
alter table cambios_fecha enable row level security;
drop policy if exists cambios_fecha_ver on cambios_fecha;
create policy cambios_fecha_ver on cambios_fecha for select using (es_miembro(mcp_id) or es_soporte());
drop policy if exists cambios_fecha_crear on cambios_fecha;
create policy cambios_fecha_crear on cambios_fecha for insert with check (puede_registrar(mcp_id));
drop trigger if exists cambios_fecha_sin_borrado on cambios_fecha;
create trigger cambios_fecha_sin_borrado before update or delete on cambios_fecha for each row execute function prohibir_borrado();
drop trigger if exists cambios_fecha_auditoria on cambios_fecha;
create trigger cambios_fecha_auditoria after insert on cambios_fecha for each row execute function registrar_auditoria();

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
    -- Cambio de fecha con motivo: solo lo autoriza la función cambiar_fecha_documento
    if current_setting('zebaz.cambio_fecha', true) = '1' then
      libres := array_append(libres, 'fecha');
    end if;
    if (to_jsonb(new) - libres) is distinct from (to_jsonb(old) - libres) then
      raise exception 'El documento ya no está en borrador: no se puede editar. Devuélvalo o anúlelo.';
    end if;
  end if;
  return new;
end $$;

create or replace function cambiar_fecha_documento(p_tipo text, p_id uuid, p_fecha date, p_motivo text)
returns void language plpgsql security invoker as $$
declare
  v_tabla text; v_nombre text; v_mcp uuid; v_exp uuid; v_vieja date; v_anio int; v_estado text; v_anulado boolean;
begin
  if coalesce(length(trim(p_motivo)), 0) < 10 then
    raise exception 'Escriba el motivo del cambio de fecha (mínimo 10 caracteres).';
  end if;
  v_tabla := case p_tipo
    when 'expediente' then 'expedientes' when 'orden' then 'ordenes' when 'conformidad' then 'conformidades'
    when 'nea' then 'notas_entrada' when 'comprobante' then 'comprobantes_pago' end;
  v_nombre := case p_tipo
    when 'expediente' then 'Requerimiento / expediente' when 'orden' then 'Orden' when 'conformidad' then 'Memorando de conformidad'
    when 'nea' then 'Entrada al almacén (NEA)' when 'comprobante' then 'Comprobante de pago' end;
  if v_tabla is null then raise exception 'Documento no válido.'; end if;

  execute format('select mcp_id, fecha, anio, %s from %I where id = $1',
    case when p_tipo = 'expediente' then 'id' else 'expediente_id' end, v_tabla)
    into v_mcp, v_vieja, v_anio, v_exp using p_id;
  if v_mcp is null then raise exception 'No se encontró el documento.'; end if;
  if not tiene_rol(v_mcp, array['admin','tesorero','alcalde']::rol_mcp[]) then
    raise exception 'Solo el administrador, el tesorero o el alcalde pueden cambiar fechas.';
  end if;
  if p_fecha = v_vieja then raise exception 'La fecha elegida es la misma que ya tiene.'; end if;
  if extract(year from p_fecha)::int <> v_anio then
    raise exception 'La nueva fecha debe ser del mismo año (%) del documento, por su numeración.', v_anio;
  end if;
  if p_tipo in ('expediente', 'comprobante') then
    execute format('select estado::text from %I where id = $1', v_tabla) into v_estado using p_id;
    if v_estado = 'rendido' then
      raise exception 'Este documento ya está rendido: anule primero la rendición para cambiar su fecha.';
    end if;
  end if;

  perform set_config('zebaz.cambio_fecha', '1', true);
  execute format('update %I set fecha = $1 where id = $2', v_tabla) using p_fecha, p_id;
  perform set_config('zebaz.cambio_fecha', '0', true);

  insert into cambios_fecha (mcp_id, expediente_id, tabla, registro_id, documento, fecha_anterior, fecha_nueva, motivo)
  values (v_mcp, v_exp, v_tabla, p_id, v_nombre, v_vieja, p_fecha, trim(p_motivo));
end $$;
grant execute on function cambiar_fecha_documento(text, uuid, date, text) to authenticated;
notify pgrst, 'reload schema';
