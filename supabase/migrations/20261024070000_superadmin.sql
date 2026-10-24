-- =====================================================================
-- Superadmin: el dueño del sistema controla clientes, planes, pagos,
-- usuarios y equipo de soporte. Como soporte, NO ve los gastos ni las
-- rendiciones de las MCP.
-- =====================================================================
alter table perfiles add column if not exists es_superadmin boolean not null default false;

create or replace function es_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_superadmin from perfiles where id = auth.uid()), false);
$$;

-- El superadmin también es soporte
create or replace function es_soporte() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_soporte or es_superadmin from perfiles where id = auth.uid()), false);
$$;

-- Nadie se da a sí mismo soporte o superadmin; solo el superadmin los da
drop policy if exists perfiles_soporte on perfiles;
create policy perfiles_soporte on perfiles for update using (es_soporte()) with check (es_soporte());
create or replace function proteger_roles_perfil() returns trigger
language plpgsql as $$
begin
  if (new.es_soporte is distinct from old.es_soporte or new.es_superadmin is distinct from old.es_superadmin)
     and not es_superadmin() and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Solo el superadmin puede dar o quitar acceso de soporte.';
  end if;
  return new;
end $$;
drop trigger if exists perfiles_roles on perfiles;
create trigger perfiles_roles before update on perfiles for each row execute function proteger_roles_perfil();

