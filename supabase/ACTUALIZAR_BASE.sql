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
on conflict (mcp_id, tipo) do nothing;

-- Toda MCP nueva nace con su fuente de ingresos propios
create or replace function crear_fuente_propios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into fuentes (mcp_id, tipo, municipalidad, monto_mensual, formato)
  values (new.id, 'propios', 'Ingresos propios (recursos directamente recaudados)', 0, 'general')
  on conflict (mcp_id, tipo) do nothing;
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

commit;
select 'Base de datos actualizada' as resultado;
