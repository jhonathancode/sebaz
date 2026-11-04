-- =====================================================================
-- ACTUALIZACIÓN DE LA BASE DE DATOS (pegar completo en Supabase > SQL Editor > Run)
-- Incluye: pago fijo, ingresos propios como fuente de pago, corrección de
-- requerimientos, cuadres obligatorios de caja chica y rendición, y fecha
-- límite de la rendición, logo de la MCP, almacén (NEA, PECOSA, stock) y
-- pagos fijos por mes.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;
-- =====================================================================
-- 1. Tipo de gasto "pago fijo": dietas del alcalde y regidores, personal
--    contratado, servicios mensuales fijos. No lleva cotizaciones, orden
--    ni conformidad: del requerimiento aprobado pasa al comprobante de pago.
-- 2. Ingresos propios como fuente de pago, además de Perené y Chanchamayo.
-- =====================================================================

-- 1. Pago fijo -----------------------------------------------------------
alter table expedientes drop constraint if exists expedientes_tipo_check;
alter table expedientes add constraint expedientes_tipo_check
  check (tipo in ('compra', 'servicio', 'pago_fijo'));

create or replace function validar_cp_expediente() returns trigger
language plpgsql as $$
declare v_tipo text;
begin
  if new.expediente_id is not null then
    select tipo into v_tipo from expedientes where id = new.expediente_id and estado = 'aprobado';
    if v_tipo is null then
      raise exception 'El requerimiento del expediente no está aprobado.';
    end if;
    if v_tipo <> 'pago_fijo'
       and not exists (select 1 from conformidades where expediente_id = new.expediente_id and not anulado) then
      raise exception 'El expediente no tiene conformidad: aún no se puede generar el comprobante de pago.';
    end if;
  end if;
  return new;
end $$;

-- Un pago fijo no lleva cotizaciones ni orden
create or replace function validar_pago_fijo() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from expedientes where id = new.expediente_id and tipo = 'pago_fijo') then
    raise exception 'Un pago fijo no lleva cotizaciones, orden ni conformidad.';
  end if;
  return new;
end $$;
drop trigger if exists cotizaciones_pago_fijo on cotizaciones;
create trigger cotizaciones_pago_fijo before insert on cotizaciones for each row execute function validar_pago_fijo();
drop trigger if exists ordenes_pago_fijo on ordenes;
create trigger ordenes_pago_fijo before insert on ordenes for each row execute function validar_pago_fijo();
drop trigger if exists conformidades_pago_fijo on conformidades;
create trigger conformidades_pago_fijo before insert on conformidades for each row execute function validar_pago_fijo();

-- 2. Ingresos propios como fuente ------------------------------------------
alter table fuentes drop constraint if exists fuentes_tipo_check;
alter table fuentes add constraint fuentes_tipo_check check (tipo in ('distrito', 'provincia', 'propios'));

insert into fuentes (mcp_id, tipo, municipalidad, monto_mensual, formato)
select id, 'propios', 'Ingresos propios (recursos directamente recaudados)', 0, 'general' from mcps
on conflict do nothing;

-- Toda MCP nueva nace con su fuente de ingresos propios
create or replace function crear_fuente_propios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into fuentes (mcp_id, tipo, municipalidad, monto_mensual, formato)
  values (new.id, 'propios', 'Ingresos propios (recursos directamente recaudados)', 0, 'general')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists mcps_fuente_propios on mcps;
create trigger mcps_fuente_propios after insert on mcps for each row execute function crear_fuente_propios();

