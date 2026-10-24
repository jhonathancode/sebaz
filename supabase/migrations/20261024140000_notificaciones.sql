-- =====================================================================
-- Bandeja de mensajes: avisos automáticos (aprobado, devuelto, anulado,
-- por aprobar) y mensajes del sistema o de soporte. Cada persona ve solo
-- los suyos y solo puede marcarlos como leídos.
-- =====================================================================
create table if not exists notificaciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references perfiles(id),
  mcp_id     uuid references mcps(id),
  tipo       text not null check (tipo in ('aprobado', 'devuelto', 'anulado', 'pendiente', 'sistema', 'mensaje')),
  titulo     text not null,
  detalle    text,
  enlace     text,
  de         uuid references perfiles(id),
  leida_en   timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists notificaciones_user_idx on notificaciones (user_id, creado_en desc);
create index if not exists notificaciones_sin_leer_idx on notificaciones (user_id) where leida_en is null;
alter table notificaciones enable row level security;

drop policy if exists notificaciones_ver on notificaciones;
create policy notificaciones_ver on notificaciones for select using (user_id = auth.uid());
drop policy if exists notificaciones_leer on notificaciones;
create policy notificaciones_leer on notificaciones for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- De un aviso solo se puede cambiar «leída»
create or replace function proteger_notificacion() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'leida_en') is distinct from (to_jsonb(old) - 'leida_en')
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Un aviso solo puede marcarse como leído.';
  end if;
  return new;
end $$;
drop trigger if exists notificaciones_proteger on notificaciones;
create trigger notificaciones_proteger before update on notificaciones for each row execute function proteger_notificacion();
drop trigger if exists notificaciones_sin_borrado on notificaciones;
create trigger notificaciones_sin_borrado before delete on notificaciones for each row execute function prohibir_borrado();

-- Envío (solo lo usan los disparadores de abajo y la aplicación con su clave de servicio)
create or replace function notificar(p_user uuid, p_mcp uuid, p_tipo text, p_titulo text, p_detalle text, p_enlace text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into notificaciones (user_id, mcp_id, tipo, titulo, detalle, enlace, de)
  values (p_user, p_mcp, p_tipo, p_titulo, nullif(trim(coalesce(p_detalle, '')), ''), p_enlace, auth.uid());
end $$;

create or replace function notificar_cargos(p_mcp uuid, p_roles rol_mcp[], p_tipo text, p_titulo text, p_detalle text, p_enlace text, p_excluir uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  for v_user in
    select distinct m.user_id from miembros m
     where m.mcp_id = p_mcp and m.activo and m.rol = any (p_roles)
       and m.desde <= current_date and (m.hasta is null or m.hasta >= current_date)
       and m.user_id is distinct from p_excluir
  loop
    perform notificar(v_user, p_mcp, p_tipo, p_titulo, p_detalle, p_enlace);
  end loop;
end $$;
revoke execute on function notificar(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function notificar_cargos(uuid, rol_mcp[], text, text, text, text, uuid) from public, anon, authenticated;

-- Expedientes: nuevo por aprobar, aprobado, devuelto o anulado
create or replace function notif_expediente() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cod text; v_enlace text;
begin
  v_cod := lpad(coalesce(new.numero, 0)::text, 3, '0') || '-' || new.anio;
  v_enlace := '/expedientes/' || new.id;
  if tg_op = 'INSERT' then
    if new.estado = 'borrador' then
      perform notificar_cargos(new.mcp_id, array['alcalde', 'admin']::rol_mcp[], 'pendiente', 'Requerimiento ' || v_cod || ' por aprobar', left(new.descripcion, 140), '/aprobaciones', auth.uid());
    end if;
    return new;
  end if;
  if new.estado is distinct from old.estado and new.creado_por is distinct from auth.uid() then
    if old.estado = 'borrador' and new.estado = 'aprobado' then
      perform notificar(new.creado_por, new.mcp_id, 'aprobado', 'Requerimiento ' || v_cod || ' aprobado', left(new.descripcion, 140), v_enlace);
    elsif old.estado = 'aprobado' and new.estado = 'borrador' then
      perform notificar(new.creado_por, new.mcp_id, 'devuelto', 'Requerimiento ' || v_cod || ' devuelto para corregir', new.motivo_devolucion, v_enlace);
    elsif new.estado = 'anulado' then
      perform notificar(new.creado_por, new.mcp_id, 'anulado', 'Expediente ' || v_cod || ' anulado', new.anulado_motivo, v_enlace);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists expedientes_notificar on expedientes;
create trigger expedientes_notificar after insert or update on expedientes for each row execute function notif_expediente();

-- Comprobantes de pago: aprobado, devuelto o anulado
create or replace function notif_comprobante() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cod text; v_enlace text;
begin
  if new.estado is distinct from old.estado and new.creado_por is distinct from auth.uid() then
    v_cod := case when new.origen = 'caja_chica' then 'CP-C-' else 'CP-' end || lpad(coalesce(new.numero, 0)::text, 4, '0');
    v_enlace := '/comprobantes/' || new.id;
    if old.estado = 'borrador' and new.estado = 'aprobado' then
      perform notificar(new.creado_por, new.mcp_id, 'aprobado', 'Comprobante ' || v_cod || ' aprobado', left(new.concepto, 140), v_enlace);
    elsif old.estado = 'aprobado' and new.estado = 'borrador' then
      perform notificar(new.creado_por, new.mcp_id, 'devuelto', 'Comprobante ' || v_cod || ' devuelto para corregir', new.motivo_devolucion, v_enlace);
    elsif new.estado = 'anulado' then
      perform notificar(new.creado_por, new.mcp_id, 'anulado', 'Comprobante ' || v_cod || ' anulado', new.anulado_motivo, v_enlace);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comprobantes_notificar on comprobantes_pago;
create trigger comprobantes_notificar after update on comprobantes_pago for each row execute function notif_comprobante();
