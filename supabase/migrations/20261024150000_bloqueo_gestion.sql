-- =====================================================================
-- Bloqueo de la gestión anterior al cambiar de tesorería
--   Al registrar el relevo de la tesorera, lo fechado hasta el día anterior
--   al relevo queda de la gestión anterior. Hay 30 días de gracia para
--   corregir (anular o editar) y, pasado ese plazo, queda bloqueado para
--   siempre: nadie puede editarlo, anularlo ni crear documentos con esas fechas.
--   Única excepción: un comprobante aprobado puede pasar a «rendido» (no cambia
--   su contenido), para que no queden sin rendir.
-- =====================================================================
create table if not exists cierres_gestion (
  id             uuid primary key default gen_random_uuid(),
  mcp_id         uuid not null references mcps(id),
  rol            rol_mcp not null default 'tesorero',
  sale           uuid references perfiles(id),
  entra          uuid references perfiles(id),
  relevo_fecha   date not null,
  hasta          date not null,          -- lo fechado hasta este día es de la gestión anterior
  dias_gracia    int  not null default 30,
  bloqueo_desde  date not null,          -- desde este día ya no se toca
  creado_en      timestamptz not null default now()
);
create index if not exists cierres_gestion_mcp_idx on cierres_gestion (mcp_id, hasta);
alter table cierres_gestion enable row level security;
drop policy if exists cierres_gestion_ver on cierres_gestion;
create policy cierres_gestion_ver on cierres_gestion for select using (es_miembro(mcp_id) or es_soporte());
drop trigger if exists cierres_gestion_auditoria on cierres_gestion;
create trigger cierres_gestion_auditoria after insert or update on cierres_gestion for each row execute function registrar_auditoria();
drop trigger if exists cierres_gestion_sin_borrado on cierres_gestion;
create trigger cierres_gestion_sin_borrado before delete on cierres_gestion for each row execute function prohibir_borrado();
drop trigger if exists cierres_gestion_sin_cambios on cierres_gestion;
create trigger cierres_gestion_sin_cambios before update on cierres_gestion for each row execute function prohibir_cambio();

-- Fecha desde la cual está bloqueado un documento de esa fecha (si ya lo está hoy)
create or replace function gestion_bloqueada(p_mcp uuid, p_fecha date) returns date
language sql stable as $$
  select min(c.bloqueo_desde) from cierres_gestion c
   where c.mcp_id = p_mcp and p_fecha is not null and p_fecha <= c.hasta
     and c.bloqueo_desde <= (now() at time zone 'America/Lima')::date;
$$;

create or replace function validar_gestion_cerrada() returns trigger
language plpgsql as $$
declare
  v_libres text[] := array['estado', 'actualizado_por', 'actualizado_en', 'fase'];
begin
  if tg_op = 'UPDATE' then
    -- Rendir no cambia el contenido del documento: se permite
    if (to_jsonb(old)->>'estado') = 'aprobado' and (to_jsonb(new)->>'estado') = 'rendido'
       and (to_jsonb(new) - v_libres) is not distinct from (to_jsonb(old) - v_libres) then
      return new;
    end if;
    if gestion_bloqueada(old.mcp_id, old.fecha) is not null or gestion_bloqueada(new.mcp_id, new.fecha) is not null then
      raise exception 'Este documento es de una gestión anterior (antes del cambio de tesorería) y está bloqueado: ya no se puede editar ni anular.';
    end if;
  else
    if gestion_bloqueada(new.mcp_id, new.fecha) is not null then
      raise exception 'Esa fecha pertenece a una gestión anterior (antes del cambio de tesorería), ya bloqueada: no se pueden registrar documentos con ella.';
    end if;
  end if;
  return new;
end $$;

-- Detalle del expediente (ítems y cotizaciones): se rigen por la fecha del expediente
create or replace function validar_gestion_cerrada_hijo() returns trigger
language plpgsql as $$
declare v_fecha date; v_mcp uuid;
begin
  select e.fecha, e.mcp_id into v_fecha, v_mcp from expedientes e where e.id = coalesce(new.expediente_id, old.expediente_id);
  if v_mcp is not null and gestion_bloqueada(v_mcp, v_fecha) is not null then
    raise exception 'Este expediente es de una gestión anterior (antes del cambio de tesorería) y está bloqueado.';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['expedientes', 'comprobantes_pago', 'caja_chica_gastos', 'ingresos', 'ordenes', 'conformidades', 'notas_entrada', 'pecosas'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists %I on %I', t || '_gestion', t);
      execute format('create trigger %I before insert or update on %I for each row execute function validar_gestion_cerrada()', t || '_gestion', t);
    end if;
  end loop;
  foreach t in array array['expediente_items', 'cotizaciones'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists %I on %I', t || '_gestion', t);
      execute format('create trigger %I before insert or update on %I for each row execute function validar_gestion_cerrada_hijo()', t || '_gestion', t);
    end if;
  end loop;
end $$;

-- El relevo de la tesorera abre el plazo de gracia
create or replace function registrar_relevo(p_mcp uuid, p_sale uuid, p_entra uuid, p_rol rol_mcp, p_fecha date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_bloqueo date;
begin
  if not (es_soporte() or tiene_rol(p_mcp, array['admin']::rol_mcp[])) then
    raise exception 'Sin permiso para registrar el relevo.';
  end if;
  update miembros set hasta = p_fecha - 1, activo = false
    where mcp_id = p_mcp and user_id = p_sale and rol = p_rol and activo;
  insert into miembros (mcp_id, user_id, rol, desde) values (p_mcp, p_entra, p_rol, p_fecha);
  if p_rol = 'tesorero' then
    v_bloqueo := p_fecha + 30;
    insert into cierres_gestion (mcp_id, rol, sale, entra, relevo_fecha, hasta, dias_gracia, bloqueo_desde)
    values (p_mcp, p_rol, p_sale, p_entra, p_fecha, p_fecha - 1, 30, v_bloqueo);
    perform notificar_cargos(
      p_mcp, array['alcalde', 'admin']::rol_mcp[], 'sistema',
      'Cambio de tesorería: la gestión anterior se bloqueará',
      'Los documentos fechados hasta el ' || to_char(p_fecha - 1, 'DD/MM/YYYY') || ' se pueden corregir hasta el ' || to_char(v_bloqueo - 1, 'DD/MM/YYYY')
        || '. Desde el ' || to_char(v_bloqueo, 'DD/MM/YYYY') || ' quedan bloqueados para siempre.',
      '/expedientes', null);
  end if;
end $$;
revoke execute on function registrar_relevo(uuid, uuid, uuid, rol_mcp, date) from public, anon;
grant execute on function registrar_relevo(uuid, uuid, uuid, rol_mcp, date) to authenticated;