-- La rendición a una municipalidad puede incluir lo pagado con ingresos propios
-- (en el informe de Perené sale aparte, en el punto 2.2)
create or replace function generar_rendicion(p_mcp uuid, p_fuente uuid, p_periodo text, p_comprobantes uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_fuente fuentes; v_malos int; v_propios uuid;
begin
  if not tiene_rol(p_mcp, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para generar la rendición.';
  end if;
  select * into v_fuente from fuentes where id = p_fuente and mcp_id = p_mcp and tipo <> 'propios';
  if not found then raise exception 'La municipalidad que transfiere no pertenece a esta MCP.'; end if;
  if coalesce(array_length(p_comprobantes, 1), 0) = 0 then
    raise exception 'Marque al menos un comprobante de pago.';
  end if;
  select id into v_propios from fuentes where mcp_id = p_mcp and tipo = 'propios';

  select count(*) into v_malos from unnest(p_comprobantes) c(id)
  left join comprobantes_pago cp on cp.id = c.id
  where cp.id is null or cp.mcp_id <> p_mcp
     or (cp.fuente_id <> p_fuente and cp.fuente_id is distinct from v_propios)
     or cp.estado <> 'aprobado' or cp.cheque is null;
  if v_malos > 0 then
    raise exception 'Hay % comprobante(s) que no están aprobados, no tienen cheque o son de otra fuente.', v_malos;
  end if;

  insert into rendiciones (mcp_id, fuente_id, periodo, anio, transferencia)
  values (p_mcp, p_fuente, p_periodo, left(p_periodo, 4)::int, v_fuente.monto_mensual)
  returning id into v_id;

  insert into rendicion_items (mcp_id, rendicion_id, comprobante_id)
  select p_mcp, v_id, c from unnest(p_comprobantes) c;

  update comprobantes_pago set estado = 'rendido' where id = any(p_comprobantes);
  update expedientes e set estado = 'rendido'
    from comprobantes_pago cp
    where cp.id = any(p_comprobantes) and cp.expediente_id = e.id and e.estado = 'aprobado';
  return v_id;
end $$;

-- 3. Los ítems de un requerimiento solo cambian mientras está en borrador -----
create or replace function validar_item_expediente() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from expedientes where id = new.expediente_id and estado = 'borrador') then
    raise exception 'El requerimiento ya fue aprobado: para corregirlo, el alcalde debe devolverlo a borrador.';
  end if;
  return new;
end $$;
drop trigger if exists expediente_items_borrador on expediente_items;
create trigger expediente_items_borrador before insert or update on expediente_items
  for each row execute function validar_item_expediente();

-- =====================================================================
-- Cuadres obligatorios
--   * La caja chica solo se cierra (liquida) cuando lo gastado es igual al
--     fondo asignado.
--   * La rendición a una municipalidad solo se arma cuando los comprobantes
--     pagados con su transferencia suman exactamente el monto transferido.
-- =====================================================================

create or replace function liquidar_caja_chica(p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_caja cajas_chicas; v_total numeric; v_cp uuid; v_resp text;
begin
  select * into v_caja from cajas_chicas where id = p_caja for update;
  if not found then raise exception 'Caja chica no encontrada.'; end if;
  if not tiene_rol(v_caja.mcp_id, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para cerrar la caja chica.';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'La caja chica ya no está abierta.'; end if;
  select coalesce(sum(monto), 0) into v_total from caja_chica_gastos where caja_id = p_caja and not anulado;
  if v_total <> v_caja.monto_fondo then
    raise exception 'La caja chica no cuadra: el fondo es S/ % y lo gastado S/ %. Falta registrar S/ %.',
      to_char(v_caja.monto_fondo, 'FM999G990D00'), to_char(v_total, 'FM999G990D00'),
      to_char(v_caja.monto_fondo - v_total, 'FM999G990D00');
  end if;
  select nombre into v_resp from perfiles where id = v_caja.responsable_id;

  insert into comprobantes_pago (mcp_id, anio, fecha, origen, caja_id, fuente_id, beneficiario,
                                 concepto, importe, partida, funcion, categoria)
  values (v_caja.mcp_id, left(v_caja.periodo, 4)::int,
          least(current_date, (to_date(v_caja.periodo, 'YYYY-MM') + interval '1 month - 1 day')::date),
          'caja_chica', p_caja, v_caja.fuente_id, coalesce(v_resp, 'Responsable del fondo'),
          'Liquidación de caja chica ' || v_caja.periodo, v_total, '2.3 Bienes y servicios',
          'Administrativa del Estado', 'Gastos operativos diversos')
  returning id into v_cp;

  update cajas_chicas set estado = 'liquidada', comprobante_id = v_cp where id = p_caja;
  return v_cp;
end $$;

create or replace function generar_rendicion(p_mcp uuid, p_fuente uuid, p_periodo text, p_comprobantes uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_fuente fuentes; v_malos int; v_propios uuid; v_suma numeric;
begin
  if not tiene_rol(p_mcp, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para generar la rendición.';
  end if;
  select * into v_fuente from fuentes where id = p_fuente and mcp_id = p_mcp and tipo <> 'propios';
  if not found then raise exception 'La municipalidad que transfiere no pertenece a esta MCP.'; end if;
  if coalesce(array_length(p_comprobantes, 1), 0) = 0 then
    raise exception 'Marque al menos un comprobante de pago.';
  end if;
  select id into v_propios from fuentes where mcp_id = p_mcp and tipo = 'propios';

  select count(*) into v_malos from unnest(p_comprobantes) c(id)
  left join comprobantes_pago cp on cp.id = c.id
  where cp.id is null or cp.mcp_id <> p_mcp
     or (cp.fuente_id <> p_fuente and cp.fuente_id is distinct from v_propios)
     or cp.estado <> 'aprobado' or cp.cheque is null;
  if v_malos > 0 then
    raise exception 'Hay % comprobante(s) que no están aprobados, no tienen cheque o son de otra fuente.', v_malos;
  end if;

  -- Lo pagado con la transferencia debe ser igual a lo transferido
  select coalesce(sum(importe), 0) into v_suma from comprobantes_pago
    where id = any(p_comprobantes) and fuente_id = p_fuente;
  if v_suma <> v_fuente.monto_mensual then
    raise exception 'La rendición no cuadra: se transfirió S/ % y los comprobantes marcados suman S/ %. Diferencia: S/ %.',
      to_char(v_fuente.monto_mensual, 'FM999G990D00'), to_char(v_suma, 'FM999G990D00'),
      to_char(v_fuente.monto_mensual - v_suma, 'FM999G990D00');
  end if;

  insert into rendiciones (mcp_id, fuente_id, periodo, anio, transferencia)
  values (p_mcp, p_fuente, p_periodo, left(p_periodo, 4)::int, v_fuente.monto_mensual)
  returning id into v_id;

  insert into rendicion_items (mcp_id, rendicion_id, comprobante_id)
  select p_mcp, v_id, c from unnest(p_comprobantes) c;

  update comprobantes_pago set estado = 'rendido' where id = any(p_comprobantes);
  update expedientes e set estado = 'rendido'
    from comprobantes_pago cp
    where cp.id = any(p_comprobantes) and cp.expediente_id = e.id and e.estado = 'aprobado';
  return v_id;
end $$;

-- =====================================================================
-- Fecha límite de la rendición
--   Cada municipalidad que transfiere fija hasta qué día del mes siguiente
--   se entrega la rendición (por defecto, el día 10).
-- =====================================================================
alter table fuentes add column if not exists dia_limite smallint not null default 10;
alter table fuentes drop constraint if exists fuentes_dia_limite_check;
alter table fuentes add constraint fuentes_dia_limite_check check (dia_limite between 1 and 28);

-- =====================================================================
-- Logo de la MCP
--   Se guarda en un bucket público "logos" (carpeta = id de la MCP), para
--   mostrarlo en el menú y en los formatos impresos sin pasos extra.
--   Solo soporte o el administrador de la MCP pueden subirlo o cambiarlo.
-- =====================================================================
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do update set public = true;

drop policy if exists logos_subir on storage.objects;
create policy logos_subir on storage.objects for insert
  with check (bucket_id = 'logos' and (es_soporte() or tiene_rol(((storage.foldername(name))[1])::uuid, array['admin']::rol_mcp[])));

drop policy if exists logos_cambiar on storage.objects;
create policy logos_cambiar on storage.objects for update
  using (bucket_id = 'logos' and (es_soporte() or tiene_rol(((storage.foldername(name))[1])::uuid, array['admin']::rol_mcp[])));

-- =====================================================================
-- Almacén
--   * Catálogo de bienes de la MCP (código correlativo).
--   * NEA  (Nota de Entrada al Almacén): entrada de bienes, normalmente de
--          una compra con conformidad; también donaciones u otros.
--   * PECOSA (Pedido Comprobante de Salida): entrega de bienes a un área.
--   * Stock y valor (costo promedio) calculados de los movimientos.
--   Reglas: no se entrega más de lo que hay; no se anula una NEA si sus
--   bienes ya salieron; nada se borra; mes cerrado no admite cambios.
--   Una compra de bienes pasa por almacén antes del comprobante de pago,
--   salvo que se indique por qué no (consumo inmediato).
-- =====================================================================

create table if not exists almacen_bienes (
  id            uuid primary key default gen_random_uuid(),
  mcp_id        uuid not null references mcps(id),
  codigo        int  not null,
  descripcion   text not null,
  unidad        text not null default 'UNIDAD',
  stock_minimo  numeric(12,3) not null default 0 check (stock_minimo >= 0),
  activo        boolean not null default true,
  creado_por    uuid default auth.uid() references perfiles(id),
  creado_en     timestamptz not null default now(),
  unique (mcp_id, descripcion, unidad),
  unique (mcp_id, codigo)
);

create table if not exists notas_entrada (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  anio            int  not null default extract(year from current_date)::int,
  numero          int,
  fecha           date not null default current_date,
  origen          text not null default 'compra' check (origen in ('compra', 'donacion', 'otro')),
  expediente_id   uuid references expedientes(id),
  proveedor       text,
  documento_ref   text,
  observacion     text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  anulado_por     uuid references perfiles(id),
  anulado_en      timestamptz,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create unique index if not exists nea_vigente_por_expediente on notas_entrada (expediente_id)
  where expediente_id is not null and not anulado;

create table if not exists nota_entrada_items (
  id               uuid primary key default gen_random_uuid(),
  mcp_id           uuid not null references mcps(id),
  nea_id           uuid not null references notas_entrada(id),
  item             int  not null,
  bien_id          uuid not null references almacen_bienes(id),
  cantidad         numeric(12,3) not null check (cantidad > 0),
  precio_unitario  numeric(12,4) not null check (precio_unitario >= 0),
  total            numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

create table if not exists pecosas (
  id                 uuid primary key default gen_random_uuid(),
  mcp_id             uuid not null references mcps(id),
  anio               int  not null default extract(year from current_date)::int,
  numero             int,
  fecha              date not null default current_date,
  area_solicitante   text not null,
  solicitante        text,
  finalidad          text,
  anulado            boolean not null default false,
  anulado_motivo     text,
  anulado_por        uuid references perfiles(id),
  anulado_en         timestamptz,
  creado_por         uuid default auth.uid() references perfiles(id),
  creado_en          timestamptz not null default now()
);

create table if not exists pecosa_items (
  id               uuid primary key default gen_random_uuid(),
  mcp_id           uuid not null references mcps(id),
  pecosa_id        uuid not null references pecosas(id),
  item             int  not null,
  bien_id          uuid not null references almacen_bienes(id),
  cantidad         numeric(12,3) not null check (cantidad > 0),
  precio_unitario  numeric(12,4) not null default 0 check (precio_unitario >= 0),
  total            numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

-- Motivo para pasar una compra al comprobante sin NEA (consumo inmediato)
alter table expedientes add column if not exists sin_almacen_motivo text;

-- ---------------------------------------------------------------- stock
create or replace view almacen_stock with (security_invoker = true) as
select b.id as bien_id, b.mcp_id, b.codigo, b.descripcion, b.unidad, b.stock_minimo, b.activo,
       coalesce(e.cant, 0) as entradas,
       coalesce(s.cant, 0) as salidas,
       coalesce(e.cant, 0) - coalesce(s.cant, 0) as stock,
       case when coalesce(e.cant, 0) > 0 then round(e.valor / e.cant, 4) else 0 end as costo_promedio,
       round((coalesce(e.cant, 0) - coalesce(s.cant, 0))
             * case when coalesce(e.cant, 0) > 0 then e.valor / e.cant else 0 end, 2) as valor
from almacen_bienes b
left join (
  select i.bien_id, sum(i.cantidad) as cant, sum(i.total) as valor
  from nota_entrada_items i join notas_entrada n on n.id = i.nea_id
  where not n.anulado group by i.bien_id
) e on e.bien_id = b.id
left join (
  select i.bien_id, sum(i.cantidad) as cant
  from pecosa_items i join pecosas p on p.id = i.pecosa_id
  where not p.anulado group by i.bien_id
) s on s.bien_id = b.id;

create or replace function stock_bien(p_bien uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(i.cantidad) from nota_entrada_items i join notas_entrada n on n.id = i.nea_id
                   where i.bien_id = p_bien and not n.anulado), 0)
       - coalesce((select sum(i.cantidad) from pecosa_items i join pecosas p on p.id = i.pecosa_id
                   where i.bien_id = p_bien and not p.anulado), 0);
$$;

create or replace function costo_promedio_bien(p_bien uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(i.total) / nullif(sum(i.cantidad), 0), 4), 0)
  from nota_entrada_items i join notas_entrada n on n.id = i.nea_id
  where i.bien_id = p_bien and not n.anulado;
$$;

-- ------------------------------------------------------- emitir una NEA
-- p_items: [{"descripcion": "...", "unidad": "...", "cantidad": 1, "precio_unitario": 2.5}]
-- Cada bien se busca por descripción y unidad; si no existe, se crea.
create or replace function emitir_nea(p_mcp uuid, p_fecha date, p_origen text, p_expediente uuid,
                                      p_proveedor text, p_documento_ref text, p_observacion text, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_bien uuid; v_n int := 0; v_desc text; v_und text; v_tipo text;
begin
  if not puede_registrar(p_mcp) then raise exception 'Sin permiso para registrar en el almacén.'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'Agregue al menos un bien.'; end if;
  if p_expediente is not null then
    select tipo into v_tipo from expedientes where id = p_expediente and mcp_id = p_mcp and estado in ('aprobado', 'rendido');
    if v_tipo is null then raise exception 'El expediente no está aprobado.'; end if;
    if v_tipo <> 'compra' then raise exception 'Solo las compras de bienes entran al almacén.'; end if;
    if not exists (select 1 from conformidades where expediente_id = p_expediente and not anulado) then
      raise exception 'Primero registre la conformidad: los bienes entran al almacén cuando se reciben conformes.';
    end if;
  end if;

  insert into notas_entrada (mcp_id, fecha, origen, expediente_id, proveedor, documento_ref, observacion)
  values (p_mcp, coalesce(p_fecha, current_date), coalesce(p_origen, 'compra'), p_expediente,
          nullif(trim(p_proveedor), ''), nullif(trim(p_documento_ref), ''), nullif(trim(p_observacion), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_desc := upper(trim(v_item->>'descripcion'));
    v_und  := upper(coalesce(nullif(trim(v_item->>'unidad'), ''), 'UNIDAD'));
    if v_desc = '' then continue; end if;
    select id into v_bien from almacen_bienes where mcp_id = p_mcp and descripcion = v_desc and unidad = v_und;
    if v_bien is null then
      insert into almacen_bienes (mcp_id, codigo, descripcion, unidad)
      values (p_mcp, siguiente_numero(p_mcp, 'bien', 0), v_desc, v_und)
      returning id into v_bien;
    end if;
    v_n := v_n + 1;
    insert into nota_entrada_items (mcp_id, nea_id, item, bien_id, cantidad, precio_unitario)
    values (p_mcp, v_id, v_n, v_bien, (v_item->>'cantidad')::numeric, coalesce((v_item->>'precio_unitario')::numeric, 0));
  end loop;
  if v_n = 0 then raise exception 'Agregue al menos un bien.'; end if;
  return v_id;
end $$;

-- ---------------------------------------------------- emitir una PECOSA
-- p_items: [{"bien_id": "...", "cantidad": 2}]
create or replace function emitir_pecosa(p_mcp uuid, p_fecha date, p_area text, p_solicitante text,
                                         p_finalidad text, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_bien almacen_bienes; v_n int := 0; v_cant numeric; v_stock numeric;
begin
  if not puede_registrar(p_mcp) then raise exception 'Sin permiso para registrar en el almacén.'; end if;
  if coalesce(trim(p_area), '') = '' then raise exception 'Escriba el área que recibe los bienes.'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'Agregue al menos un bien.'; end if;

  insert into pecosas (mcp_id, fecha, area_solicitante, solicitante, finalidad)
  values (p_mcp, coalesce(p_fecha, current_date), upper(trim(p_area)), nullif(upper(trim(p_solicitante)), ''),
          nullif(upper(trim(p_finalidad)), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Se bloquea el bien para que dos entregas a la vez no pasen el stock
    select * into v_bien from almacen_bienes where id = (v_item->>'bien_id')::uuid and mcp_id = p_mcp for update;
    if not found then raise exception 'Bien no encontrado en el almacén.'; end if;
    v_cant := (v_item->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then raise exception 'La cantidad de % debe ser mayor que cero.', v_bien.descripcion; end if;
    v_stock := stock_bien(v_bien.id);
    if v_cant > v_stock then
      raise exception 'No hay suficiente %: hay % % y se quiere entregar %.',
        v_bien.descripcion, trim(to_char(v_stock, 'FM999G990D###')), v_bien.unidad, trim(to_char(v_cant, 'FM999G990D###'));
    end if;
    v_n := v_n + 1;
    insert into pecosa_items (mcp_id, pecosa_id, item, bien_id, cantidad, precio_unitario)
    values (p_mcp, v_id, v_n, v_bien.id, v_cant, costo_promedio_bien(v_bien.id));
  end loop;
  return v_id;
end $$;

-- --------------------------------------------------------------- anular
create or replace function validar_anulacion_almacen() returns trigger
language plpgsql as $$
declare r record;
begin
  if old.anulado then raise exception 'El documento está anulado y no se puede cambiar.'; end if;
  if (to_jsonb(new) - array['anulado','anulado_motivo','anulado_por','anulado_en'])
     is distinct from (to_jsonb(old) - array['anulado','anulado_motivo','anulado_por','anulado_en']) then
    raise exception 'Un documento de almacén emitido no se edita: anúlelo y emita otro.';
  end if;
  if new.anulado then
    if coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
      raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
    end if;
    new.anulado_por := auth.uid();
    new.anulado_en := now();
    if tg_table_name = 'notas_entrada' then
      for r in select b.descripcion, b.unidad, sum(i.cantidad) as cant, stock_bien(i.bien_id) as stock
               from nota_entrada_items i join almacen_bienes b on b.id = i.bien_id
               where i.nea_id = new.id group by i.bien_id, b.descripcion, b.unidad loop
        if r.stock - r.cant < 0 then
          raise exception 'No se puede anular: parte de % ya se entregó (queda % % en almacén). Anule primero la PECOSA.',
            r.descripcion, trim(to_char(r.stock, 'FM999G990D###')), r.unidad;
        end if;
      end loop;
    end if;
  end if;
  return new;
end $$;

create or replace function prohibir_cambio() returns trigger
language plpgsql as $$
begin
  raise exception 'Los ítems de un documento emitido no se cambian: anule el documento.';
end $$;

-- ------------------------------------------- comprobante de una compra
-- Una compra de bienes necesita su NEA (o el motivo de por qué no pasa
-- por almacén) antes del comprobante de pago.
create or replace function validar_cp_expediente() returns trigger
language plpgsql as $$
declare v_tipo text; v_sin text;
begin
  if new.expediente_id is not null then
    select tipo, sin_almacen_motivo into v_tipo, v_sin from expedientes where id = new.expediente_id and estado = 'aprobado';
    if v_tipo is null then
      raise exception 'El requerimiento del expediente no está aprobado.';
    end if;
    if v_tipo <> 'pago_fijo'
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

-- El motivo "sin almacén" se puede escribir aunque el expediente ya esté aprobado
create or replace function validar_documento() returns trigger
language plpgsql as $$
declare
  libres text[] := array['estado','motivo_devolucion','anulado_motivo','anulado_por','anulado_en',
                         'actualizado_por','actualizado_en','fase','sin_almacen_motivo'];
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

  if tg_table_name = 'expedientes' and new.sin_almacen_motivo is distinct from old.sin_almacen_motivo then
    if old.sin_almacen_motivo is not null then
      raise exception 'El motivo de "no pasa por almacén" ya se registró.';
    end if;
    if coalesce(length(trim(new.sin_almacen_motivo)), 0) < 10 then
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

-- ----------------------------------------------------------- disparadores
do $$
declare t text;
begin
  foreach t in array array['almacen_bienes','notas_entrada','nota_entrada_items','pecosas','pecosa_items'] loop
    execute format('drop trigger if exists %I on %I', t || '_auditoria', t);
    execute format('create trigger %I after insert or update on %I for each row execute function registrar_auditoria()', t || '_auditoria', t);
    execute format('drop trigger if exists %I on %I', t || '_sin_borrado', t);
    execute format('create trigger %I before delete on %I for each row execute function prohibir_borrado()', t || '_sin_borrado', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_ver', t);
    execute format('create policy %I on %I for select using (es_miembro(mcp_id))', t || '_ver', t);
  end loop;
  foreach t in array array['notas_entrada','pecosas'] loop
    execute format('drop trigger if exists %I on %I', t || '_periodo', t);
    execute format('create trigger %I before insert or update on %I for each row execute function validar_periodo_abierto()', t || '_periodo', t);
    execute format('drop trigger if exists %I on %I', t || '_numero', t);
    execute format('create trigger %I before insert on %I for each row execute function asignar_numero()', t || '_numero', t);
    execute format('drop trigger if exists %I on %I', t || '_anular', t);
    execute format('create trigger %I before update on %I for each row execute function validar_anulacion_almacen()', t || '_anular', t);
    execute format('drop policy if exists %I on %I', t || '_anular', t);
    execute format('create policy %I on %I for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id))', t || '_anular', t);
  end loop;
  foreach t in array array['nota_entrada_items','pecosa_items'] loop
    execute format('drop trigger if exists %I on %I', t || '_fijo', t);
    execute format('create trigger %I before update on %I for each row execute function prohibir_cambio()', t || '_fijo', t);
  end loop;
end $$;

-- El catálogo de bienes: se corrige el stock mínimo o se desactiva un bien
drop policy if exists almacen_bienes_editar on almacen_bienes;
create policy almacen_bienes_editar on almacen_bienes for update
  using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

revoke execute on function emitir_nea(uuid, date, text, uuid, text, text, text, jsonb) from public, anon;
revoke execute on function emitir_pecosa(uuid, date, text, text, text, jsonb) from public, anon;
grant execute on function emitir_nea(uuid, date, text, uuid, text, text, text, jsonb) to authenticated;
grant execute on function emitir_pecosa(uuid, date, text, text, text, jsonb) to authenticated;
grant select on almacen_stock to authenticated;

-- =====================================================================
-- Pagos fijos de la MCP
--   Lista de lo que se paga cada mes (dietas, asesor contable, personal).
--   Cada requerimiento de pago fijo indica qué pago y de qué mes es: así
--   el sistema sabe qué meses ya se pagaron y no deja pagar dos veces el
--   mismo mes.
-- =====================================================================
create table if not exists pagos_fijos (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  concepto          text not null,
  beneficiario      text,
  beneficiario_doc  text,
  monto             numeric(12,2) not null check (monto > 0),
  unidad            text not null default 'MES',
  fuente_id         uuid references fuentes(id),
  clasificador      text default '2.3 Bienes y servicios',
  activo            boolean not null default true,
  creado_por        uuid default auth.uid() references perfiles(id),
  creado_en         timestamptz not null default now(),
  unique (mcp_id, concepto)
);

alter table expedientes add column if not exists pago_fijo_id uuid references pagos_fijos(id);
alter table expedientes add column if not exists mes_pagado text;
alter table expedientes drop constraint if exists expedientes_mes_pagado_check;
alter table expedientes add constraint expedientes_mes_pagado_check check (mes_pagado is null or mes_pagado ~ '^\d{4}-(0[1-9]|1[0-2])$');
create unique index if not exists pago_fijo_mes_unico on expedientes (pago_fijo_id, mes_pagado)
  where pago_fijo_id is not null and estado <> 'anulado';

create or replace function validar_expediente_pago_fijo() returns trigger
language plpgsql as $$
begin
  if new.pago_fijo_id is not null then
    if new.tipo <> 'pago_fijo' then
      raise exception 'Solo un requerimiento de pago fijo puede indicar un pago de la lista.';
    end if;
    if new.mes_pagado is null then
      raise exception 'Indique de qué mes es el pago fijo.';
    end if;
    if not exists (select 1 from pagos_fijos where id = new.pago_fijo_id and mcp_id = new.mcp_id) then
      raise exception 'El pago fijo no pertenece a esta MCP.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists expedientes_pago_fijo_mes on expedientes;
create trigger expedientes_pago_fijo_mes before insert or update on expedientes
  for each row execute function validar_expediente_pago_fijo();

alter table pagos_fijos enable row level security;
drop policy if exists pagos_fijos_ver on pagos_fijos;
create policy pagos_fijos_ver on pagos_fijos for select using (es_miembro(mcp_id));
drop policy if exists pagos_fijos_crear on pagos_fijos;
create policy pagos_fijos_crear on pagos_fijos for insert with check (puede_registrar(mcp_id));
drop policy if exists pagos_fijos_editar on pagos_fijos;
create policy pagos_fijos_editar on pagos_fijos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists pagos_fijos_auditoria on pagos_fijos;
create trigger pagos_fijos_auditoria after insert or update on pagos_fijos for each row execute function registrar_auditoria();
drop trigger if exists pagos_fijos_sin_borrado on pagos_fijos;
create trigger pagos_fijos_sin_borrado before delete on pagos_fijos for each row execute function prohibir_borrado();

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

-- =====================================================================
-- Cheque previsto del pago fijo
--   Al registrar un pago fijo se anota el N° de cheque; al aprobarlo, su
--   comprobante de pago se genera solo con ese cheque.
-- =====================================================================
alter table expedientes add column if not exists cheque_previsto text;
alter table expedientes drop constraint if exists expedientes_cheque_previsto_check;
alter table expedientes add constraint expedientes_cheque_previsto_check check (cheque_previsto is null or cheque_previsto ~ '^\d{4,12}$');

-- =====================================================================
-- Contabilidad
--   Datos que el resto del sistema no tiene y que la contabilidad necesita:
--   * Saldo inicial del año (banco y caja).
--   * Transferencias recibidas (fecha real y N° de operación).
--   * Saldo del extracto bancario de cada mes (conciliación).
--   * Cheques cobrados por el banco (para saber cuáles están en tránsito).
--   Todo lo demás (libro bancos, ejecución, libro diario) se calcula de los
--   comprobantes de pago e ingresos ya registrados.
-- =====================================================================
create table if not exists saldos_iniciales (
  id           uuid primary key default gen_random_uuid(),
  mcp_id       uuid not null references mcps(id),
  anio         int  not null,
  saldo_banco  numeric(12,2) not null default 0,
  saldo_caja   numeric(12,2) not null default 0,
  observacion  text,
  creado_por   uuid default auth.uid() references perfiles(id),
  creado_en    timestamptz not null default now(),
  unique (mcp_id, anio)
);

create table if not exists transferencias_recibidas (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  fuente_id       uuid not null references fuentes(id),
  periodo         text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fecha           date not null,
  monto           numeric(12,2) not null check (monto > 0),
  documento       text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create unique index if not exists transferencia_vigente_unica on transferencias_recibidas (fuente_id, periodo) where not anulado;

create table if not exists conciliaciones (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  periodo         text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  saldo_extracto  numeric(12,2) not null,
  observacion     text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (mcp_id, periodo)
);

create table if not exists cheques_cobrados (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  comprobante_id  uuid not null references comprobantes_pago(id),
  fecha_cobro     date not null,
  anulado         boolean not null default false,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create unique index if not exists cheque_cobrado_unico on cheques_cobrados (comprobante_id) where not anulado;

create or replace function validar_transferencia() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.anulado then raise exception 'La transferencia está anulada y no se puede cambiar.'; end if;
    if new.anulado and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
      raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
    end if;
  end if;
  if not exists (select 1 from fuentes where id = new.fuente_id and mcp_id = new.mcp_id and tipo <> 'propios') then
    raise exception 'La municipalidad que transfiere no pertenece a esta MCP.';
  end if;
  return new;
end $$;
drop trigger if exists transferencias_validar on transferencias_recibidas;
create trigger transferencias_validar before insert or update on transferencias_recibidas
  for each row execute function validar_transferencia();

drop trigger if exists transferencias_recibidas_periodo on transferencias_recibidas;
create trigger transferencias_recibidas_periodo before insert or update on transferencias_recibidas
  for each row execute function validar_periodo_abierto();

do $$
declare t text;
begin
  foreach t in array array['saldos_iniciales','transferencias_recibidas','conciliaciones','cheques_cobrados'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_ver', t);
    execute format('create policy %I on %I for select using (es_miembro(mcp_id))', t || '_ver', t);
    execute format('drop policy if exists %I on %I', t || '_crear', t);
    execute format('create policy %I on %I for insert with check (puede_registrar(mcp_id))', t || '_crear', t);
    execute format('drop policy if exists %I on %I', t || '_editar', t);
    execute format('create policy %I on %I for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id))', t || '_editar', t);
    execute format('drop trigger if exists %I on %I', t || '_auditoria', t);
    execute format('create trigger %I after insert or update on %I for each row execute function registrar_auditoria()', t || '_auditoria', t);
    execute format('drop trigger if exists %I on %I', t || '_sin_borrado', t);
    execute format('create trigger %I before delete on %I for each row execute function prohibir_borrado()', t || '_sin_borrado', t);
  end loop;
end $$;

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

-- =====================================================================
-- El superadmin es el dueño del sistema, no un usuario de una MCP.
-- Sus accesos a MCP se cierran (quedan en el historial) y no se le
-- pueden asignar cargos en ninguna municipalidad.
-- =====================================================================
update miembros
   set activo = false,
       hasta  = greatest(desde, current_date)
 where activo
   and user_id in (select id from perfiles where es_superadmin);

create or replace function impedir_superadmin_miembro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.activo and exists (select 1 from perfiles where id = new.user_id and es_superadmin) then
    raise exception 'El administrador del sistema no puede tener cargo en una MCP. Cree un usuario propio de la municipalidad.';
  end if;
  return new;
end $$;
drop trigger if exists miembros_sin_superadmin on miembros;
create trigger miembros_sin_superadmin before insert or update on miembros
  for each row execute function impedir_superadmin_miembro();

-- =====================================================================
-- Módulos por cliente: el superadmin decide qué módulos tiene cada MCP.
-- «Expedientes» (requerimientos, comprobantes y pagos fijos) es el núcleo
-- y siempre está activo; los demás se habilitan o se quitan por cliente.
-- Quitar un módulo solo lo oculta: no se borra ningún dato.
-- =====================================================================
alter table mcps add column if not exists modulos text[]
  not null default array['caja_chica','ingresos','almacen','rendicion','contabilidad'];

alter table mcps drop constraint if exists mcps_modulos_validos;
alter table mcps add constraint mcps_modulos_validos
  check (modulos <@ array['caja_chica','ingresos','almacen','rendicion','contabilidad']::text[]);

-- Cuántos clientes se captaron por día (para el inicio del superadmin)
create index if not exists mcps_creado_en_idx on mcps (creado_en);

-- =====================================================================
-- Login propio de cada municipalidad: /login/<RUC> muestra su logo, su
-- nombre y su RUC. Solo se expone lo que ya es público de la MCP.
-- =====================================================================
create or replace function mcp_para_login(p_ruc text)
returns table (nombre text, ruc text, logo_path text)
language sql stable security definer set search_path = public as $$
  select m.nombre, m.ruc, m.logo_path
    from mcps m
   where m.ruc = regexp_replace(coalesce(p_ruc, ''), '\D', '', 'g')
   limit 1;
$$;
revoke execute on function mcp_para_login(text) from public;
grant execute on function mcp_para_login(text) to anon, authenticated;

-- =====================================================================
-- «Definir después» el dinero con que se paga: un expediente aprobado
-- que aún no tiene fuente puede recibirla; una vez puesta, ya no cambia.
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
    -- El dinero con que se paga puede definirse después: solo si aún no tenía uno
    if tg_table_name = 'expedientes' and (to_jsonb(old)->>'fuente_id') is null then
      libres := array_append(libres, 'fuente_id');
    end if;
    if tg_table_name = 'comprobantes_pago' and (to_jsonb(old)->>'cheque') is null then
      libres := array_append(libres, 'cheque');
    end if;
    if (to_jsonb(new) - libres) is distinct from (to_jsonb(old) - libres) then
      raise exception 'El documento ya no está en borrador: no se puede editar. Devuélvalo o anúlelo.';
    end if;
  end if;
  return new;
end $$;

-- =====================================================================
-- Responsabilidad en los relevos
--   1. PIN personal y aceptación de términos (tabla privada: solo la
--      aplicación, con su clave de servicio, la lee o escribe).
--   2. Relevos con documento de respaldo (resolución, memorando o acta).
-- =====================================================================
create table if not exists perfil_seguridad (
  user_id             uuid primary key references perfiles(id),
  pin_hash            text,
  pin_actualizado_en  timestamptz,
  pin_intentos        int not null default 0,
  pin_bloqueado_hasta timestamptz,
  acepto_terminos_en  timestamptz,
  acepto_version      text
);
alter table perfil_seguridad enable row level security;
-- Sin políticas: nadie con sesión de usuario la ve ni la cambia.
revoke all on perfil_seguridad from anon, authenticated;

create table if not exists relevos (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  sale              uuid references perfiles(id),
  entra             uuid references perfiles(id),
  rol               rol_mcp not null,
  fecha             date not null,
  documento_tipo    text not null check (documento_tipo in ('resolucion', 'memorando', 'acta', 'otro')),
  documento_numero  text,
  documento_path    text not null,
  confirmado_con    text not null,
  registrado_por    uuid default auth.uid() references perfiles(id),
  creado_en         timestamptz not null default now()
);
alter table relevos enable row level security;
drop policy if exists relevos_ver on relevos;
create policy relevos_ver on relevos for select using (es_soporte() or tiene_rol(mcp_id, array['admin', 'alcalde']::rol_mcp[]));
drop policy if exists relevos_crear on relevos;
create policy relevos_crear on relevos for insert with check (es_soporte());
drop trigger if exists relevos_auditoria on relevos;
create trigger relevos_auditoria after insert or update on relevos for each row execute function registrar_auditoria();
drop trigger if exists relevos_sin_borrado on relevos;
create trigger relevos_sin_borrado before delete on relevos for each row execute function prohibir_borrado();

-- Carpeta privada para los documentos de respaldo
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('relevos', 'relevos', false) on conflict (id) do nothing;
  end if;
end $$;

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

-- =====================================================================
-- Memoria de consultas de RUC y DNI: así se ahorra cupo del plan de la
-- API y la respuesta es inmediata si el mismo número se vuelve a usar.
-- Solo la aplicación (clave de servicio) la lee o escribe.
-- =====================================================================
create table if not exists consultas_documento (
  documento     text primary key check (documento ~ '^\d{8}$|^\d{11}$'),
  tipo          text not null check (tipo in ('dni', 'ruc')),
  datos         jsonb not null,
  consultado_en timestamptz not null default now()
);
alter table consultas_documento enable row level security;
revoke all on consultas_documento from anon, authenticated;

-- =====================================================================
-- Un pago fijo recuerda su redacción: la primera vez que se registra (con
-- la sugerencia o editada), esa redacción se guarda y los meses siguientes
-- se usa sola, cambiando únicamente el mes y el año.
-- =====================================================================
alter table pagos_fijos add column if not exists descripcion_modelo text;
alter table pagos_fijos add column if not exists mes_modelo text;

create or replace function guardar_redaccion_pago_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_fijo_id is not null and new.mes_pagado is not null and new.estado <> 'anulado'
     and (tg_op = 'INSERT' or new.descripcion is distinct from old.descripcion) then
    update pagos_fijos
       set descripcion_modelo = new.descripcion, mes_modelo = new.mes_pagado
     where id = new.pago_fijo_id and mcp_id = new.mcp_id;
  end if;
  return new;
end $$;

drop trigger if exists expedientes_guardar_redaccion on expedientes;
create trigger expedientes_guardar_redaccion after insert or update of descripcion on expedientes
  for each row execute function guardar_redaccion_pago_fijo();

-- Pagos fijos ya registrados: toma como modelo el último expediente no anulado de cada uno
update pagos_fijos p
   set descripcion_modelo = e.descripcion, mes_modelo = e.mes_pagado
  from (select distinct on (pago_fijo_id) pago_fijo_id, descripcion, mes_pagado
          from expedientes
         where pago_fijo_id is not null and mes_pagado is not null and estado <> 'anulado'
         order by pago_fijo_id, mes_pagado desc) e
 where p.id = e.pago_fijo_id and p.descripcion_modelo is null;


-- =====================================================================
-- Pagos fijos con expediente completo: todos llevan requerimiento, orden de
-- servicio, memorando de conformidad y comprobante de pago (sin cotizaciones),
-- salvo los que se marquen como simples (dietas del alcalde y regidores:
-- solo requerimiento y comprobante).
-- =====================================================================
alter table pagos_fijos add column if not exists expediente_completo boolean not null default true;
update pagos_fijos set expediente_completo = false where concepto ilike '%dieta%' and expediente_completo;

-- El expediente recuerda con qué flujo nació (los ya hechos no cambian).
alter table expedientes add column if not exists flujo_completo boolean not null default false;

create or replace function fijar_flujo_pago_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'pago_fijo' and new.pago_fijo_id is not null then
    new.flujo_completo := coalesce((select expediente_completo from pagos_fijos where id = new.pago_fijo_id), false);
  end if;
  return new;
end $$;

drop trigger if exists expedientes_fijar_flujo on expedientes;
create trigger expedientes_fijar_flujo before insert on expedientes
  for each row execute function fijar_flujo_pago_fijo();

-- Un pago fijo simple (dietas) no lleva cotizaciones, orden ni conformidad; con expediente completo sí
create or replace function validar_pago_fijo() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from expedientes where id = new.expediente_id and tipo = 'pago_fijo' and not flujo_completo) then
    raise exception 'Un pago fijo simple no lleva cotizaciones, orden ni conformidad.';
  end if;
  return new;
end $$;

-- El comprobante exige conformidad en todo expediente, salvo el pago fijo simple
create or replace function validar_cp_expediente() returns trigger
language plpgsql as $$
declare v_tipo text; v_sin text; v_completo boolean;
begin
  if new.expediente_id is not null then
    select tipo, sin_almacen_motivo, flujo_completo into v_tipo, v_sin, v_completo from expedientes where id = new.expediente_id and estado = 'aprobado';
    if v_tipo is null then
      raise exception 'El requerimiento del expediente no está aprobado.';
    end if;
    if (v_tipo <> 'pago_fijo' or v_completo)
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


-- =====================================================================
-- El PIN para aprobar/firmar se activa o desactiva por MCP desde Configuración
-- (por ahora apagado).
-- =====================================================================
alter table mcps add column if not exists exigir_pin boolean not null default false;

-- =====================================================================
-- «Completar todo»: el requerimiento de compra o servicio puede traer su proveedor,
-- si ya se recibió conforme y el sustento (factura, boleta...). Al aprobarlo el
-- alcalde, la orden, la conformidad y el comprobante de pago se generan solos.
-- =====================================================================
alter table expedientes add column if not exists completar_todo boolean not null default false;
alter table expedientes add column if not exists con_conformidad boolean not null default false;
alter table expedientes add column if not exists sustento_tipo text;
alter table expedientes add column if not exists sustento_numero text;

-- =====================================================================
-- Número que le tocará al próximo documento (solo lectura): las vistas previas
-- muestran el correlativo automático en vez de «___». El número real lo sigue
-- asignando el sistema al emitir.
-- =====================================================================
create or replace function proximo_numero(p_mcp uuid, p_tipo text, p_anio int) returns int
language sql stable security definer set search_path = public as $$
  select case when es_miembro(p_mcp) or es_soporte()
    then coalesce((select ultimo from correlativos where mcp_id = p_mcp and tipo = p_tipo and anio = p_anio), 0) + 1
    else null end;
$$;

-- =====================================================================
-- Anular un expediente anula TODA su documentación, en un solo paso (todo o nada):
-- comprobante de pago, NEA, memorando de conformidad, orden, cotizaciones y,
-- por último, el expediente. Nada se borra: todo queda anulado con su motivo.
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

  -- De lo último a lo primero: comprobante, almacén, conformidad, orden, cotizaciones
  for v_cp in select id, cheque from comprobantes_pago where expediente_id = p_expediente and estado <> 'anulado' loop
    update comprobantes_pago set estado = 'anulado', anulado_motivo = v_motivo_hijo where id = v_cp.id;
    v_cps := v_cps + 1;
    if v_cp.cheque is not null then v_cheques := v_cheques || case when v_cheques = '' then '' else ', ' end || v_cp.cheque; end if;
  end loop;

  update notas_entrada set anulado = true, anulado_motivo = v_motivo_hijo where expediente_id = p_expediente and not anulado;
  get diagnostics v_neas = row_count;

  update conformidades set anulado = true, anulado_motivo = v_motivo_hijo where expediente_id = p_expediente and not anulado;
  update ordenes set anulado = true, anulado_motivo = v_motivo_hijo where expediente_id = p_expediente and not anulado;
  update cotizaciones set anulado = true, elegida = false where expediente_id = p_expediente and not anulado;

  update expedientes set estado = 'anulado', anulado_motivo = trim(p_motivo) where id = p_expediente;

  return v_cps || '|' || v_neas || '|' || v_cheques;
end $$;

revoke execute on function anular_expediente_total(uuid, text) from public, anon;
grant execute on function anular_expediente_total(uuid, text) to authenticated;

-- =====================================================================
-- La función del número que le toca al próximo documento debe poder llamarla
-- cualquier usuario con sesión, y la API debe verla enseguida.
-- =====================================================================
revoke execute on function proximo_numero(uuid, text, int) from public, anon;
grant execute on function proximo_numero(uuid, text, int) to authenticated;
notify pgrst, 'reload schema';

-- Número de cheque con el que se abrió la caja chica (se repite en todos sus gastos)
alter table cajas_chicas add column if not exists numero_cheque text;
notify pgrst, 'reload schema';

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

-- Varias cajas chicas en el mismo mes y fuente (cada una con su cheque y su N° dentro del mes)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'cajas_chicas'::regclass and contype = 'u'
      and conkey = (select array_agg(attnum order by attnum) from pg_attribute
                    where attrelid = 'cajas_chicas'::regclass and attname in ('mcp_id', 'periodo', 'fuente_id'))
  loop
    execute format('alter table cajas_chicas drop constraint %I', r.conname);
  end loop;
end $$;

alter table cajas_chicas add column if not exists numero int;
update cajas_chicas c set numero = x.n
from (select id, row_number() over (partition by mcp_id, periodo, fuente_id order by creado_en) n from cajas_chicas) x
where x.id = c.id and c.numero is null;

create or replace function asignar_numero_caja() returns trigger language plpgsql as $$
begin
  select coalesce(max(numero), 0) + 1 into new.numero from cajas_chicas
    where mcp_id = new.mcp_id and periodo = new.periodo and fuente_id = new.fuente_id;
  return new;
end $$;
drop trigger if exists cajas_chicas_numero on cajas_chicas;
create trigger cajas_chicas_numero before insert on cajas_chicas
  for each row execute function asignar_numero_caja();

create unique index if not exists cajas_chicas_numero_uq on cajas_chicas (mcp_id, periodo, fuente_id, numero);

-- La liquidación indica de qué caja es cuando el mes tiene más de una
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
          'Liquidación de caja chica ' || v_caja.periodo || case when v_caja.numero > 1 then ' (caja ' || v_caja.numero || ')' else '' end, v_total, '2.3 Bienes y servicios',
          'Administrativa del Estado', 'Gastos operativos diversos', v_caja.numero_cheque)
  returning id into v_cp;

  update cajas_chicas set estado = 'liquidada', comprobante_id = v_cp where id = p_caja;
  return v_cp;
end $$;
notify pgrst, 'reload schema';

-- La declaración jurada de caja chica lleva correlativo automático por año (001-2026, 002-2026…)
create or replace function asignar_numero_dj() returns trigger language plpgsql security definer set search_path = public as $$
declare v_anio int;
begin
  if new.sustento_tipo <> 'DJ' then return new; end if;
  -- Al editar una DJ que ya tenía número, se conserva
  if tg_op = 'UPDATE' and old.sustento_tipo = 'DJ' and old.sustento_numero is not null then
    new.sustento_numero := old.sustento_numero;
    return new;
  end if;
  if new.sustento_numero is null or new.sustento_numero = '' then
    v_anio := extract(year from new.fecha)::int;
    new.sustento_numero := lpad(siguiente_numero(new.mcp_id, 'declaraciones_juradas', v_anio)::text, 3, '0') || '-' || v_anio;
  end if;
  return new;
end $$;

drop trigger if exists caja_gastos_dj on caja_chica_gastos;
create trigger caja_gastos_dj before insert or update on caja_chica_gastos
  for each row execute function asignar_numero_dj();

-- Las DJ ya registradas sin número lo reciben, en el orden en que se crearon
alter table caja_chica_gastos disable trigger user;
do $$
declare r record; v_anio int;
begin
  for r in select id, mcp_id, fecha from caja_chica_gastos where sustento_tipo = 'DJ' and sustento_numero is null order by creado_en loop
    v_anio := extract(year from r.fecha)::int;
    update caja_chica_gastos set sustento_numero = lpad(siguiente_numero(r.mcp_id, 'declaraciones_juradas', v_anio)::text, 3, '0') || '-' || v_anio where id = r.id;
  end loop;
end $$;
alter table caja_chica_gastos enable trigger user;
notify pgrst, 'reload schema';

-- DNI, RUC u otro documento de quien recibe el pago en un gasto de caja chica
alter table caja_chica_gastos add column if not exists razon_doc text;
notify pgrst, 'reload schema';

-- Estados de cuenta corriente del banco (Banco de la Nación): la tesorera sube la foto o el PDF que saca del banco
create table if not exists estados_cuenta (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  banco           text not null default 'Banco de la Nación',
  cuenta          text,
  archivo_path    text not null,
  archivo_nombre  text not null,
  archivo_tipo    text not null,
  archivo_tamano  int  not null,
  nota            text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists estados_cuenta_mcp_periodo on estados_cuenta (mcp_id, periodo);

alter table estados_cuenta enable row level security;
drop policy if exists estados_cuenta_ver on estados_cuenta;
create policy estados_cuenta_ver on estados_cuenta for select using (es_miembro(mcp_id));
drop policy if exists estados_cuenta_crear on estados_cuenta;
create policy estados_cuenta_crear on estados_cuenta for insert with check (puede_registrar(mcp_id));
drop policy if exists estados_cuenta_editar on estados_cuenta;
create policy estados_cuenta_editar on estados_cuenta for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists estados_cuenta_auditoria on estados_cuenta;
create trigger estados_cuenta_auditoria after insert or update on estados_cuenta for each row execute function registrar_auditoria();
drop trigger if exists estados_cuenta_sin_borrado on estados_cuenta;
create trigger estados_cuenta_sin_borrado before delete on estados_cuenta for each row execute function prohibir_borrado();
drop trigger if exists estados_cuenta_anulable on estados_cuenta;
create trigger estados_cuenta_anulable before update on estados_cuenta for each row execute function validar_anulable();

-- Anular exige un motivo
create or replace function validar_estado_cuenta() returns trigger language plpgsql as $$
begin
  if new.anulado and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
    raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
  end if;
  return new;
end $$;
drop trigger if exists estados_cuenta_motivo on estados_cuenta;
create trigger estados_cuenta_motivo before update on estados_cuenta for each row execute function validar_estado_cuenta();

notify pgrst, 'reload schema';

-- Estado de cuenta del banco transcrito a mano por la tesorera, con las mismas columnas del original
create table if not exists extractos_transcritos (
  id                    uuid primary key default gen_random_uuid(),
  mcp_id                uuid not null references mcps(id),
  periodo               text not null check (periodo ~ '^\d{4}-\d{2}$'),
  fecha_corte           date,
  fecha_saldo_anterior  date,
  saldo_anterior        numeric(14,2),
  n_movimientos_pdf     int,
  total_cargos_pdf      numeric(14,2),
  total_abonos_pdf      numeric(14,2),
  saldo_actual_pdf      numeric(14,2),
  lineas                jsonb not null default '[]'::jsonb,
  creado_por            uuid default auth.uid() references perfiles(id),
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  unique (mcp_id, periodo)
);

alter table extractos_transcritos enable row level security;
drop policy if exists extractos_transcritos_ver on extractos_transcritos;
create policy extractos_transcritos_ver on extractos_transcritos for select using (es_miembro(mcp_id));
drop policy if exists extractos_transcritos_crear on extractos_transcritos;
create policy extractos_transcritos_crear on extractos_transcritos for insert with check (puede_registrar(mcp_id));
drop policy if exists extractos_transcritos_editar on extractos_transcritos;
create policy extractos_transcritos_editar on extractos_transcritos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists extractos_transcritos_auditoria on extractos_transcritos;
create trigger extractos_transcritos_auditoria after insert or update on extractos_transcritos for each row execute function registrar_auditoria();
drop trigger if exists extractos_transcritos_sin_borrado on extractos_transcritos;
create trigger extractos_transcritos_sin_borrado before delete on extractos_transcritos for each row execute function prohibir_borrado();

notify pgrst, 'reload schema';

-- Sitio web público (dominio principal) administrado desde el superadmin: ajustes, páginas y blog
create table if not exists web_ajustes (
  id                int primary key default 1 check (id = 1),
  nombre_sitio      text not null default 'Sebaz',
  eslogan           text,
  dominio           text,
  logo_path         text,
  whatsapp          text,
  whatsapp_mensaje  text,
  correo            text,
  telefono          text,
  direccion         text,
  redes             jsonb not null default '{}'::jsonb,
  menu              jsonb not null default '[]'::jsonb,
  boton_menu_texto  text,
  boton_menu_enlace text,
  pie_texto         text,
  pie_enlaces       jsonb not null default '[]'::jsonb,
  seo_titulo        text,
  seo_descripcion   text,
  og_imagen         text,
  ga_id             text,
  search_console    text,
  scripts_cabeza    text,
  actualizado_en    timestamptz not null default now()
);
insert into web_ajustes (id, nombre_sitio, eslogan, menu, boton_menu_texto, boton_menu_enlace)
values (1, 'Sebaz', 'Sistema de control para municipalidades de centros poblados',
  '[{"texto":"Inicio","href":"/"},{"texto":"Precios","href":"/precios"},{"texto":"Blog","href":"/blog"},{"texto":"Contacto","href":"/contacto"}]'::jsonb,
  'Ingresar al sistema', '/ingresar')
on conflict (id) do nothing;

create table if not exists web_paginas (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  titulo           text not null,
  seo_titulo       text,
  seo_descripcion  text,
  og_imagen        text,
  secciones        jsonb not null default '[]'::jsonb,
  publicada        boolean not null default true,
  en_menu          boolean not null default false,
  orden            int not null default 0,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create table if not exists blog_categorias (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  nombre       text not null,
  descripcion  text,
  orden        int not null default 0,
  creado_en    timestamptz not null default now()
);

create table if not exists blog_articulos (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  titulo           text not null,
  extracto         text,
  contenido        text not null default '',
  portada_path     text,
  categoria_id     uuid references blog_categorias(id),
  etiquetas        text[] not null default '{}',
  autor            text,
  estado           text not null default 'borrador' check (estado in ('borrador', 'programado', 'publicado', 'archivado')),
  publicado_en     timestamptz,
  destacado        boolean not null default false,
  seo_titulo       text,
  seo_descripcion  text,
  lecturas         int not null default 0,
  creado_por       uuid default auth.uid(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists blog_articulos_pub on blog_articulos (estado, publicado_en desc);

alter table web_ajustes enable row level security;
alter table web_paginas enable row level security;
alter table blog_categorias enable row level security;
alter table blog_articulos enable row level security;

-- Lectura pública de lo publicado; escritura solo del superadmin
drop policy if exists web_ajustes_leer on web_ajustes;
create policy web_ajustes_leer on web_ajustes for select using (true);
drop policy if exists web_ajustes_admin on web_ajustes;
create policy web_ajustes_admin on web_ajustes for all using (es_superadmin()) with check (es_superadmin());

drop policy if exists web_paginas_leer on web_paginas;
create policy web_paginas_leer on web_paginas for select using (publicada or es_superadmin());
drop policy if exists web_paginas_admin on web_paginas;
create policy web_paginas_admin on web_paginas for all using (es_superadmin()) with check (es_superadmin());

drop policy if exists blog_categorias_leer on blog_categorias;
create policy blog_categorias_leer on blog_categorias for select using (true);
drop policy if exists blog_categorias_admin on blog_categorias;
create policy blog_categorias_admin on blog_categorias for all using (es_superadmin()) with check (es_superadmin());

drop policy if exists blog_articulos_leer on blog_articulos;
create policy blog_articulos_leer on blog_articulos for select
  using ((estado in ('publicado', 'programado') and publicado_en is not null and publicado_en <= now()) or es_superadmin());
drop policy if exists blog_articulos_admin on blog_articulos;
create policy blog_articulos_admin on blog_articulos for all using (es_superadmin()) with check (es_superadmin());

-- Suma una lectura sin dar permiso de escribir en la tabla
create or replace function blog_sumar_lectura(p_slug text) returns void
language sql security definer set search_path = public as $$
  update blog_articulos set lecturas = lecturas + 1
  where slug = p_slug and estado in ('publicado', 'programado') and publicado_en <= now();
$$;
revoke execute on function blog_sumar_lectura(text) from public;
grant execute on function blog_sumar_lectura(text) to anon, authenticated;

-- Imágenes del sitio (bucket público; solo el superadmin sube)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('web', 'web', true) on conflict (id) do nothing;
  end if;
end $$;
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists web_subir on storage.objects;
    create policy web_subir on storage.objects for insert with check (bucket_id = 'web' and es_superadmin());
    drop policy if exists web_cambiar on storage.objects;
    create policy web_cambiar on storage.objects for update using (bucket_id = 'web' and es_superadmin());
    drop policy if exists web_borrar on storage.objects;
    create policy web_borrar on storage.objects for delete using (bucket_id = 'web' and es_superadmin());
  end if;
end $$;

insert into blog_categorias (slug, nombre, descripcion, orden) values
  ('rendicion-de-cuentas', 'Rendición de cuentas', 'Cómo rendir bien a Perené y Chanchamayo', 1),
  ('gestion-municipal', 'Gestión municipal', 'Orden y buenas prácticas en la MCP', 2),
  ('normas', 'Normas y plazos', 'Lo que dice la norma, explicado simple', 3),
  ('novedades', 'Novedades de Sebaz', 'Lo nuevo del sistema', 4)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

-- El código de cada bien del almacén sigue al último código existente (así nunca choca, aunque los correlativos se hayan reiniciado)
create or replace function emitir_nea(p_mcp uuid, p_fecha date, p_origen text, p_expediente uuid,
                                      p_proveedor text, p_documento_ref text, p_observacion text, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_bien uuid; v_n int := 0; v_desc text; v_und text; v_tipo text;
begin
  if not puede_registrar(p_mcp) then raise exception 'Sin permiso para registrar en el almacén.'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'Agregue al menos un bien.'; end if;
  if p_expediente is not null then
    select tipo into v_tipo from expedientes where id = p_expediente and mcp_id = p_mcp and estado in ('aprobado', 'rendido');
    if v_tipo is null then raise exception 'El expediente no está aprobado.'; end if;
    if v_tipo <> 'compra' then raise exception 'Solo las compras de bienes entran al almacén.'; end if;
    if not exists (select 1 from conformidades where expediente_id = p_expediente and not anulado) then
      raise exception 'Primero registre la conformidad: los bienes entran al almacén cuando se reciben conformes.';
    end if;
  end if;

  insert into notas_entrada (mcp_id, fecha, origen, expediente_id, proveedor, documento_ref, observacion)
  values (p_mcp, coalesce(p_fecha, current_date), coalesce(p_origen, 'compra'), p_expediente,
          nullif(trim(p_proveedor), ''), nullif(trim(p_documento_ref), ''), nullif(trim(p_observacion), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_desc := upper(trim(v_item->>'descripcion'));
    v_und  := upper(coalesce(nullif(trim(v_item->>'unidad'), ''), 'UNIDAD'));
    if v_desc = '' then continue; end if;
    select id into v_bien from almacen_bienes where mcp_id = p_mcp and descripcion = v_desc and unidad = v_und;
    if v_bien is null then
      insert into almacen_bienes (mcp_id, codigo, descripcion, unidad)
      values (p_mcp, coalesce((select max(codigo) from almacen_bienes where mcp_id = p_mcp), 0) + 1, v_desc, v_und)
      returning id into v_bien;
    end if;
    v_n := v_n + 1;
    insert into nota_entrada_items (mcp_id, nea_id, item, bien_id, cantidad, precio_unitario)
    values (p_mcp, v_id, v_n, v_bien, (v_item->>'cantidad')::numeric, coalesce((v_item->>'precio_unitario')::numeric, 0));
  end loop;
  if v_n = 0 then raise exception 'Agregue al menos un bien.'; end if;
  return v_id;
end $$;

grant execute on function emitir_nea(uuid, date, text, uuid, text, text, text, jsonb) to authenticated;
notify pgrst, 'reload schema';

commit;
select 'Base de datos actualizada' as resultado;
-- =====================================================================
-- Fuentes de ingresos editables (con RUC, periodicidad y mes de inicio)
-- y varias cuentas bancarias por MCP
-- =====================================================================

-- Varias fuentes "otra" por MCP (otra institución que también transfiere)
alter table fuentes drop constraint if exists fuentes_mcp_id_tipo_key;
alter table fuentes drop constraint if exists fuentes_tipo_check;
alter table fuentes add constraint fuentes_tipo_check check (tipo in ('distrito', 'provincia', 'propios', 'otra'));
create unique index if not exists fuentes_tipo_unico on fuentes (mcp_id, tipo) where tipo <> 'otra';

-- Cada cuánto llega la transferencia y desde qué mes (1 = enero) para trimestral, semestral o anual
alter table fuentes add column if not exists frecuencia text not null default 'mensual';
alter table fuentes drop constraint if exists fuentes_frecuencia_check;
alter table fuentes add constraint fuentes_frecuencia_check check (frecuencia in ('mensual', 'trimestral', 'semestral', 'anual'));
alter table fuentes add column if not exists mes_inicio smallint not null default 1;
alter table fuentes drop constraint if exists fuentes_mes_inicio_check;
alter table fuentes add constraint fuentes_mes_inicio_check check (mes_inicio between 1 and 12);
-- RUC (o DNI) de la institución que transfiere
alter table fuentes add column if not exists documento text;

-- La fuente de ingresos propios de toda MCP nueva (ya sin la restricción única completa)
create or replace function crear_fuente_propios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into fuentes (mcp_id, tipo, municipalidad, monto_mensual, formato)
  values (new.id, 'propios', 'Ingresos propios (recursos directamente recaudados)', 0, 'general')
  on conflict do nothing;
  return new;
end $$;

-- Cuentas bancarias de la MCP (la principal sigue en la ficha de la MCP)
create table if not exists cuentas_bancarias (
  id         uuid primary key default gen_random_uuid(),
  mcp_id     uuid not null references mcps(id),
  banco      text not null,
  numero     text not null,
  alias      text,
  activo     boolean not null default true,
  creado_por uuid default auth.uid() references perfiles(id),
  creado_en  timestamptz not null default now(),
  unique (mcp_id, banco, numero)
);
alter table cuentas_bancarias enable row level security;
drop policy if exists cuentas_bancarias_ver on cuentas_bancarias;
create policy cuentas_bancarias_ver on cuentas_bancarias for select using (es_miembro(mcp_id) or es_soporte());
drop policy if exists cuentas_bancarias_crear on cuentas_bancarias;
create policy cuentas_bancarias_crear on cuentas_bancarias for insert with check (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[]));
drop policy if exists cuentas_bancarias_editar on cuentas_bancarias;
create policy cuentas_bancarias_editar on cuentas_bancarias for update using (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[]));
drop trigger if exists cuentas_bancarias_auditoria on cuentas_bancarias;
create trigger cuentas_bancarias_auditoria after insert or update on cuentas_bancarias for each row execute function registrar_auditoria();
drop trigger if exists cuentas_bancarias_sin_borrado on cuentas_bancarias;
create trigger cuentas_bancarias_sin_borrado before delete on cuentas_bancarias for each row execute function prohibir_borrado();
-- =====================================================================
-- Fijar desde qué número sigue cada documento (una MCP que ya avanzó antes).
-- Solo el administrador; la app impide poner un número menor a lo ya emitido.
-- Queda registrado en la auditoría.
-- =====================================================================
create or replace function fijar_correlativo(p_mcp uuid, p_tipo text, p_anio int, p_ultimo int) returns void
language plpgsql security definer set search_path = public as $$
declare v_antes int;
begin
  if not (es_soporte() or tiene_rol(p_mcp, array['admin']::rol_mcp[])) then
    raise exception 'Solo el administrador puede cambiar la numeración.';
  end if;
  if p_ultimo < 0 or p_ultimo > 999998 then
    raise exception 'Número no válido.';
  end if;
  select ultimo into v_antes from correlativos where mcp_id = p_mcp and tipo = p_tipo and anio = p_anio;
  insert into correlativos (mcp_id, tipo, anio, ultimo) values (p_mcp, p_tipo, p_anio, p_ultimo)
  on conflict (mcp_id, tipo, anio) do update set ultimo = excluded.ultimo;
  insert into auditoria (mcp_id, user_id, tabla, registro_id, accion, antes, despues)
  values (p_mcp, auth.uid(), 'correlativos', p_tipo || '/' || p_anio, 'editar',
          jsonb_build_object('ultimo', coalesce(v_antes, 0)), jsonb_build_object('ultimo', p_ultimo, 'proximo', p_ultimo + 1));
end $$;
revoke execute on function fijar_correlativo(uuid, text, int, int) from public, anon;
grant execute on function fijar_correlativo(uuid, text, int, int) to authenticated;
-- =====================================================================
-- Vouchers de depósito de los ingresos propios: la tesorera deposita lo recaudado
-- (a diario, por semana, por quincena o por mes) y sube la foto o el PDF del voucher.
-- Sirven para comprobar que lo depositado cuadra con los recibos emitidos.
-- =====================================================================
create table if not exists depositos_ingresos (
  id               uuid primary key default gen_random_uuid(),
  mcp_id           uuid not null references mcps(id),
  fecha            date not null,
  monto            numeric(12,2) not null check (monto > 0),
  numero_operacion text,
  desde            date,
  hasta            date,
  nota             text,
  archivo_path     text,
  archivo_nombre   text,
  archivo_tipo     text,
  archivo_tamano   int,
  anulado          boolean not null default false,
  anulado_motivo   text,
  creado_por       uuid default auth.uid() references perfiles(id),
  creado_en        timestamptz not null default now()
);
create index if not exists depositos_ingresos_mcp_fecha on depositos_ingresos (mcp_id, fecha);

alter table depositos_ingresos enable row level security;
drop policy if exists depositos_ingresos_ver on depositos_ingresos;
create policy depositos_ingresos_ver on depositos_ingresos for select using (es_miembro(mcp_id));
drop policy if exists depositos_ingresos_crear on depositos_ingresos;
create policy depositos_ingresos_crear on depositos_ingresos for insert with check (puede_registrar(mcp_id));
drop policy if exists depositos_ingresos_editar on depositos_ingresos;
create policy depositos_ingresos_editar on depositos_ingresos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists depositos_ingresos_auditoria on depositos_ingresos;
create trigger depositos_ingresos_auditoria after insert or update on depositos_ingresos for each row execute function registrar_auditoria();
drop trigger if exists depositos_ingresos_sin_borrado on depositos_ingresos;
create trigger depositos_ingresos_sin_borrado before delete on depositos_ingresos for each row execute function prohibir_borrado();
drop trigger if exists depositos_ingresos_anulable on depositos_ingresos;
create trigger depositos_ingresos_anulable before update on depositos_ingresos for each row execute function validar_anulable();

create or replace function validar_deposito_ingresos() returns trigger language plpgsql as $$
begin
  if new.anulado and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
    raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
  end if;
  if new.desde is not null and new.hasta is not null and new.hasta < new.desde then
    raise exception 'La fecha final del periodo que cubre no puede ser anterior a la inicial.';
  end if;
  return new;
end $$;
drop trigger if exists depositos_ingresos_validar on depositos_ingresos;
create trigger depositos_ingresos_validar before insert or update on depositos_ingresos for each row execute function validar_deposito_ingresos();

notify pgrst, 'reload schema';
-- El sistema pasa a llamarse ZEBAZ: se actualizan los textos guardados de la web pública
update web_ajustes set nombre_sitio = 'Zebaz' where nombre_sitio = 'Sebaz';
update blog_categorias set nombre = 'Novedades de Zebaz' where nombre = 'Novedades de Sebaz';
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
-- =====================================================================
-- La caja chica se abre desde un expediente: se pide el fondo con un
-- requerimiento («Apertura de caja chica»); al aprobarlo, la caja del mes
-- se abre sola con el monto, el cheque y el responsable del expediente.
-- =====================================================================
alter table expedientes drop constraint if exists expedientes_tipo_check;
alter table expedientes add constraint expedientes_tipo_check
  check (tipo in ('compra', 'servicio', 'pago_fijo', 'caja_chica'));

alter table expedientes add column if not exists caja_periodo text;
alter table expedientes add column if not exists caja_responsable_id uuid references perfiles(id);
alter table cajas_chicas add column if not exists expediente_id uuid references expedientes(id);
create index if not exists cajas_chicas_expediente on cajas_chicas (expediente_id);

-- Un expediente de caja chica no lleva cotizaciones, orden, conformidad ni comprobante propio
-- (el comprobante se genera al liquidar la caja, por lo gastado)
create or replace function validar_expediente_caja() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from expedientes where id = new.expediente_id and tipo = 'caja_chica') then
    raise exception 'El requerimiento de caja chica no lleva cotizaciones, orden, conformidad ni comprobante: el comprobante sale al liquidar la caja.';
  end if;
  return new;
end $$;
drop trigger if exists cotizaciones_exp_caja on cotizaciones;
create trigger cotizaciones_exp_caja before insert on cotizaciones for each row execute function validar_expediente_caja();
drop trigger if exists ordenes_exp_caja on ordenes;
create trigger ordenes_exp_caja before insert on ordenes for each row execute function validar_expediente_caja();
drop trigger if exists conformidades_exp_caja on conformidades;
create trigger conformidades_exp_caja before insert on conformidades for each row execute function validar_expediente_caja();
drop trigger if exists comprobantes_exp_caja on comprobantes_pago;
create trigger comprobantes_exp_caja before insert on comprobantes_pago for each row
  when (new.expediente_id is not null) execute function validar_expediente_caja();

-- Al aprobar el requerimiento, se abre la caja chica del mes
create or replace function abrir_caja_al_aprobar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_monto numeric;
begin
  if new.tipo = 'caja_chica' and new.estado = 'aprobado' and old.estado is distinct from 'aprobado'
     and not exists (select 1 from cajas_chicas where expediente_id = new.id) then
    select coalesce(sum(total), 0) into v_monto from expediente_items where expediente_id = new.id and not anulado;
    if v_monto <= 0 then raise exception 'El requerimiento de caja chica no tiene monto.'; end if;
    if new.fuente_id is null or new.caja_periodo is null or new.caja_responsable_id is null then
      raise exception 'Faltan datos para abrir la caja chica (dinero, mes o responsable).';
    end if;
    insert into cajas_chicas (mcp_id, periodo, fuente_id, monto_fondo, responsable_id, numero_cheque, expediente_id)
    values (new.mcp_id, new.caja_periodo, new.fuente_id, v_monto, new.caja_responsable_id, new.cheque_previsto, new.id);
  end if;
  return new;
end $$;
drop trigger if exists expedientes_abre_caja on expedientes;
create trigger expedientes_abre_caja after update on expedientes
  for each row execute function abrir_caja_al_aprobar();

notify pgrst, 'reload schema';
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
-- Datos fijos de la MCP para que el comprobante de pago salga completo:
-- codificación programática por fuente, cuentas contables, CCI y tipo de operación.
alter table mcps add column if not exists datos_cp jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
-- =====================================================================
-- TUPA y TUSNE de la municipalidad, para ver el costo y los requisitos al
-- emitir un recibo de ingreso. Cada fila es un procedimiento del TUPA
-- (con requisitos, derechos de tramitación, plazo y calificación) o un
-- servicio no exclusivo del TUSNE (con su unidad y costo).
--   · mcp_id vacío = TUPA modelo (el de la Municipalidad Centro Poblado La
--     Florida, 2026), visible para todas las municipalidades.
--   · mcp_id con valor = el TUPA propio de esa municipalidad.
-- Nada se borra: lo que ya no rige se marca como no activo.
-- =====================================================================
create table if not exists tupa_procedimientos (
  id               uuid primary key default gen_random_uuid(),
  mcp_id           uuid references mcps(id),
  tipo             text not null default 'tupa' check (tipo in ('tupa', 'tusne')),
  area             text not null,
  numero           text not null,
  nombre           text not null,
  base_legal       text,
  requisitos       jsonb not null default '[]'::jsonb,
  derechos         jsonb not null default '[]'::jsonb,
  unidad           text,
  plazo            text,
  calificacion     text,
  inicio           text,
  autoridad        text,
  reconsideracion  text,
  apelacion        text,
  orden            int not null default 0,
  activo           boolean not null default true,
  fuente           text,
  creado_por       uuid default auth.uid() references perfiles(id),
  creado_en        timestamptz not null default now()
);
create index if not exists tupa_mcp on tupa_procedimientos (mcp_id, tipo, orden);

alter table tupa_procedimientos enable row level security;
drop policy if exists tupa_ver on tupa_procedimientos;
create policy tupa_ver on tupa_procedimientos for select
  using (mcp_id is null or es_miembro(mcp_id) or es_soporte());
drop policy if exists tupa_crear on tupa_procedimientos;
create policy tupa_crear on tupa_procedimientos for insert
  with check (mcp_id is not null and (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[])));
drop policy if exists tupa_editar on tupa_procedimientos;
create policy tupa_editar on tupa_procedimientos for update
  using (mcp_id is not null and (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[])));
drop trigger if exists tupa_sin_borrado on tupa_procedimientos;
create trigger tupa_sin_borrado before delete on tupa_procedimientos for each row execute function prohibir_borrado();

-- TUPA modelo: se carga una sola vez
do $$
begin
  if not exists (select 1 from tupa_procedimientos where mcp_id is null) then
    insert into tupa_procedimientos
      (mcp_id, tipo, area, numero, nombre, base_legal, requisitos, derechos, unidad, plazo, calificacion, inicio, autoridad, reconsideracion, apelacion, orden, fuente, creado_por)
    select null, x->>'tipo', x->>'area', x->>'numero', x->>'nombre', nullif(x->>'base_legal', ''),
           coalesce(x->'requisitos', '[]'::jsonb), coalesce(x->'derechos', '[]'::jsonb),
           nullif(x->>'unidad', ''), nullif(x->>'plazo', ''), nullif(x->>'calificacion', ''), nullif(x->>'inicio', ''),
           nullif(x->>'autoridad', ''), nullif(x->>'reconsideracion', ''), nullif(x->>'apelacion', ''), n::int, x->>'fuente', null
    from jsonb_array_elements($tupa$[{"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "1.0", "nombre": "EXPEDICION DE COPIAS CERTIFICADAS, FEDATEADAS DE DISPOSITIVOS MUNICIPALES, DOCUMENTOS EN TRAMITES Y EN GENERAL ARCHIVOS MUNICIPALES", "base_legal": "Ley N° 27444, Ley N° 27806, Ley N° 043-2003, D.S.N°079-2007- PCM, Ley Orgánica de Municipalidades N° 27972", "requisitos": ["1. Solicitud dirigida a la Municipalidad CC.PP La Florida con atención a Secretaría General:", "- Nombre y apellidos completos, domicilio, DNI, y en el caso de calidad de representante(a) de la persona a quien representa.", "- Dirección donde desea ser notificado.", "- Expresión concreta de la información a la que se desea acceder.", "2. Recibo de pago por derechos de certificación y reproducción.", "2.1 Documentos varios – p/hoja (Expedientes, licitaciones, etc.)"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Documentos varios – p/hoja", "pct": "0.05%", "monto": 2.8}], "unidad": "", "plazo": "5 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "2.0", "nombre": "EXPEDICIÓN DE DOCUMENTOS OFICIALES EN FOTOCOPIAS SIMPLES", "base_legal": "Ley N° 27444 Art. 55.3, Ley N° 27806, Ley Orgánica de Municipalidades Ley N° 27972", "requisitos": ["1. Solicitud dirigida a la Municipalidad CC.PP La Florida con atención a Secretaría General:", "- Nombre y apellidos completos, domicilio, DNI, y en el caso de calidad de representante(a) de la persona a quien representa.", "- Dirección donde desea ser notificado.", "- Expresión concreta de la información a la que se desea acceder.", "IMPORTANTE: El caso de reproducción se estima que luego de aprobada la información solicitada, el pago del caso de reproducción del solicitante se estimara a partir del 7° día hábil de presentarse la solicitud.", "2. Recibo de pago por derechos de certificación y reproducción. Este procedimiento es gratuito.", "2.1 Copia en tamaño A4 por hoja"], "derechos": [{"detalle": "Trámite", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "0.01%", "monto": 0.6, "texto": null}], "unidad": "", "plazo": "7 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "3.0", "nombre": "ACCESO A LA INFORMACIÓN QUE POSEAN O PRODUZCAN LAS DIVERSAS UNIDADES ORGÁNICAS", "base_legal": "Ley N° 27806, Ley N° 043-2003, D.S.072-2003-PCM Reglamento Ley Transparencia, Ley Orgánica de Municipalidades", "requisitos": ["1. Solicitud dirigida a la Municipalidad CC.PP La Florida con atención a Secretaría General:", "- Nombre y apellidos completos, domicilio, DNI, y en el caso de calidad de representante de persona jurídica, copia del DNI.", "- Copia de representatividad o vigencia de poder del representante de la persona jurídica.", "- Expresión concreta de la información se desea acceder.", "2. Recibo de pago por derechos de tramitación.", "2.1 Copia en tamaño A4 por hoja"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Copia certificada", "pct": "0.0494%", "monto": 2.7}], "unidad": "", "plazo": "7 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "4.0", "nombre": "BUSQUEDA DE EXPEDIENTE", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General, Ley N° 27806, D.S.135-2015/EF TUO Código Tributario 21/06/2013", "requisitos": ["Se adiciona de días hábiles de prórroga para atender este procedimiento a la búsqueda de información en los archivos de años anteriores. Se emitirá informe cuando no sea posible la entrega de la información solicitada explicando los motivos. Expediente, el número y/o fecha de presentación del expediente, la materia de búsqueda."], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}], "unidad": "", "plazo": "3 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "5.0", "nombre": "RECONOCIMIENTO Y REGISTRO DE COMITÉS DE VASO DE LECHE Y COMEDORES POPULARES", "base_legal": "Ley N° 24059, DS. Creación Programa Vaso de Leche, Ley N° 27470 y sus modificaciones, Ley Marco de Licencias de Funcionamiento N° 28976, Ley N° 27712 Administración Vaso de leche, Ley N° 27972 Orgánica de Municipalidades Art. 84", "requisitos": ["1 Solicitud dirigida al Alcalde.", "2 Fotocopia simple del Acta de Constitución del Comité.", "3 Fotocopia simple de Estatuto del Comité.", "4 Fotocopia fedateada del Padrón de Beneficiarios.", "5 Relación de integrantes de la Junta Directiva, con copia DNI.", "6 Fotografías fedateadas de acta de sesión de elecciones y juramentación.", "7 Por derecho de R.A. de reconocimiento"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Por derecho de R.A. de reconocimiento", "pct": "0.4938%", "monto": 27.2}], "unidad": "", "plazo": "20 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "6.0", "nombre": "RECONOCIMIENTO DE ORGANIZACIÓN SOCIAL", "base_legal": "Ley N° 27972 Orgánica de Municipalidades Art. 118°, Ley N° 27444, Ley del Procedimiento Administrativo General, Ley N° 20900, Ley del Servicio Administrativo", "requisitos": ["1. Solicitud de Reconocimiento dirigida al Alcalde.", "2. Copia de Acta de Constitución, o fundación de organización social.", "3. Copia del Estatuto y/o Acta de Aprobación.", "4. Nómina de los miembros de la Organización Social.", "5. Copia de los DNI de los miembros de la Junta Directiva.", "6 Por derecho de R.A. de reconocimiento"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Por derecho de R.A. de reconocimiento", "pct": "0.4938%", "monto": 27.2}], "unidad": "", "plazo": "7 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "7.0", "nombre": "RENOVACIÓN DE JUNTAS DIRECTIVAS", "base_legal": "Ley N° 27972 Orgánica de Municipalidades Art. 118°, Ley N° 27444, Ley del Procedimiento Administrativo General, Ley 20060, Ley del Silencio Administrativo", "requisitos": ["1. Solicitud de Reconocimiento dirigida al Alcalde.", "2. Copia de DNI.", "3. Documentos sustentatorios.", "4. Por derecho de reconocimiento"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Fotocopia fedateada del Acta de Juramentación", "pct": "0.4938%", "monto": 27.2}], "unidad": "", "plazo": "3 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "8.0", "nombre": "PRESENTACIÓN DE MEMORIAL O ATENCIÓN DE DENUNCIA VECINAL", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General, Ley N° 27972 Orgánica de Municipalidades Art. 118°, Ley N° 20060", "requisitos": ["1. Solicitud o Memorial dirigido al Alcalde.", "2 Copia de DNI", "3 Adjuntar copia de documentos sustentatorios"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Fotocopia fedateada del Acta", "pct": "0.4938%", "monto": 27.2}], "unidad": "", "plazo": "30 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "9.0", "nombre": "CERTIFICACIONES Y/O CONSTANCIAS DIVERSAS", "base_legal": "Ley N° 27972 Orgánica de Municipalidades, Ley N° 27444, Ley del Procedimiento Administrativo General, D.L. N° 776, Ley de Tributación Municipal", "requisitos": ["1. Solicitud de Reconocimiento dirigida al Alcalde.", "2 Copia de DNI", "3 Documentos sustentatorios.", "4 Por derecho de reconocimiento"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Por derecho", "pct": "0.4938%", "monto": 27.2}], "unidad": "", "plazo": "7 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "10.0", "nombre": "RECTIFICACIÓN DE DIVERSOS DOCUMENTOS (sólo en caso que el error no sea imputable a la administración)", "base_legal": "D.S.132- 2013-EF, TUO Código Tributario 21/06/2013", "requisitos": ["1. Solicitud con carácter de Declaración Jurada, con referencia precisa de la rectificación solicitada y el área a cargo de emitirla.", "- Nombre y apellidos completos, domicilio, DNI, y en el caso de calidad de representante, o de la persona a quien representa.", "- Datos del expediente que contiene el error.", "2. Recibo de pago por derecho de tramitación", "ADICIONALES: En el caso de la rectificación no se altera lo sustancial de su contenido, n, el sentido de la decisión.", "-01 copia del documento que acredita y sustente la rectificación solicitada."], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "ADICIONALES (cuando el caso requiera)", "pct": "0.4938%", "monto": 27.2}], "unidad": "", "plazo": "7 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "11.0", "nombre": "OTORGAMIENTO DE CERTIFICADOS Y CONSTANCIAS DE TRABAJO (Por primera vez)", "base_legal": "Ley N° 276 DS N° 005-90-PCM QS N° 003-97-TR, Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al Alcalde", "2. Copia simple del DNI del interesado"], "derechos": [{"detalle": "Trámite", "gratuito": true}], "unidad": "", "plazo": "5 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "12.0", "nombre": "OTORGAMIENTO DE DUPLICADO DE CERTIFICADOS Y CONSTANCIA DE TRABAJO", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al Alcalde", "2. Copia simple del DNI del interesado", "3 Recibo de Pago"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Solicitud por cargo de derecho", "pct": "S/0.0025", "monto": 13.8}], "unidad": "", "plazo": "2 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "13.0", "nombre": "AUTORIZACIÓN DE PRACTICAS PRE- PROFESIONALES", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al Alcalde", "2. Copia simple del DNI del interesado", "3 Carta de presentación del Centro de Estudios", "4 Declaración Jurada simple para realizar prácticas"], "derechos": [{"detalle": "Trámite", "gratuito": true}], "unidad": "", "plazo": "3 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "14.0", "nombre": "OTORGAMIENTO DE CONSTANCIAS DE PRACTICAS PRE- PROFESIONALES (Por primera vez)", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al Alcalde", "2. Copia simple del DNI del interesado", "3 Carta de presentación del Centro de Estudios", "4 Declaración Jurada simple para realizar prácticas"], "derechos": [{"detalle": "Trámite", "gratuito": true}], "unidad": "", "plazo": "2 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SECRETARIA GENERAL", "numero": "15.0", "nombre": "OTORGAMIENTO DE COPIA DE CONTRATOS DE REMUNERACIÓN- CERTIFICADA", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al Alcalde", "2. Copia simple del DNI del interesado", "3 Recibo de pago"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}, {"detalle": "Por copia certificada", "pct": "0.25%", "monto": 13.8}], "unidad": "", "plazo": "2 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "1.0", "nombre": "DECLARACIÓN JURADA DE TERRENO URBANO O RURAL", "base_legal": "Artículo 89° del D.S. N° 133-2013-EF, Texto Único Ordenado del Código Tributario (Pub. 22- 06-2013), Ley N° 27444, Ley Orgánica de Municipalidades", "requisitos": ["Presentación de los documentos originales que acrediten la propiedad o la posesión.", "2. Copia simple de los documentos que acrediten la transferencia u otros.", "3. Formulario del DNI vigente del solicitante, y en caso de representación mediante Poder con documento público o privado y firma legalizada.", "4. Derecho de Tramite de Terreno Urbano o Rural", "5. Derecho de Tramite de Base de Inscripción"], "derechos": [{"detalle": "", "pct": "S/0.0074", "monto": 40.7}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "1.1", "nombre": "DECLARACIÓN JURADA DE BASE DE INSCRIPCIÓN", "base_legal": "Artículo 89° D.S. N° 133-2013-EF, Texto Único Ordenado del Código Tributario (Pub.22-06-2013)", "requisitos": ["1. Presentación de los documentos originales que acrediten la transferencia o renta o pérdida del dominio."], "derechos": [{"detalle": "", "pct": "S/0.0025", "monto": 13.8}, {"detalle": "Copia simple de DNI del interesado", "pct": "0.1975%", "monto": 10.9}], "unidad": "", "plazo": "10 días", "calificacion": "Positivo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "2.0", "nombre": "AUTORIZACIÓN TEMPORAL PARA ACTIVIDADES BAILABLES Y AFINES", "base_legal": "Artículo 89° del D.S. N° 133-2013-EF, Ley N° 27972, Ley Orgánica de Municipalidades, Ley N° 20060, Ley del Silencio Administrativo", "requisitos": ["1. Solicitud dirigida al Alcalde.", "2. Copia de contrato de alquiler del local donde se realizará el evento.", "3. Copias del DNI si es persona natural o RUC, si es persona jurídica.", "4. Copias de fotocheck o del organizador del evento a cumplir con las normas de seguridad y velar por el orden interno y violento, antes, durante y después del evento.", "5. Copia de Licencia de Funcionamiento Municipal", "6. Declaración jurada de conformidad", "- Baile con Grupo Tropical", "- Baile con conjunta", "- Cabinas de Internet, Video Juegos, Locutorios"], "derechos": [{"detalle": "", "pct": "0.1975%", "monto": 10.9}], "unidad": "", "plazo": "10 días", "calificacion": "Positivo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "3.0", "nombre": "DUPLICADO DE RECIBOS DE PAGO", "base_legal": "Ley N° 27444, art. 55.3°, Ley del Procedimiento Administrativo General, 11 abril 2001, D.S. 133-2013-EF, Art.92° k TUO Código Tributario 21/06/2013", "requisitos": ["1. Solicitud dirigida al Alcalde.", "2. Copia simple del DNI si es persona natural o del RUC, si es persona jurídica.", "3. Copia simple de poder del representante legal, en el caso de persona jurídica. Acreditar la vigencia del poder. Chequeo de ubicación indicando dimensión y contenido Diseño de anuncio de la fachada (Fachada). Aut. Notarial o Declaración Jurada de la Junta Dir. Fotocopia fedateada del Acta de Juramentación"], "derechos": [{"detalle": "", "pct": "0.12%", "monto": 6.6}], "unidad": "", "plazo": "5 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Tribunal Fiscal 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "4.0", "nombre": "RECURSO DE RECLAMACIÓN EN CONTRA DE", "base_legal": "D.S.133- 2013-EF, Art.135° al 142°- TUO Código Tributario 21/06/2013 1. Resoluciones de determinación 2. Resoluciones de multa 3. Órdenes de pago como recurso no contencioso 4. Resoluciones que resuelven solicitudes de devolución, determinación o pérdida de fraccionamiento. 5. Resoluciones fictas sobre recurso no contencioso.", "requisitos": ["1. Escrito fundamentado, firmado por el contribuyente o su representante.", "2 Copia legible del DNI del declarante", "3 Documento que acredite la autorización del trámite"], "derechos": [{"detalle": "", "pct": "0.40%", "monto": 22.0}], "unidad": "", "plazo": "30 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Tribunal Fiscal 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "5.0", "nombre": "REPORTE ANALÍTICO DE DEUDA", "base_legal": "D.S.133- 2013-EF, Art.135° al 142°- TUO Código Tributario 21/06/2013", "requisitos": ["1. Solicitud dirigida al alcalde.", "2. Copia DNI si es persona natural o el RUC, si es persona jurídica.", "3. Copia simple de poder del representante legal en el caso de persona jurídica."], "derechos": [{"detalle": "Trámite", "gratuito": true}], "unidad": "", "plazo": "1 día", "calificacion": "Automático", "inicio": "Unidad de Trámite", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Tribunal Fiscal 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "6.0", "nombre": "OTORGAMIENTO DE CARNÉ DE SANIDAD", "base_legal": "Ley N° 27444, art. 55.3°, Ley del Procedimiento Administrativo General, D.S.133-2013/EF Art. 92° e TUO Código Tributario 21/06/2013, Ley N° 26842, Ley del Salud, D.S. N° 007-98 SA Reglamento sobre Vigilancia y Control Sanitario de Alimentos y Bebidas", "requisitos": ["1. Cumplir con examen clínico, y capacitación en un curso (Examen Médico, Análisis de Laboratorio, en Posol Médico).", "2 Copia simple DNI vigente.", "3 Una fotografía tamaño carné", "4 Recibo de Pago (La vigencia del Carné es de SEIS (06) meses)"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "3 días", "calificacion": "Negativo", "inicio": "Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "7.0", "nombre": "DUPLICADO DE CARNÉ DE SANIDAD", "base_legal": "Ley N° 27444, Ley Orgánica de Municipalidades Ley N° 27972, Ley N° 53.3°, Ley del Proced. Administrativo General", "requisitos": ["1. Una fotografía tamaño carné.", "2 Copia simple DNI vigente.", "3 Recibo de Pago"], "derechos": [{"detalle": "", "pct": "0.25%", "monto": 13.8}], "unidad": "", "plazo": "2 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "8.0", "nombre": "AUTORIZACIÓN PARA FUNCIONAMIENTO DE ESTABLECIMIENTO COMERCIAL INDUSTRIAL Y/O SERVICIOS (Sujeto a fiscalización posterior)", "base_legal": "Ley Orgánica de Municipalidades N° 27972, Art. 69 y 83°, Ley Marco de Licencias de Funcionamiento N° 28976, D.S. 006-2013-PCM, Reglamento de Inspecciones Técnicas de Seguridad en Edificaciones", "requisitos": ["1. Solicitud de Licencia de Funcionamiento, con carácter de Declaración Jurada, que incluye: a. Número RUC. DNI o Carné de Extranjería del solicitante según corresponda. b. Vigencia de poder del representante legal o en el caso de personas jurídicas o naturales, según corresponda.", "2. Declaración Jurada de Observancia de condiciones de Seguridad e Inspección Técnica de Seguridad en Defensa Civil de detalles o multidisciplinaria según corresponda.", "3 Recibo del Pago del derecho de Tramitación.", "4. Adicionalmente, deberán presentarse los siguientes requisitos según corresponda. TARIFAS: BODEGAS (menos de 1 UIT) S/ 108.90 - Reno. S/ 54.45 BODEGAS (más de 1 UIT) S/ 203.50 - Reno. S/ 68.00 FERRETERÍA S/ 203.50 - Reno. S/ 68.00 BAZAR S/150.00 - Reno. S/30.00 COPIAS E IMPRESIONES S/150.00 - Reno. S/50.00 BOTICAS S/200.00 - Reno. S/50.00 CARPINTERIAS S/150.00 - Reno. S/50.00 CERRAJERÍA S/150.00 - Reno. S/50.00 MECÁNICA AUTOMOTRIZ S/200.00 - Reno. S/50.00 TALLERES DE MOTO S/150.00 - Reno. S/50.00 VENTA DE GAS S/300.00 - Reno. S/100.00 CABINAS DE INTERNET, VIDEO JUEGOS, LOCUTORIOS S/150.00 - Reno. S/50.00 HOSPEDAJE S/200.00 - Reno. S/50.00 BARES S/300.00 - Reno. S/100.00 CONSULTORES PROFESIONALES S/200.00 - Reno. S/50.00 RESTAURANTES/FONDAS PRIVADAS S/200.00 - Reno. S/50.00 AGROPECUARIAS S/150.00 - Reno. S/50.00 PANADERÍA S/150.00 - Reno. S/50.00 BILLAR S/150.00 - Reno. S/50.00 RADIO EMISORAS S/200.00 - Reno. S/50.00 RECREOS S/150.00 - Reno. S/50.00"], "derechos": [{"detalle": "", "pct": "1.98%-7.41%", "monto": null, "texto": "S/ 108.90 - S/ 408.00"}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "9.0", "nombre": "DUPLICADO DE LICENCIA MUNICIPAL DE FUNCIONAMIENTO POR DETERIORO O PÉRDIDA", "base_legal": "Ley Orgánica de Municipalidades N° 27972, Ley Marco de Licencias de Funcionamiento N° 28976, Ley N° 27444-Ley del Procedimiento Administrativo General", "requisitos": ["1 Solicitud dirigida al Alcalde", "2 Declaración Jurada de no tener deudas tributarias y no tributarias.", "3 Devolución de Licencia (en original)"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "Constancia de no poseer licencia anterior", "pct": "0.62%", "monto": 34.1}], "unidad": "", "plazo": "2 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "10.0", "nombre": "ANULACIÓN DE LICENCIA MUNICIPAL DE FUNCIONAMIENTO", "base_legal": "Ley Marco de Licencias de Funcionamiento N° 28976", "requisitos": ["1. Solicitud dirigida al Alcalde.", "2. Constancia de no tener deudas tributarias y no tributarias.", "3 Devolución de Licencia de Funcionamiento anterior"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "3 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "11.0", "nombre": "AUTORIZACIÓN PARA SAFACASAS", "base_legal": "Ley N° 27444-Ley del Procedimiento Administrativo General, Ley Orgánica de Municipalidades N° 27972, Art. 69 y 83°", "requisitos": ["1. Solicitud escrito", "2. Declaración Jurada no causar daños a los alrededores", "3. Pago por derecho"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "Por declaración jurada", "pct": "0.74%", "monto": 40.7}], "unidad": "", "plazo": "2 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "12.0", "nombre": "AUTORIZACIÓN PARA REALIZACIÓN, INSTALACIÓN Y FUNCIONAMIENTO DE CIRCOS, JUEGOS MECÁNICOS Y SIMILARES", "base_legal": "Ley Orgánica de Municipalidades N° 27972, Art. 83, Ley N° 27444, Ley Marco de Licencias de Funcionamiento, Ley N° 27444-Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al Alcalde.", "2. Copia del DNI de los participantes del área", "3. Certificado de salud de los operadores", "4.1 Hasta 500 áreas por día.", "4.2 de S/a 500 a 1000 áreas por día", "5. Copia de Licencia de Funcionamiento Municipal", "6. Por derecho de Licencia de Funcionamiento del SENASA"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "Autorización más de 300 m2 por día - Hasta 300 m2", "pct": "0.15%", "monto": 8.2}, {"detalle": "Autorización por más de 300 m2 por día", "pct": "0.25%", "monto": 13.8}], "unidad": "", "plazo": "5 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "13.0", "nombre": "AUTORIZACIÓN MUNICIPAL PARA ESTABLECIMIENTO DE BENEFICIO DE AVES", "base_legal": "Ley Orgánica de Municipalidades N° 27972, Art. 69°, DS N° 015- 2003-AG, Ley N° 27444-Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al alcalde.", "2. Certificado de salud de los operadores", "3. Declaración jurada de conformidad", "5. Copia de Licencia de Funcionamiento Municipal", "6. Por derecho de Licencia del SENASA"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "Constancia sanitaria de la actividad - hasta 500 aves", "pct": "0.25%", "monto": 13.8}, {"detalle": "Por más de 500 aves", "pct": "0.49%", "monto": 27.0}], "unidad": "", "plazo": "5 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "14.0", "nombre": "EXPEDICIÓN DE CONSTANCIA DE NO ADEUDO", "base_legal": "Ley Orgánica de Municipalidades N° 27972, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud dirigida al alcalde.", "2. Copia del DNI si es persona natural o del RUC, si es persona jurídica.", "3. Por derecho de Certificado No Adeudo"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "Por constancia de No adeudo adicional", "pct": "0.12%", "monto": 6.6}], "unidad": "", "plazo": "5 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "ADMINISTRACIÓN TRIBUTARIA", "numero": "15.0", "nombre": "AUTORIZACIÓN, INSTALACIÓN DE ANUNCIOS Y/O AVISOS PUBLICITARIOS OTARIOS", "base_legal": "Numeral 1.4.4 del Artículo 79° de la Ley N° 27972, Ley Orgánica de Municipalidades", "requisitos": ["1. Solicitud escrito", "2. Copia del DNI indicando dimensión y contenido", "3. Diseño de anuncio indicando dimensión y contenido", "4. Anuncio y/o Aviso publicitario Luminoso o iluminado: Memoria Descriptiva y especificaciones técnicas ANUNCIOS PUBLICITARIOS EVENTUALES: Afiches hasta 25 unidades Paneles y volantes hasta 1000 unidades Banderolas, Gigantografías, Banners, áreas y unidad por día", "- Pasacalle, costo por día VALLAS Y PALETAS PUBLICITARIAS (por periodo anual)"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "- hasta 10.00m2 - de 10.00m2 hasta 15.00m2", "pct": "0.25%", "monto": null, "texto": "S/ 10.00 / S/ 15.00 / S/ 20.00"}], "unidad": "", "plazo": "7 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Administración Tributaria 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL", "numero": "1.0", "nombre": "INSPECCIÓN OCULAR", "base_legal": "Ley N° 29090, Ley de Regulación de Habilitaciones Urbanas y Edificaciones, Ley N° 27972, art. 79°, Reglamento de Licencias de Municipalidades del 27/05/2003, D.S. N° 034- 2008-VIVIENDA, Art. 52°, Reglamento de Licencias de Habilitación Urbana y Licencias de Edificación", "requisitos": ["1. Solicitud dirigida al alcalde, de acuerdo a control técnico.", "2. Derecho de Inspección ocular.", "3.1 Casco Urbano", "3.2 Fuera del Casco Urbano"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "Casco Urbano", "pct": "0.25%", "monto": 10.0}, {"detalle": "Fuera del Casco Urbano", "pct": "0.49%", "monto": 27.0}], "unidad": "", "plazo": "5 días", "calificacion": "Positivo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL", "numero": "2.0", "nombre": "CERTIFICACIÓN DOMICILIARIA", "base_legal": "Ley N° 29697, Ley de Desarrollo y Complementación de Licencias Municipalidades, Art. 24° y 78°, Ley N° 27444, Ley del Procedimiento Administrativo General, Ley N° 27444, Procedimiento Administrativo General (1104/01)", "requisitos": ["1. Solicitud dirigida al alcalde, con carácter de declarar jurada en donde conste claramente la tenencia del predio e indicando al asunto por el cual solicita la certificación.", "2. Declaración Jurada detallando la tenencia del predio.", "3. Pago por derecho.", "4. Recibo de agua o luz con antigüedad no mayor a 02 meses"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}, {"detalle": "Por constancia adicional", "pct": "0.25%", "monto": 10.0}], "unidad": "", "plazo": "3 días", "calificacion": "Positivo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL", "numero": "3.0", "nombre": "CONSTANCIA DE POSESIÓN LOTE URBANO", "base_legal": "Ley N° 29697, Ley de Desarrollo y Complementación de Licencias Municipalidades, Art. 24° y 78°, Ley N° 27444, Ley del Procedimiento Administrativo General, D.S. N° 011-2006-VIVIENDA, Art. 27° al 30°, 22/01/2006", "requisitos": ["1. Solicitud dirigida al alcalde.", "2. Poder expediente de adjudicación en la municipalidad.", "3. Declaración Jurada.", "4. Copia simple del DNI", "5. Pago por derecho de tramite", "5.1 De Constancia"], "derechos": [{"detalle": "", "pct": "1.04%", "monto": 57.2}], "unidad": "", "plazo": "2 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL", "numero": "4.0", "nombre": "CONSTANCIA DE POSESIÓN TERRENO AGRÍCOLA", "base_legal": "Ley N° 29697, Ley de Desarrollo y Complementación de Licencias Municipalidades, Art. 27° al 30°, 22/01/2006", "requisitos": ["1. Solicitud dirigida al alcalde.", "2. Copia simple del DNI del interesado", "3 Recibo de pago"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "2 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL", "numero": "5.0", "nombre": "AUTORIZACIÓN PARA LA INSTALACIÓN DE POSTES (Empresas prestadoras de servicios públicos de electricidad y telecomunicaciones)", "base_legal": "- Ley N° 27972, Ley Orgánica de Municipalidades, Art. 79. - Ley N° 30477, Ley que regula la ejecución de obras de servicios públicos autorizadas por las municipalidades en las áreas de dominio público, Arts. 3 y 4. - Ley N° 29022, Ley para el Fortalecimiento de la Expansión de Infraestructura en Telecomunicaciones, y su modificatoria Ley N° 30228 (Art. 5), y su Reglamento aprobado por D.S. N° 003- 2015-MTC, modificado por D.S. N° 004-2019-MTC. - TUO de la Ley N° 27444, aprobado por D.S. N° 004- 2019-JUS.", "requisitos": ["1. Solicitud dirigida al Alcalde.", "2. Memoria descriptiva, metrados, presupuesto y especificaciones técnicas.", "3. Plano de ubicación y localización de los postes.", "4. Plano de planta y detalles (recorrido, zanja, etc.).", "5. Carta de compromiso de restituir pistas, veredas y otros.", "6. Recibo de pago por derecho de tramitación.", "NOTA: La conformidad de obra no genera pago alguno."], "derechos": [{"detalle": "", "pct": "0.74%", "monto": null, "texto": "S/ 40.70 (por poste)"}], "unidad": "", "plazo": "No aplica", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "1.0", "nombre": "EXPEDICIÓN DE PARTIDA CERTIFICADA DE NACIMIENTO, DEFUNCIÓN O MATRIMONIO", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Identificación y Estado Civil, Ley N° 27805, Ley Orgánica de Municipalidades", "requisitos": ["1. Solicitud. * Comprobante de Pago por el Derecho Correspondiente. * Expedición de Partidas"], "derechos": [{"detalle": "Ley N° 26497 establece gratuidad de la primera copia certificada del acta de nacimiento", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}, {"detalle": "(RENIEC web) Tarifa fija TUPA RENIEC vigente. No es % UIT.", "pct": "", "monto": 10.3}, {"detalle": "(RENIEC presencial) Tarifa fija TUPA RENIEC vigente. No es % UIT.", "pct": "", "monto": 12.0}, {"detalle": "* RENIEC indica que el acta de defunción se entrega al momento y sin costo.", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil", "apelacion": "Registro Civil", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "2.0", "nombre": "INSCRIPCION DE NACIMIENTOS 2.1 INSCRIPCIÓN ORDINARIA DENTRO DE LOS 60 DÍAS DE PRODUCIDO EL NACIMIENTO YA SEA EN EL DOMICILIO U OTRO NOSO CIDO EL NACIMIENTO YA SEA EN EL DOMICILIO U OTRO NOSO", "base_legal": "Ley N° 26497, Ley del Registro Nacional de Identificación y Estado Civil", "requisitos": ["1. CERTIFICADO DE NACIDO VIVO.", "2. Certificado expedido por el Profesional Competente o constancia"], "derechos": [{"detalle": "Trámite", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO Ley N° 29462"}], "unidad": "", "plazo": "", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil", "apelacion": "RENIEC", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "2.2", "nombre": "INSCRIPCIÓN EXTRAORDINARIA FUERA DEL PLAZO ESTABLE CIDO PARA LA INSCRIPCIÓN ORDINARIA", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Identificación y Estado Civil", "requisitos": ["MENORES DE 18 AÑOS DE EDAD:", "1. Formulario de \"Solicitud de Inscripción Extraordinaria de Nacimiento\"", "2. Certificado de Nacido Vivo (en cualquiera de sus modalidades: Certificado de Nacido Vivo emitido por Profesional Competente o declarara con jurada de la autoridad que haya confirmado el nacimiento).", "3. La presencia del Padre, la Madre o de Ambos, cada uno con su respectivo Documento Nacional de Inscripción de Identificación – DNI.", "5. Pago por derecho de tramite", "6. Constancia de DNI del padre o del interesado.", "7. Copias del DNI del padre o la madre o los testigos.", "8. Pago por derecho de tramite"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "10 DÍAS", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "2.3", "nombre": "INSCRIPCIÓN EXTRAORDINARIA AL ELECTOR DEL PLAZO ESTABLE CIDO PARA LA INSCRIPCIÓN ORDINARIA", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Identificación y Estado Civil", "requisitos": ["MAYORES DE 18 AÑOS DE EDAD:", "1. Formulario de \"Solicitud de Inscripción Extraordinaria de Nacimiento\"", "2. Certificado de Nacido Vivo (en cualquiera de sus modalidades)", "3. La presencia del Declarante.", "4. Copias del DNI de la persona mayor de edad.", "5. Declaración Jurada de dos testigos.", "6. Certificado de matrícula escolar, con mención de los grados cursados (certificado de estudios o constancia de estudios).", "7. Certificado de antecedentes policiales o de Nombramiento de huelga digital, efectuado por el PNP.", "8. Pago por derecho de tramite"], "derechos": [{"detalle": "", "pct": "0.74%", "monto": 40.7}], "unidad": "", "plazo": "10 DÍAS", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "2.4", "nombre": "INSCRIPCIÓN POR MANDATO JUDICIAL – PARA LA INSCRIPCIÓN DEL MENOR DE EDAD DECLARADO JUDICIALMENTE EN ABANDONO", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Identificación y Estado Civil", "requisitos": ["la declaración jurada de \"no inscripción de nacimiento\".", "8. Declaración de consentimiento.", "9. Pago por derecho de tramite"], "derechos": [{"detalle": "Trámite", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "2.5", "nombre": "INSCRIPCIÓN DE NACIMIENTOS OCURRIDOS EN EL EXTRANJERO", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Identificación y Estado Civil", "requisitos": ["1. Formulario de solicitud de inscripción de nacimiento ocurrido en el extranjero.", "2. Certificado de recibo vivo emitido por profesional competente o autoridades sanitarias del país donde ocurrió el nacimiento.", "3. Copia certificada actualizada del acta de matrimonio de los padres registrado en el ministerio de inscripción de relaciones entre los padres.", "4. La presencia del padre, la madre o de ambos, cada uno son su respectivo DNI o Pasaporte.", "5. Carnet de control del recién nacido (Tarjeta de Vacunas)"], "derechos": [{"detalle": "", "pct": "0.74%", "monto": 40.7}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "3.0", "nombre": "ANOTACIÓN DE RECONOCIMIENTO DE EXISTENCIA DECLARADA JUDICIALMENTE", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, art. 98, Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["Procedimiento mediante el cual se registra la sentencia judicial que declara la existencia de una persona fallecida.", "1. Solicitud suscrita por el declarante con carácter de declaración jurada.", "2. Oficio y parte con resolución judicial consentida o ejecutoriada que corresponda.", "3. Copia de DNI del representante del título. En caso de extranjeros presentar original y copia simple del Carné de Extranjería o Pasaporte.", "4 Recibo de Pago por Derechos Administrativos"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "4.0", "nombre": "CANCELACIÓN DE ACTAS REGISTRALES a) por mandato judicial: Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Ley N° 27444, Ley del Procedimiento Administrativo General b) Administrativamente: Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Ley N° 27444, Ley del Procedimiento Administrativo General", "base_legal": "", "requisitos": ["1. Solicitud suscrita por el declarante con carácter de declaración jurada.", "2. Oficio y parte con resolución judicial consentida o ejecutoriada que corresponda.", "3. Exhibir el DNI del representante del título. En caso de extranjeros presentar original y copia simple del Carné de Extranjería o Pasaporte.", "4. Subscripción del formulario de toma de acto de reconocimiento.", "4 Recibo de Pago por Derechos Administrativos"], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "5.0", "nombre": "APERTURA DE EXPEDIENTE MATRIMONIAL", "base_legal": "D. L. N° 295 Código Civil art. 248°, 25/07/1984 a) Mayores de edad. b) Menores de Edad. c) Viudas. d) Divorciados. e) Extranjeros solteros. f) Extranjeros viudos. g) Extranjeros Divorciados", "requisitos": ["1. Solicitud al Alcalde.", "2. Recibo de Pago por derechos administrativos.", "3 Recibo de pago.", "4 Original y copias de DNI de los contrayentes.", "5 Partidas de Nacimiento actualizadas de los contrayentes.", "6 Constancia de domicilio de los contrayentes.", "7 Certificado de salud VDR y ELISA de ambos contrayentes.", "9 Los contrayentes publican el Edicto Matrimonial en diario oficial de la región vecinos al plazo de ocho días, sin que aparezca oposición al matrimonio se llega la fecha de la celebración."], "derechos": [{"detalle": "", "pct": "0.20%-0.74%", "monto": null, "texto": "S/ 11.00 - S/ 40.70"}], "unidad": "", "plazo": "15 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Registro Civil 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "6.0", "nombre": "MATRIMONIO CIVIL COMUNITARIO", "base_legal": "D. L. N° 295 Código Civil art. 248°, 25/07/1984, Matrimonio Civil Comunitario, Autorizado con Acuerdo de Concejo", "requisitos": ["1. Expediente Matrimonial completo.", "2. Recibo de Pago de derechos administrativos."], "derechos": [{"detalle": "", "pct": "0.20%-0.97%", "monto": null, "texto": "S/ 11.00 - S/ 53.40"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Registro Civil 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "7.0", "nombre": "POSTERGACIÓN DE MATRIMONIO", "base_legal": "Ley N° 26497, Ley Orgánica de RENIEC, 12/07/1995", "requisitos": ["1. Solicitud al Alcalde indicando motivos.", "2. Documento sustentatorio.", "3 Recibo de pago."], "derechos": [{"detalle": "", "pct": "0.20%-0.97%", "monto": null, "texto": "S/ 11.00 - S/ 53.40"}], "unidad": "", "plazo": "2 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Registro Civil 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "8.0", "nombre": "RETIRO DE EXPEDIENTE MATRIMONIAL", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud al Alcalde sustentatorio.", "2 Documento sustentatorio", "3 Recibo de pago"], "derechos": [{"detalle": "", "pct": "0.20%-0.97%", "monto": null, "texto": "S/ 11.00 - S/ 53.40"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Registro Civil 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "9.0", "nombre": "CEREMONIA MATRIMONIAL a) En el Local Municipal. b) Fuera del Local Municipal.", "base_legal": "Ley N° 27972, Ley Orgánica de Municipalidades 27972, Decreto Legislativo 776, Ley General de Procedimientos Administrativos 27444", "requisitos": ["1. Recibo de Pago por Derechos Administrativos EN EL LOCAL MUNICIPAL: Lunes a Viernes (en hora de oficina, Lunes a Viernes (fuera hora oficina), Días No laborable. FUERA DE LOCAL MUNICIPAL: Lunes a Viernes (en hora de oficina, Lunes a Viernes (fuera hora oficina), Días No laborable."], "derechos": [{"detalle": "", "pct": "1.72%-4.44%", "monto": null, "texto": "S/ 94.60 - S/ 244.20"}, {"detalle": "+ viatico", "pct": "+ viatico", "monto": null, "texto": "+ viatico"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Registro Civil 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "10.0", "nombre": "CERTIFICADO DE SOLTERÍA / VIUDEZ/CONVIVENCIA", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1 Solicitud al formulario", "2 Copia DNI Solicitante", "3 Partida de Nacimiento sustentatorio.", "5 Recibo de Pago de derechos administrativos."], "derechos": [{"detalle": "", "pct": "0.20%-0.25%", "monto": null, "texto": "S/ 11.00 - S/ 13.80"}], "unidad": "", "plazo": "5 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "11.0", "nombre": "DISPENSA DE PUBLICACIÓN DE EDICTOS MATRIMONIALES", "base_legal": "Art. 250° del Código Civil, Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud formato.", "2. Oficio registro al alcalde.", "3 Recibo de Pago de derechos administrativos."], "derechos": [{"detalle": "", "pct": "0.37%", "monto": 20.4}], "unidad": "", "plazo": "5 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "12.0", "nombre": "EXHIBICIÓN DE EDICTOS DE OTRAS MUNICIPALIDADES", "base_legal": "Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Oficio registro al Alcalde.", "2 Edicto Matrimonial de la Municipalidad correspondiente."], "derechos": [{"detalle": "", "pct": "0.49%", "monto": 27.0}], "unidad": "", "plazo": "2 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "13.0", "nombre": "EXPEDICIÓN DE COPIA CERTIFICADA DE ACTA EN REPRODUCCIÓN DIRECTA DEL ACTA REGISTRAL", "base_legal": "D.S. N° 015- 98-PCM, Ley del Procedimiento Administrativo General, Ley N° 27444", "requisitos": ["Solicitud formato.", "- Primera Copia en caso de inscripción de los hechos vitales (Art. 2° de la Ley N° 29462).", "- Expedición de la copia certificada (fotocopiada), en formato A4.", "- Recibo de Pago de derechos administrativos."], "derechos": [{"detalle": "", "pct": "Tarifa fija RENIEC", "monto": null, "texto": "S/ 10.30 (web) / S/ 12.00 (presencial)"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "14.0", "nombre": "EXPEDICIÓN DE COPIAS DE DOCUMENTOS REGISTRALES ARCHIVADOS", "base_legal": "D.S. N° 015- 98-PCM, Ley del Procedimiento Administrativo General, Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud suscrita por el reconociente con carácter de declaración jurada.", "2. Recibo de Pago de derechos administrativos."], "derechos": [{"detalle": "", "pct": "Tarifa fija RENIEC", "monto": null, "texto": "S/ 10.30 (web) / S/ 12.00 (presencial)"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Registro Civil 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "REGISTRO CIVIL", "numero": "15.0", "nombre": "INSCRIPCIÓN DE ADOPCION a) Inscripción de Adopción de Menor de Edad. b) Inscripción de adopción de Mayor de Edad. c) Caso de Adopción a Solicitud del adoptado.", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["1. Solicitud suscrita por el declarante con carácter de declaración jurada.", "2. Oficio y parte con resolución judicial consentida o ejecutoriada que corresponda.", "3. Exhibir el DNI del representante del título. En caso de extranjeros presentar original y copia simple del Carné de Extranjería o Pasaporte.", "4. Recibo de Pago de derechos administrativos.", "5. Tasa Administrativas."], "derechos": [{"detalle": "", "pct": "0.0123%-0.20%", "monto": null, "texto": "S/ 0.70 - S/ 11.00"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "16.0", "nombre": "INSCRIPCIÓN DE DEFUNCIÓN a) Inscripción de Defunción de Oficio. b) Inscripción supletoria por muerte violenta. c) Inscripción sustitoria. d) Declaración de muerte simultánea. e) Inscripción de Matrimonio.", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Ley N° 27444", "requisitos": ["a) INSCRIPCIÓN DE DEFUNCIÓN DE OFICIO: Se realiza en los siguientes casos:", "1. Certificado de Defunción debidamente firmado y sellado por el profesional de la salud.", "2. Entrega del DNI del fallecido.", "3. Exhibir el DNI del representante del título y Oficio del Fiscal Provincial, Oficio del Juez militar u Oficio de la Policía Nacional del Perú, de los mismos que pueden estar acompañados del protocolo de necropsias. b) INSCRIPCIÓN DE DEFUNCIÓN POR MUERTE VIOLENTA: Se realiza en los siguientes casos: Dispuesto por Oficio de autoridad a cargo de investigación de una muerte, y que requiera el reconocimiento médico - legal.", "1. Pago por derecho de tramite."], "derechos": [{"detalle": "Trámite", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}], "unidad": "", "plazo": "1 día", "calificacion": "Automático", "inicio": "Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "17.0", "nombre": "INSCRIPCIÓN DE MATRIMONIO Para la inscripción de matrimonio celebrado a solicitud por el alcalde o el defecto, a quién corresponda.", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Ley N° 27444, Ley del Procedimiento Administrativo General", "requisitos": ["a.1. A solicitud del / los contribuyentes en Oficina Registral:", "1. Oficio de la Municipalidad Provincial o Distrital celebrante del matrimonio.", "2. Copia certificada del Acta de celebración del Matrimonio Civil. a.2. A solicitud del Registrador de la municipalidad b) Inscripción de Matrimonios celebrado en el extranjero. c) Inscripción de Matrimonio por inminente peligro de muerte. d) Inscripción de Matrimonio suplétoria cuando procede judicialmente. e) Inscripción de Matrimonio Declarada por escritura pública. f) Inscripción de Matrimonio en el Registro Civil en el país que lo fue inscrito en el Registro Consular del Perú."], "derechos": [{"detalle": "", "pct": "0.20%-0.74%", "monto": null, "texto": "S/ 11.00 - S/ 40.70"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "18.0", "nombre": "RECTIFICACIÓN DE ACTAS REGISTRALES a) Inscripción de Rectificación Administrativa de Actas. b) Inscripción de Rectificación por mandato judicial. c) Inscripción de Rectificación por el Notario de Actas. d) Inscripción por cambio, adición o supresión de nombre.", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones", "requisitos": ["1. Solicitud suscrita con carácter de Declaración Jurada.", "2. Oficio y parte con resolución judicial consentida, o declaración jurada que corresponda.", "3. Exhibir el DNI del representante del título. En caso de extranjeros presentar original y copia simple del Carné de Extranjería o Pasaporte.", "4. Recibo de Pago de derechos administrativos.", "5. Subscripción del formulario de toma de acto de reconocimiento."], "derechos": [{"detalle": "", "pct": "0.20%-0.49%", "monto": null, "texto": "S/ 11.00 - S/ 27.00"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "19.0", "nombre": "INSCRIPCIONES QUE MODIFICAN LAS ACTAS REGISTRALES a) Inscripción de Reconocimiento por abuelos. b) Inscripción de Reconocimiento por escritura pública. c) Inscripción de Reconocimiento por mandato notarial. d) Declaración de paternidad o maternidad por mandato judicial.", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Ley N° 27444", "requisitos": ["1. Solicitud suscrita con carácter de Declaración Jurada.", "2. Exhibir copia simple del DNI del abuelo o abuela que practicará el reconocimiento. En caso de extranjeros presentar original y copia simple del Carné de Extranjería o Pasaporte.", "3. Copia de certificado del acta de defunción o partida de nacimiento.", "4. Copia certificado del acto de defunción del padre o de la madre.", "5. Suscripción del formulario de reconocimiento.", "6. Recibo de Pago de derechos administrativos."], "derechos": [{"detalle": "", "pct": "0.20%-0.74%", "monto": null, "texto": "S/ 11.00 - S/ 40.70"}], "unidad": "", "plazo": "3 días - 10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "20.0", "nombre": "REGULARIZACIÓN DE FIRMAS Y/O SELLADURAS EN ACTA REGISTRAL", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Ley N° 27444, Ley del Procedimiento Administrativo General Procedimiento mediante el cual se solicita la reconstrucción del acta registral.", "requisitos": ["1. Formulario de solicitud debidamente sustentado.", "2. Recibo de Pago de derechos administrativos."], "derechos": [{"detalle": "", "pct": "0.20%-0.74%", "monto": null, "texto": "S/ 11.00 - S/ 40.70"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "21.0", "nombre": "REPOSICIÓN DE ACTAS REGISTRALES CON PARTICIPACIÓN CIUDADANA", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, D.S.015-99- PCM-RENIEC lit (D) Art.7, 12/07/95, Resolución Jefatural N° 045-2009- JNAC/RENIEC (09/FEB/2008), Directiva N° 222/GRC0007-RENIEC Procedimiento por el cual se solicita la reposición de actas registrales, que hayan sido depositadas o se hayan deteriorado.", "requisitos": ["1. Solicitud suscrita por el reconociente, con carácter de declaración jurada.", "2. Exhibir copia simple del DNI del declarante, en caso de extranjeros presentar original y copia simple del Carné de Extranjería o Pasaporte.", "3. Recibo de Pago por derechos administrativos.", "NOTA: El acceso a la información es un procedimiento gratuito. Solo se realizará pago por la reproducción de la información y/o por la certificación de la misma."], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "10 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Después de la regularización se expedirá copia gratuita.", "apelacion": "Alcalde", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "22.0", "nombre": "EXPEDICIÓN DE ACTAS REGISTRALES CON PARTICIPACIÓN CIUDADANA - EXPEDICIÓN DE DOCUMENTOS REGISTRALES ARCHIVADOS", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, D.S.015-99- PCM-RENIEC, 12/07/95", "requisitos": ["Procedimiento a través del cual se emiten copias certificadas respecto a la existencia en el Archivo Registral Físico de actas, información.", "1. Solicitud suscrita con carácter de Declaración Jurada.", "2 Exhibir copia simple del DNI del declarante.", "3 Expresión concreta de la información se desea. a) Nombres y apellidos completos, Número de DNI del solicitante. b) Expresión concreta y precisa de información, presente original de información. c) Firma del solicitante o huella digital de saber firmar o no firma el declarante.", "4. Adicionalmente podrá presentar documentos que cuiden exactamente del acto y datos.", "5 Recibo de Pago por derechos administrativos.", "3 Recibo de pago por derechos administrativos."], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "10 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "23.0", "nombre": "EXPEDICIÓN DE COPIAS DE DOCUMENTOS REGISTRALES ARCHIVADOS", "base_legal": "D.S. N° 015- 98-PCM, Ley del Procedimiento Administrativo General, Ley N° 27444", "requisitos": ["Procedimiento a través del cual se emiten copias certificadas de documentos de actas registrales en los que se encuentra en las actas registrales, sobre el acto de la identidad.", "1. Una solicitud en la F.T.I. con carácter de declaración jurada.", "2. Copia legible del DNI del declarante.", "3. Documento que acredite la autorización del hecho vital que vaya.", "4 Pago derecho de tramitación.", "6. Actas presentadas como partidas generales, cuando se el encontradas vigente ROFNEC de 1987. b) Actas que registren nacimientos múltiples en una sola acta (doble o múltiple hecho vital). Se incluye originales y duplicados en blanco con oficio notarial o resolución judicial."], "derechos": [{"detalle": "", "pct": "0.20%-0.74%", "monto": null, "texto": "S/ 11.00 - S/ 40.70"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "INSCRIPCIÓN DE DEFUNCIÓN", "numero": "24.0", "nombre": "RECONSTITUCIÓN DE ACTAS REGISTRALES", "base_legal": "Ley N° 26497, Ley Orgánica del Registro Nacional de Inscripciones, Decreto Supremo N° 222-GRCO007- RENIEC Procedimiento por el cual se solicita la reconstitución de un acta registral, que no genera actas sustentables.", "requisitos": ["1. Una solicitud en la F.T.I. con carácter de declaración jurada.", "2. Copia legible del DNI del declarante.", "3. Documento que acredite la autorización del trámite.", "4. Pago derecho de trámite.", "6. Actas presentadas como partidas generales. b) Actas que registren nacimientos múltiples o doble, cuando se genera en una sola acta. c) Firma de los solicitantes como partidas generales, cuando se el encuentra vigente ROFNEC de 1987. d) Declaración Judicial de paternidad cuando el proceso no concluye remitido por el Juzgado Penal o Mixto."], "derechos": [{"detalle": "", "pct": "0.20%-0.74%", "monto": null, "texto": "S/ 11.00 - S/ 40.70"}], "unidad": "", "plazo": "10 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "RENIEC 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SERVICIO DE CEMENTERIO", "numero": "25.0", "nombre": "SEPULTURA", "base_legal": "O.S. 015- 1998-PCM del 27-05-2003, Ley N° 27972, Ley N° 29060, Ley del Silencio Administrativo", "requisitos": ["1. Solicitud.", "2. Sepultura en tierra ADULTOS", "3. Sepultura en tierra NIÑOS"], "derechos": [{"detalle": "", "pct": "0.20%-1.23%", "monto": null, "texto": "S/ 11.00 / S/ 135.85 / S/ 67.65"}], "unidad": "", "plazo": "", "calificacion": "Automático", "inicio": "", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil", "apelacion": "Registro Civil", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "SERVICIO DE CEMENTERIO", "numero": "26.0", "nombre": "AUTORIZACIÓN PARA EXHUMACIÓN Y/O TRASLADO DE CADÁVERES A OTRO CEMENTERIO", "base_legal": "O.S. 015- 1998-PCM del 27-05-2003, Ley N° 27972, Ley N° 29060", "requisitos": ["1. Solicitud.", "2. Adjuntando Autorización del Ministerio Público.", "3. Tasa Administrativa."], "derechos": [{"detalle": "", "pct": "1.98%", "monto": 108.9}], "unidad": "", "plazo": "3 días", "calificacion": "Negativo", "inicio": "Unidad de Trámite Documentario", "autoridad": "Registro Civil", "reconsideracion": "Registro Civil", "apelacion": "Registro Civil", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL — LICENCIAS DE EDIFICACIÓN Y HABILITACIÓN URBANA", "numero": "A.1", "nombre": "CERTIFICADO DE PARÁMETROS URBANÍSTICOS Y EDIFICATORIOS", "base_legal": "Ley N° 29090 Art. 18°; D.S. N° 011-2017- VIVIENDA; Ley N° 27972 Art. 79°; Ord. 035-2021- MPCH.", "requisitos": ["1. Solicitud dirigida al Alcalde.", "2. Copia de DNI del solicitante.", "3. Copia del título de propiedad o documento que acredite derecho sobre el predio.", "4. Plano de ubicación escala 1/500 con coordenadas UTM.", "5. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.49%", "monto": 27.0}], "unidad": "", "plazo": "7 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL — LICENCIAS DE EDIFICACIÓN Y HABILITACIÓN URBANA", "numero": "A.2", "nombre": "LICENCIA DE EDIFICACIÓN MODALIDAD A — APROBACIÓN AUTOMÁTICA (Obra Nueva, Ampliación, Remodelación, Demolición — viviendas unifamiliares / edificios hasta 5 pisos)", "base_legal": "Ley N° 29090 y modif.; D.S. N° 011-2017- VIVIENDA; Ley N° 27972 Art. 79° inc. a); Ord. 035- 2021-MPCH.", "requisitos": ["1. Formulario Único de Edificación (FUE) llenado y firmado.", "2. Copia del DNI del propietario o representante legal.", "3. Documentos que acrediten derecho a edificar (título de propiedad, etc.).", "4. Plano de ubicación y localización (escala 1/500).", "5. Planos de arquitectura: plantas, cortes y elevaciones (escala 1/50 ó 1/75).", "6. Boleta de habilitación del profesional responsable.", "7. Memoria descriptiva del proyecto.", "8. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.50%", "monto": 27.5}, {"detalle": "De 121 m² a 300 m² de área techada.", "pct": "1.50%", "monto": 82.5}, {"detalle": "De 301 m² a 1,000 m² de área techada.", "pct": "2.50%", "monto": 137.5}, {"detalle": "Más de 1,000 m² de área techada (evaluación previa).", "pct": "4.50%", "monto": 247.5}], "unidad": "", "plazo": "1 día", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL — LICENCIAS DE EDIFICACIÓN Y HABILITACIÓN URBANA", "numero": "A.3", "nombre": "LICENCIA DE EDIFICACIÓN MODALIDAD B — CON EVALUACIÓN PREVIA (Edificaciones de más de 5 pisos, uso mixto, industrial o mayor a 3,000 m²)", "base_legal": "Ley N° 29090 Art. 10°; D.S. N° 011-2017- VIVIENDA; Ord. 035-2021- MPCH.", "requisitos": ["1. Formulario Único de Edificación (FUE) firmado por propietario y profesional.", "2. Copia del DNI del propietario / representante legal.", "3. Documentos que acrediten derecho a edificar.", "4. Planos completos de arquitectura, estructura e instalaciones.", "5. Especificaciones técnicas y memoria descriptiva.", "6. CIRA (Certificado de Inexistencia de Restos Arqueológicos), si aplica.", "7. Póliza de seguro CAR para riesgo de obra.", "8. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "5.00%", "monto": 275.0}], "unidad": "", "plazo": "20 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL — LICENCIAS DE EDIFICACIÓN Y HABILITACIÓN URBANA", "numero": "A.4", "nombre": "CONFORMIDAD DE OBRA Y DECLARATORIA DE EDIFICACIÓN", "base_legal": "Ley N° 29090 Art. 27°; D.S. N° 011-2017- VIVIENDA; Ord. 035-2021- MPCH.", "requisitos": ["1. Formulario Único de Edificación (FUE) — Parte II.", "2. Planos de replanteo de arquitectura (si hubiera variaciones).", "3. Declaración Jurada del profesional responsable de obra.", "4. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.50%", "monto": 27.5}], "unidad": "", "plazo": "5 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL — LICENCIAS DE EDIFICACIÓN Y HABILITACIÓN URBANA", "numero": "A.5", "nombre": "AUTORIZACIÓN PARA DEMOLICIÓN DE EDIFICACIONES", "base_legal": "Ley N° 29090 Art. 4° lit. f); D.S. N° 011- 2017-VIVIENDA; Ord. 035- 2021-MPCH.", "requisitos": ["1. Solicitud dirigida al Alcalde.", "2. Copia del DNI del propietario o representante.", "3. Título de propiedad o documento que acredite titularidad.", "4. Plano de ubicación del inmueble a demoler.", "5. Plan de trabajo y medidas de seguridad firmado por ingeniero civil.", "6. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.74%", "monto": 40.7}], "unidad": "", "plazo": "7 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL — LICENCIAS DE EDIFICACIÓN Y HABILITACIÓN URBANA", "numero": "A.6", "nombre": "LICENCIA DE HABILITACIÓN URBANA MODALIDAD A (hasta 1 Ha — Aprobación automática)", "base_legal": "Ley N° 29090 Art. 8°; D.S. N° 011-2017- VIVIENDA; Ley N° 27783 Art. 42°; Ord. 035-2021- MPCH.", "requisitos": ["1. Formulario Único de Habilitación Urbana (FUHU) llenado y firmado.", "2. Copia de DNI del propietario o representante legal.", "3. Título de propiedad inscrito en Registros Públicos (copia literal actualizada).", "4. Plano de ubicación 1/5000 y plano perimétrico/topográfico 1/500 con coordenadas UTM.", "5. Plano de diseño de la habilitación urbana (lotes, vías, áreas de aporte).", "6. CIRA y estudio de impacto ambiental básico, según corresponda.", "7. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "1.50%", "monto": 82.5}], "unidad": "", "plazo": "5 días", "calificacion": "Automático", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DESARROLLO URBANO Y RURAL — LICENCIAS DE EDIFICACIÓN Y HABILITACIÓN URBANA", "numero": "A.7", "nombre": "RECEPCIÓN DE OBRAS DE HABILITACIÓN URBANA", "base_legal": "Ley N° 29090 Art. 25° y 26°; D.S. N° 011- 2017-VIVIENDA; Ord. 035- 2021-MPCH.", "requisitos": ["1. Solicitud dirigida al Alcalde indicando término de obras.", "2. Planos de replanteo de habilitación urbana aprobada.", "3. Memoria descriptiva de obras ejecutadas.", "4. Declaración Jurada del profesional responsable.", "5. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.74%", "monto": 40.7}], "unidad": "", "plazo": "15 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "TRÁNSITO, VIALIDAD Y TRANSPORTE MENOR", "numero": "B.1", "nombre": "AUTORIZACIÓN PARA FUNCIONAMIENTO DE PARADERO DE VEHÍCULOS MENORES (MOTOTAXIS / MOTOCARROS)", "base_legal": "Ley N° 27972 Art. 81° inc. 5); Ley N° 27181 Ley General de Transporte; Ord. 035-2021-MPCH.", "requisitos": ["1. Solicitud al Alcalde indicando ubicación propuesta del paradero.", "2. Copia del DNI del representante de la asociación o empresa.", "3. Copia de habilitación vehicular de la flota (mínimo 5 unidades).", "4. Croquis de ubicación del paradero propuesto.", "5. Declaración Jurada de no obstruir el tránsito.", "6. Recibo de pago por derecho de autorización anual."], "derechos": [{"detalle": "", "pct": "0.74%", "monto": 40.7}, {"detalle": "Renovación anual del paradero.", "pct": "0.49%", "monto": 27.0}], "unidad": "", "plazo": "7 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "TRÁNSITO, VIALIDAD Y TRANSPORTE MENOR", "numero": "B.2", "nombre": "AUTORIZACIÓN DE RUTA PARA TRANSPORTE PÚBLICO MENOR", "base_legal": "Ley N° 27181; Ley N° 27972 Art. 81°; Ord. 035-2021-MPCH.", "requisitos": ["1. Solicitud de la asociación/empresa dirigida al Alcalde.", "2. Copia de DNI del representante legal.", "3. Padrón de vehículos y conductores habilitados.", "4. Propuesta de recorrido de ruta con croquis.", "5. Póliza SOAT vigente de toda la flota.", "6. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.74%", "monto": 40.7}], "unidad": "", "plazo": "10 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "TRÁNSITO, VIALIDAD Y TRANSPORTE MENOR", "numero": "B.3", "nombre": "AUTORIZACIÓN PARA OCUPACIÓN DE VÍA PÚBLICA (obras, materiales de construcción)", "base_legal": "Ley N° 27972 Art. 79° inc. d); Ord. 035- 2021-MPCH.", "requisitos": ["1. Solicitud al Alcalde indicando ubicación, área y plazo.", "2. Copia de DNI del solicitante.", "3. Plano de ubicación señalando el área a ocupar.", "4. Plan de señalización y medidas de seguridad.", "5. Recibo de pago por derecho de ocupación (por m² / mes)."], "derechos": [{"detalle": "", "pct": "0.25%/m²/mes", "monto": null, "texto": "S/ 2.00/m²/mes"}], "unidad": "", "plazo": "3 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "IMPUESTO A LOS ESPECTÁCULOS PÚBLICOS NO DEPORTIVOS", "numero": "D.1", "nombre": "DECLARACIÓN Y PAGO DEL IMPUESTO A LOS ESPECTÁCULOS PÚBLICOS NO DEPORTIVOS", "base_legal": "D.Leg. 776 Art. 54° al 59°; Ley N° 27972 Art. 70°; Ord. 035-2021- MPCH.", "requisitos": ["Espectáculos taurinos — 10% del valor de la entrada.", "1. Solicitud/declaración jurada con programa del espectáculo.", "2. Relación de entradas impresas y numeradas.", "3. Comprobante de pago de ingreso al espectáculo."], "derechos": [{"detalle": "", "pct": "10%", "monto": null, "texto": "10% del valor"}, {"detalle": "Espectáculos cinematográficos, circos, shows artísticos nacionales — 10%.", "pct": "10%", "monto": null, "texto": "10% del valor"}, {"detalle": "Conciertos de música: EXONERADO cuando el valor de la entrada es hasta S/ 30.00.", "gratuito": true, "texto": null}, {"detalle": "Otros espectáculos no deportivos — 10% del valor de la entrada.", "pct": "10%", "monto": null, "texto": "10% del valor"}], "unidad": "", "plazo": "Antes del evento", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DEFENSORÍA MUNICIPAL DEL NIÑO Y ADOLESCENTE — DEMUNA", "numero": "E.1", "nombre": "SERVICIO DE ORIENTACIÓN Y CONSEJERÍA FAMILIAR (DEMUNA)", "base_legal": "Ley N° 27972 Art. 84° inc. 1.1); Código del Niño y Adolescente Ley N° 27337; Ley N° 26872 Conciliación; Ord. 035-2021- MPCH.", "requisitos": ["GRATUITO — Servicio de orientación, conciliación y defensa de los derechos del niño y adolescente.", "1. Solicitud escrita o verbal al responsable DEMUNA.", "2. Copia del DNI del solicitante.", "3. Partida de nacimiento del(los) menor(es). Servicios: Conciliación sobre tenencia, alimentos, régimen de visitas, reconocimiento voluntario de filiación."], "derechos": [{"detalle": "Trámite", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}], "unidad": "", "plazo": "3 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "DEFENSORÍA MUNICIPAL DEL NIÑO Y ADOLESCENTE — DEMUNA", "numero": "E.2", "nombre": "CONCILIACIÓN EXTRAJUDICIAL EN ASUNTOS DE FAMILIA (DEMUNA)", "base_legal": "Ley N° 26872 Ley de Conciliación; Ley N° 27337; Ley N° 27972 Art. 84°; Ord. 035-2021-MPCH.", "requisitos": ["GRATUITO — Conciliación en materia de alimentos, tenencia y régimen de visitas.", "1. Solicitud escrita al responsable DEMUNA.", "2. DNI del solicitante y del emplazado.", "3. Partida(s) de nacimiento del(los) menor(es).", "4. Documentación que sustente el pedido."], "derechos": [{"detalle": "Trámite", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}], "unidad": "", "plazo": "15 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Secretario General", "reconsideracion": "Secretario General 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "GESTIÓN AMBIENTAL Y RECURSOS NATURALES", "numero": "F.1", "nombre": "AUTORIZACIÓN PARA TALA O PODA DE ÁRBOLES EN VÍA PÚBLICA", "base_legal": "Ley N° 27972 Art. 80° lit. g); Ley N° 26821; Ord. 035-2021-MPCH.", "requisitos": ["1. Solicitud al Alcalde justificando la necesidad.", "2. Copia del DNI del solicitante.", "3. Croquis de ubicación del árbol o área afectada.", "4. Informe técnico del responsable de Medio Ambiente.", "5. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "5 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "GESTIÓN AMBIENTAL Y RECURSOS NATURALES", "numero": "F.2", "nombre": "AUTORIZACIÓN PARA QUEMA CONTROLADA DE RESIDUOS AGRÍCOLAS", "base_legal": "Ley N° 27972 Art. 80°; Ley N° 28611 Art. 113°; Ord. 035-2021-MPCH. Solo en zonas rurales, previo informe técnico.", "requisitos": ["1. Solicitud al Alcalde con descripción del área y motivo.", "2. Copia del DNI del titular de la parcela.", "3. Croquis del área de quema controlada.", "4. Plan de manejo del fuego y medidas de seguridad.", "5. Declaración Jurada de responsabilidad.", "6. Recibo de pago por derecho de tramitación."], "derechos": [{"detalle": "", "pct": "0.20%", "monto": 11.0}], "unidad": "", "plazo": "7 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Desarrollo Urbano-Rural", "reconsideracion": "Desarrollo Urbano-Rural 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "IMPUESTO PREDIAL — DECLARACIONES JURADAS", "numero": "G.1", "nombre": "DECLARACIÓN JURADA DEL IMPUESTO PREDIAL", "base_legal": "D.Leg. 776 Art. 14° al 25°; D.S. N° 156- 2004-EF; Ord. 035-2021- MPCH.", "requisitos": ["DECLARACIÓN JURADA ANUAL (hasta el último día hábil de febrero de cada año).", "1. Formato de Declaración Jurada del Predio (proporcionado por la municipalidad).", "2. Copia del DNI del contribuyente o representante.", "3. Documento que acredite propiedad o posesión del predio.", "4. Plano de distribución del predio (si es primera declaración)."], "derechos": [{"detalle": "Trámite", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}, {"detalle": "DECLARACIÓN JURADA POR TRANSFERENCIA O ADQUISICIÓN (dentro de 60 días de producida). 1. Formato de Declaración Jurada del Predio. 2. Copia del DNI del nuevo propietario. 3. Copia del título de transferencia (minuta, escritura pública o contrato).", "gratuito": true}, {"detalle": "Costo de reproducción (ver requisitos)", "pct": "", "monto": null, "texto": "GRATUITO"}], "unidad": "", "plazo": "60 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tupa", "area": "IMPUESTO PREDIAL — DECLARACIONES JURADAS", "numero": "G.2", "nombre": "FRACCIONAMIENTO Y/O APLAZAMIENTO DEL IMPUESTO PREDIAL Y ARBITRIOS", "base_legal": "D.Leg. 776 Art. 27°; D.S. N° 133-2013- EF (TUO Código Tributario) Art. 36°; Ord. 035-2021- MPCH.", "requisitos": ["1. Solicitud al Alcalde indicando monto adeudado y número de cuotas solicitadas.", "2. Copia del DNI del contribuyente.", "3. Constancia de deuda emitida por el Área de Rentas.", "4. Declaración Jurada de compromiso de pago. TASA DE FRACCIONAMIENTO: 80% de la TIM vigente."], "derechos": [{"detalle": "", "pct": "0.20%", "monto": null, "texto": "S/ 8.00 (gestión)"}], "unidad": "", "plazo": "10 días", "calificacion": "", "inicio": "Unidad de Trámite Documentario", "autoridad": "Administración Tributaria", "reconsideracion": "Administración Tributaria 15 días hábiles para presentar recurso 15 días hábiles para resolver recurso", "apelacion": "Alcalde 15 días hábiles para presentar recurso 30 días hábiles para resolver recurso", "fuente": "TUPA 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "001", "nombre": "Venta de área", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 100.0}], "unidad": "m³", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "002", "nombre": "Alquiler de local", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 100.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "003", "nombre": "Alquiler de auditorio", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 50.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "004", "nombre": "Alquiler de parlante", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 50.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "005", "nombre": "Medición de lote urbano", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 50.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "006", "nombre": "Emisión de constancias", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 25.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "007", "nombre": "Búsqueda y emisión en copia de documentos", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 20.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "008", "nombre": "Derecho de trámite", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 5.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "009", "nombre": "Tipeo de documentos", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 5.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "010", "nombre": "Impresiones a color", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 1.0}], "unidad": "und.", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "011", "nombre": "Impresiones en blanco y negro", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 0.5}], "unidad": "und.", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "012", "nombre": "Copias a color", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 0.5}], "unidad": "und.", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "013", "nombre": "Copias en blanco y negro", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 0.2}], "unidad": "und.", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "SERVICIOS GENERALES", "numero": "014", "nombre": "Alquiler de sillas", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 1.0}], "unidad": "und.", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "EMISIÓN DE ACTAS", "numero": "015", "nombre": "Emisión de actas de nacimiento", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 10.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "EMISIÓN DE ACTAS", "numero": "016", "nombre": "Emisión de actas de matrimonio", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 10.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "EMISIÓN DE ACTAS", "numero": "017", "nombre": "Emisión de actas de defunción", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 10.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "CELEBRACIÓN DE MATRIMONIO", "numero": "018", "nombre": "Celebración de matrimonio lunes a viernes – local", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 150.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "CELEBRACIÓN DE MATRIMONIO", "numero": "019", "nombre": "Celebración de matrimonio lunes a viernes – fuera", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 200.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "CELEBRACIÓN DE MATRIMONIO", "numero": "020", "nombre": "Celebración de matrimonio sábados, domingos y feriados – local", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 200.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}, {"tipo": "tusne", "area": "CELEBRACIÓN DE MATRIMONIO", "numero": "021", "nombre": "Celebración de matrimonio sábados, domingos y feriados – fuera", "base_legal": "", "requisitos": [], "derechos": [{"detalle": "", "pct": "", "monto": 300.0}], "unidad": "", "plazo": "", "calificacion": "", "inicio": "", "autoridad": "", "reconsideracion": "", "apelacion": "", "fuente": "TUSNE 2026 · Municipalidad Centro Poblado La Florida"}]$tupa$::jsonb) with ordinality as t(x, n);
  end if;
end $$;
notify pgrst, 'reload schema';