-- ---------------------------------------------------------------- planes
create table if not exists planes (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  descripcion     text,
  precio_mensual  numeric(12,2) not null default 0 check (precio_mensual >= 0),
  precio_anual    numeric(12,2) check (precio_anual is null or precio_anual >= 0),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

-- Suscripción vigente de cada MCP (una por MCP)
create table if not exists suscripciones (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null unique references mcps(id),
  plan_id         uuid references planes(id),
  ciclo           text not null default 'mensual' check (ciclo in ('mensual', 'anual')),
  precio          numeric(12,2) not null default 0 check (precio >= 0),
  inicio          date not null default current_date,
  vence_el        date not null default (current_date + 90),
  dias_gracia     int  not null default 10 check (dias_gracia between 0 and 60),
  notas           text,
  actualizado_en  timestamptz not null default now()
);

-- Pagos que hace cada MCP por el sistema
create table if not exists pagos_clientes (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  fecha           date not null default current_date,
  monto           numeric(12,2) not null check (monto > 0),
  meses           int  not null check (meses between 1 and 36),
  desde           date not null,
  hasta           date not null,
  medio           text not null default 'transferencia' check (medio in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro')),
  operacion       text,
  comprobante     text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  registrado_por  uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);

create or replace function registrar_pago_cliente(p_mcp uuid, p_fecha date, p_monto numeric, p_meses int,
                                                  p_medio text, p_operacion text, p_comprobante text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sus suscripciones; v_desde date; v_hasta date; v_id uuid;
begin
  if not es_superadmin() then raise exception 'Solo el superadmin registra pagos.'; end if;
  select * into v_sus from suscripciones where mcp_id = p_mcp for update;
  if not found then raise exception 'La MCP no tiene suscripción.'; end if;
  -- El pago cubre desde el vencimiento actual (o desde hoy, si ya venció hace mucho)
  v_desde := greatest(v_sus.vence_el, coalesce(p_fecha, current_date) - v_sus.dias_gracia);
  v_hasta := (v_desde + make_interval(months => p_meses))::date;
  insert into pagos_clientes (mcp_id, fecha, monto, meses, desde, hasta, medio, operacion, comprobante)
  values (p_mcp, coalesce(p_fecha, current_date), p_monto, p_meses, v_desde, v_hasta, coalesce(p_medio, 'transferencia'),
          nullif(trim(p_operacion), ''), nullif(trim(p_comprobante), ''))
  returning id into v_id;
  update suscripciones set vence_el = v_hasta, actualizado_en = now() where id = v_sus.id;
  update mcps set estado = 'activa' where id = p_mcp and estado in ('por_activar', 'prueba', 'suspendida');
  return v_id;
end $$;

create or replace function anular_pago_cliente(p_pago uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v pagos_clientes;
begin
  if not es_superadmin() then raise exception 'Solo el superadmin anula pagos.'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 10 then raise exception 'Escriba un motivo de al menos 10 caracteres.'; end if;
  select * into v from pagos_clientes where id = p_pago for update;
  if not found or v.anulado then raise exception 'Pago no encontrado o ya anulado.'; end if;
  update pagos_clientes set anulado = true, anulado_motivo = p_motivo where id = p_pago;
  -- Si era el último pago, el vencimiento vuelve exacto a donde estaba; si no, se descuentan sus meses
  update suscripciones set vence_el = case when vence_el = v.hasta then v.desde else (vence_el - make_interval(months => v.meses))::date end,
         actualizado_en = now() where mcp_id = v.mcp_id;
end $$;

-- Toda MCP nueva nace con 3 meses de prueba en el primer plan activo
create or replace function crear_suscripcion_prueba() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan planes;
begin
  select * into v_plan from planes where activo order by creado_en limit 1;
  insert into suscripciones (mcp_id, plan_id, precio, inicio, vence_el)
  values (new.id, v_plan.id, coalesce(v_plan.precio_mensual, 0), current_date, coalesce(new.prueba_hasta, current_date + 90))
  on conflict (mcp_id) do nothing;
  return new;
end $$;
drop trigger if exists mcps_suscripcion_prueba on mcps;
create trigger mcps_suscripcion_prueba after insert on mcps for each row execute function crear_suscripcion_prueba();

-- Permisos
alter table planes enable row level security;
alter table suscripciones enable row level security;
alter table pagos_clientes enable row level security;
drop policy if exists planes_ver on planes;
create policy planes_ver on planes for select using (auth.uid() is not null);
drop policy if exists planes_admin on planes;
create policy planes_admin on planes for all using (es_superadmin()) with check (es_superadmin());
drop policy if exists suscripciones_ver on suscripciones;
create policy suscripciones_ver on suscripciones for select using (es_soporte() or es_miembro(mcp_id));
drop policy if exists suscripciones_editar on suscripciones;
create policy suscripciones_editar on suscripciones for update using (es_superadmin()) with check (es_superadmin());
drop policy if exists pagos_clientes_ver on pagos_clientes;
create policy pagos_clientes_ver on pagos_clientes for select using (es_superadmin() or tiene_rol(mcp_id, array['admin']::rol_mcp[]));

do $$
declare t text;
begin
  foreach t in array array['planes','suscripciones','pagos_clientes'] loop
    execute format('drop trigger if exists %I on %I', t || '_auditoria', t);
    execute format('create trigger %I after insert or update on %I for each row execute function registrar_auditoria()', t || '_auditoria', t);
    execute format('drop trigger if exists %I on %I', t || '_sin_borrado', t);
    execute format('create trigger %I before delete on %I for each row execute function prohibir_borrado()', t || '_sin_borrado', t);
  end loop;
end $$;

revoke execute on function registrar_pago_cliente(uuid, date, numeric, int, text, text, text) from public, anon;
revoke execute on function anular_pago_cliente(uuid, text) from public, anon;
grant execute on function registrar_pago_cliente(uuid, date, numeric, int, text, text, text) to authenticated;
grant execute on function anular_pago_cliente(uuid, text) to authenticated;

-- ------------------------------------------------- datos de arranque
-- Plan inicial (el precio se define desde el superadmin)
insert into planes (nombre, descripcion, precio_mensual)
select 'Plan MCP', 'Expedientes, rendición, caja chica, ingresos, almacén y contabilidad', 0
where not exists (select 1 from planes);

-- Las MCP que ya existen (Puerto Yurinaki, el primer cliente) reciben su suscripción de prueba
insert into suscripciones (mcp_id, plan_id, precio, inicio, vence_el)
select m.id, (select id from planes where activo order by creado_en limit 1), 0, current_date, coalesce(m.prueba_hasta, current_date + 90)
from mcps m
where not exists (select 1 from suscripciones s where s.mcp_id = m.id);
update mcps set estado = 'prueba', prueba_hasta = coalesce(prueba_hasta, current_date + 90) where estado = 'por_activar';

-- El dueño del sistema
update perfiles set es_superadmin = true, es_soporte = true
where id in (select id from auth.users where lower(email) = 'riizhard.perez@gmail.com');
