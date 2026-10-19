-- =====================================================================
-- Sistema de rendición para Municipalidades de Centros Poblados (MCP)
-- Esquema inicial. Reglas que hace cumplir la base de datos:
--   * Cada MCP solo ve sus datos (RLS por mcp_id).
--   * Soporte no ve datos financieros.
--   * Nada se borra: los documentos se anulan con motivo.
--   * Un documento aprobado no se edita; solo cambia de estado.
--   * Un mes cerrado no admite cambios.
--   * Todo cambio queda en auditoría (quién, cuándo, antes y después).
--   * La numeración la pone el sistema, sin saltos ni repetidos por MCP.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type rol_mcp as enum ('admin', 'tesorero', 'alcalde', 'contador', 'regidor');
create type estado_doc as enum ('borrador', 'aprobado', 'rendido', 'anulado');

-- ---------------------------------------------------------------------
-- Personas y MCP
-- ---------------------------------------------------------------------
create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '',
  dni         text check (dni is null or dni ~ '^\d{8}$'),
  celular     text,
  es_soporte  boolean not null default false,
  creado_en   timestamptz not null default now()
);

create table mcps (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  ruc           text check (ruc is null or ruc ~ '^\d{11}$'),
  direccion     text,
  distrito      text,
  provincia     text,
  departamento  text,
  ubigeo        text,
  logo_path     text,
  banco_nombre  text not null default 'Banco de la Nación',
  banco_cuenta  text,
  -- Capítulo I del informe de gestión (texto fijo que se copia cada mes)
  capitulo1     jsonb not null default '{}'::jsonb,
  estado        text not null default 'por_activar'
                check (estado in ('por_activar', 'prueba', 'activa', 'suspendida')),
  prueba_hasta  date,
  creado_en     timestamptz not null default now()
);

-- Municipalidades que transfieren a la MCP (distrito y/o provincia)
create table fuentes (
  id             uuid primary key default gen_random_uuid(),
  mcp_id         uuid not null references mcps(id),
  tipo           text not null check (tipo in ('distrito', 'provincia')),
  municipalidad  text not null,
  monto_mensual  numeric(12,2) not null default 0 check (monto_mensual >= 0),
  formato        text not null default 'general'
                 check (formato in ('perene', 'chanchamayo', 'general')),
  activo         boolean not null default true,
  unique (mcp_id, tipo)
);

-- Quién tiene qué cargo en cada MCP, y desde/hasta cuándo
create table miembros (
  id         uuid primary key default gen_random_uuid(),
  mcp_id     uuid not null references mcps(id),
  user_id    uuid not null references perfiles(id),
  rol        rol_mcp not null,
  cargo      text,
  desde      date not null default current_date,
  hasta      date,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);
create index on miembros (user_id) where activo;
create index on miembros (mcp_id);

-- ---------------------------------------------------------------------
-- Funciones de permisos (usadas por las políticas RLS)
-- ---------------------------------------------------------------------
create or replace function es_soporte() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_soporte from perfiles where id = auth.uid()), false);
$$;

create or replace function es_miembro(p_mcp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from miembros
    where mcp_id = p_mcp and user_id = auth.uid() and activo
      and desde <= current_date and (hasta is null or hasta >= current_date)
  );
$$;

create or replace function tiene_rol(p_mcp uuid, p_roles rol_mcp[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from miembros
    where mcp_id = p_mcp and user_id = auth.uid() and activo and rol = any(p_roles)
      and desde <= current_date and (hasta is null or hasta >= current_date)
  );
$$;

-- Roles que registran documentos
create or replace function puede_registrar(p_mcp uuid) returns boolean
language sql stable as $$
  select tiene_rol(p_mcp, array['admin','tesorero','contador','alcalde']::rol_mcp[]);
$$;

-- ---------------------------------------------------------------------
-- Correlativos por MCP, tipo de documento y año
-- ---------------------------------------------------------------------
create table correlativos (
  mcp_id  uuid not null references mcps(id),
  tipo    text not null,
  anio    int  not null,
  ultimo  int  not null default 0,
  primary key (mcp_id, tipo, anio)
);

create or replace function siguiente_numero(p_mcp uuid, p_tipo text, p_anio int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into correlativos (mcp_id, tipo, anio, ultimo) values (p_mcp, p_tipo, p_anio, 1)
  on conflict (mcp_id, tipo, anio) do update set ultimo = correlativos.ultimo + 1
  returning ultimo into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Periodos (meses) y su cierre
-- ---------------------------------------------------------------------
create table periodos (
  mcp_id       uuid not null references mcps(id),
  periodo      text not null check (periodo ~ '^\d{4}-\d{2}$'),
  cerrado      boolean not null default false,
  cerrado_por  uuid references perfiles(id),
  cerrado_en   timestamptz,
  primary key (mcp_id, periodo)
);

create table periodo_reaperturas (
  id          uuid primary key default gen_random_uuid(),
  mcp_id      uuid not null references mcps(id),
  periodo     text not null,
  motivo      text not null check (length(trim(motivo)) >= 10),
  hecho_por   uuid not null default auth.uid() references perfiles(id),
  hecho_en    timestamptz not null default now()
);

create or replace function periodo_cerrado(p_mcp uuid, p_fecha date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select cerrado from periodos
    where mcp_id = p_mcp and periodo = to_char(p_fecha, 'YYYY-MM')), false);
$$;

-- ---------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------
create table proveedores (
  id            uuid primary key default gen_random_uuid(),
  mcp_id        uuid not null references mcps(id),
  tipo_doc      text not null default 'RUC' check (tipo_doc in ('RUC', 'DNI')),
  num_doc       text not null,
  razon_social  text not null,
  direccion     text,
  telefono      text,
  creado_en     timestamptz not null default now(),
  unique (mcp_id, num_doc),
  check ((tipo_doc = 'RUC' and num_doc ~ '^\d{11}$') or (tipo_doc = 'DNI' and num_doc ~ '^\d{8}$'))
);

-- ---------------------------------------------------------------------
-- Expedientes: requerimiento → cotizaciones → orden → conformidad → CP
-- ---------------------------------------------------------------------
create table expedientes (
  id                 uuid primary key default gen_random_uuid(),
  mcp_id             uuid not null references mcps(id),
  anio               int  not null default extract(year from current_date)::int,
  numero             int,
  fecha              date not null default current_date,
  tipo               text not null default 'servicio' check (tipo in ('compra', 'servicio')),
  descripcion        text not null,
  area_usuaria       text,
  fuente_id          uuid references fuentes(id),
  meta               text,
  clasificador       text,
  fase               text not null default 'requerimiento'
                     check (fase in ('requerimiento', 'cotizacion', 'orden', 'conformidad', 'comprobante')),
  estado             estado_doc not null default 'borrador',
  motivo_devolucion  text,
  anulado_motivo     text,
  anulado_por        uuid references perfiles(id),
  anulado_en         timestamptz,
  creado_por         uuid default auth.uid() references perfiles(id),
  creado_en          timestamptz not null default now(),
  actualizado_por    uuid references perfiles(id),
  actualizado_en     timestamptz,
  unique (mcp_id, anio, numero)
);

create table expediente_items (
  id               uuid primary key default gen_random_uuid(),
  mcp_id           uuid not null references mcps(id),
  expediente_id    uuid not null references expedientes(id),
  item             int  not null,
  cantidad         numeric(12,3) not null check (cantidad > 0),
  unidad           text not null default 'UND',
  descripcion      text not null,
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  total            numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  anulado          boolean not null default false
);

create table cotizaciones (
  id             uuid primary key default gen_random_uuid(),
  mcp_id         uuid not null references mcps(id),
  expediente_id  uuid not null references expedientes(id),
  proveedor_id   uuid not null references proveedores(id),
  monto          numeric(12,2) not null check (monto >= 0),
  plazo          text,
  archivo_path   text,
  elegida        boolean not null default false,
  anulado        boolean not null default false,
  creado_en      timestamptz not null default now()
);
create unique index cotizacion_elegida_unica on cotizaciones (expediente_id) where elegida and not anulado;

create table ordenes (
  id             uuid primary key default gen_random_uuid(),
  mcp_id         uuid not null references mcps(id),
  expediente_id  uuid not null references expedientes(id),
  tipo           text not null check (tipo in ('compra', 'servicio')),
  anio           int  not null default extract(year from current_date)::int,
  numero         int,
  fecha          date not null default current_date,
  proveedor_id   uuid not null references proveedores(id),
  concepto       text not null,
  plazo          text,
  tipo_proceso   text not null default 'Adjudicación directa',
  monto          numeric(12,2) not null check (monto >= 0),
  anulado        boolean not null default false,
  anulado_motivo text,
  creado_en      timestamptz not null default now()
);
create unique index orden_vigente_unica on ordenes (expediente_id) where not anulado;

-- La conformidad es un memorando del alcalde a la tesorera
create table conformidades (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  expediente_id     uuid not null references expedientes(id),
  anio              int  not null default extract(year from current_date)::int,
  memorando_numero  int,
  fecha             date not null default current_date,
  texto             text,
  archivo_path      text,
  anulado           boolean not null default false,
  anulado_motivo    text,
  creado_en         timestamptz not null default now()
);
create unique index conformidad_vigente_unica on conformidades (expediente_id) where not anulado;

-- ---------------------------------------------------------------------
-- Caja chica
-- ---------------------------------------------------------------------
create table cajas_chicas (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  fuente_id       uuid not null references fuentes(id),
  monto_fondo     numeric(12,2) not null check (monto_fondo > 0),
  responsable_id  uuid not null references perfiles(id),
  estado          text not null default 'abierta' check (estado in ('abierta', 'liquidada', 'anulada')),
  anulado_motivo  text,
  creado_en       timestamptz not null default now(),
  unique (mcp_id, periodo, fuente_id)
);

create table caja_chica_gastos (
  id               uuid primary key default gen_random_uuid(),
  mcp_id           uuid not null references mcps(id),
  caja_id          uuid not null references cajas_chicas(id),
  fecha            date not null,
  concepto         text not null,
  sustento_tipo    text not null check (sustento_tipo in ('DJ', 'BV', 'BVE', 'FAC', 'RH', 'REC', 'PM', 'TICKET')),
  sustento_numero  text,
  razon_social     text not null,
  monto            numeric(12,2) not null check (monto > 0),
  archivo_path     text,
  anulado          boolean not null default false,
  anulado_motivo   text,
  creado_por       uuid default auth.uid() references perfiles(id),
  creado_en        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Comprobantes de pago (el formato), de expediente, caja chica o directo
-- ---------------------------------------------------------------------
create table comprobantes_pago (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  anio              int  not null default extract(year from current_date)::int,
  numero            int,
  fecha             date not null default current_date,
  origen            text not null check (origen in ('expediente', 'caja_chica', 'directo')),
  expediente_id     uuid references expedientes(id),
  caja_id           uuid references cajas_chicas(id),
  fuente_id         uuid not null references fuentes(id),
  beneficiario      text not null,
  beneficiario_doc  text,
  concepto          text not null,
  importe           numeric(12,2) not null check (importe > 0),
  deducciones       numeric(12,2) not null default 0 check (deducciones >= 0),
  partida           text,
  funcional         text,
  -- Para el informe de Chanchamayo (gastos por función)
  funcion           text,
  categoria         text,
  sustento_tipo     text,
  sustento_numero   text,
  cheque            text,
  estado            estado_doc not null default 'borrador',
  motivo_devolucion text,
  anulado_motivo    text,
  anulado_por       uuid references perfiles(id),
  anulado_en        timestamptz,
  creado_por        uuid default auth.uid() references perfiles(id),
  creado_en         timestamptz not null default now(),
  actualizado_por   uuid references perfiles(id),
  actualizado_en    timestamptz,
  unique (mcp_id, anio, numero),
  check (deducciones <= importe),
  check ((origen = 'expediente') = (expediente_id is not null)),
  check ((origen = 'caja_chica') = (caja_id is not null))
);
create unique index cp_vigente_por_expediente on comprobantes_pago (expediente_id)
  where expediente_id is not null and estado <> 'anulado';
create unique index cp_vigente_por_caja on comprobantes_pago (caja_id)
  where caja_id is not null and estado <> 'anulado';

alter table cajas_chicas add column comprobante_id uuid references comprobantes_pago(id);

-- ---------------------------------------------------------------------
-- Ingresos propios (recibos de ingreso)
-- ---------------------------------------------------------------------
create table ingresos (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  anio            int  not null default extract(year from current_date)::int,
  numero          int,
  fecha           date not null default current_date,
  rubro           text not null default 'servicio'
                  check (rubro in ('venta', 'servicio', 'alquiler', 'tasa', 'otro')),
  concepto        text not null,
  pagador_doc     text,
  pagador_nombre  text not null,
  monto           numeric(12,2) not null check (monto > 0),
  estado          text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (mcp_id, anio, numero)
);

-- ---------------------------------------------------------------------
-- Rendiciones
-- ---------------------------------------------------------------------
create table rendiciones (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  fuente_id       uuid not null references fuentes(id),
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  anio            int  not null,
  numero          int,
  transferencia   numeric(12,2) not null check (transferencia >= 0),
  estado          text not null default 'generada' check (estado in ('generada', 'entregada', 'anulada')),
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (mcp_id, anio, numero)
);
create unique index rendicion_vigente_unica on rendiciones (mcp_id, fuente_id, periodo) where estado <> 'anulada';

create table rendicion_items (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  rendicion_id    uuid not null references rendiciones(id),
  comprobante_id  uuid not null references comprobantes_pago(id),
  activo          boolean not null default true
);
-- Un comprobante de pago solo puede estar en una rendición vigente
create unique index cp_en_una_rendicion on rendicion_items (comprobante_id) where activo;

-- ---------------------------------------------------------------------
-- Auditoría (solo inserta el sistema; nadie la edita ni la borra)
-- ---------------------------------------------------------------------
create table auditoria (
  id           bigserial primary key,
  mcp_id       uuid,
  user_id      uuid,
  tabla        text not null,
  registro_id  text,
  accion       text not null,
  antes        jsonb,
  despues      jsonb,
  en           timestamptz not null default now()
);
create index on auditoria (mcp_id, en desc);

create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mcp uuid; v_id text;
begin
  if tg_op = 'INSERT' then
    v_mcp := (to_jsonb(new)->>(case when tg_table_name = 'mcps' then 'id' else 'mcp_id' end))::uuid;
    v_id  := to_jsonb(new)->>'id';
    insert into auditoria (mcp_id, user_id, tabla, registro_id, accion, despues)
    values (v_mcp, auth.uid(), tg_table_name, v_id, 'crear', to_jsonb(new));
    return new;
  else
    v_mcp := (to_jsonb(new)->>(case when tg_table_name = 'mcps' then 'id' else 'mcp_id' end))::uuid;
    v_id  := to_jsonb(new)->>'id';
    if to_jsonb(new) is distinct from to_jsonb(old) then
      insert into auditoria (mcp_id, user_id, tabla, registro_id, accion, antes, despues)
      values (v_mcp, auth.uid(), tg_table_name, v_id, 'editar', to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  end if;
end $$;

-- Acceso al sistema (lo llama la app al iniciar sesión)
create or replace function registrar_acceso() returns void
language sql security definer set search_path = public as $$
  insert into auditoria (user_id, tabla, accion) values (auth.uid(), 'sesion', 'ingresar');
$$;

-- ---------------------------------------------------------------------
-- Reglas: nada se borra
-- ---------------------------------------------------------------------
create or replace function prohibir_borrado() returns trigger
language plpgsql as $$
begin
  raise exception 'No se puede eliminar: use Anular con un motivo.';
end $$;

-- ---------------------------------------------------------------------
-- Reglas: mes cerrado no admite cambios
-- ---------------------------------------------------------------------
create or replace function validar_periodo_abierto() returns trigger
language plpgsql as $$
begin
  if periodo_cerrado(new.mcp_id, new.fecha)
     or (tg_op = 'UPDATE' and periodo_cerrado(old.mcp_id, old.fecha)) then
    raise exception 'El mes % está cerrado. Para cambiarlo hay que reabrirlo con un motivo.',
      to_char(coalesce(new.fecha, old.fecha), 'YYYY-MM');
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Reglas: documentos con estado (expedientes y comprobantes de pago)
--   borrador  -> aprobado   (alcalde o administrador)
--   aprobado  -> borrador   (devolver, con motivo)
--   aprobado  -> rendido    (al generar una rendición)
--   rendido   -> aprobado   (al anular la rendición)
--   borrador/aprobado -> anulado (con motivo)
--   Fuera de borrador solo cambian el estado y los campos de anulación;
--   en comprobantes también se puede escribir el cheque una vez.
-- ---------------------------------------------------------------------
create or replace function validar_documento() returns trigger
language plpgsql as $$
declare
  libres text[] := array['estado','motivo_devolucion','anulado_motivo','anulado_por','anulado_en',
                         'actualizado_por','actualizado_en','fase'];
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

-- ---------------------------------------------------------------------
-- Numeración automática
-- ---------------------------------------------------------------------
create or replace function asignar_numero() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'ordenes' then
    if new.numero is null then
      new.numero := siguiente_numero(new.mcp_id, 'orden_' || new.tipo, new.anio);
    end if;
  elsif tg_table_name = 'conformidades' then
    if new.memorando_numero is null then
      new.memorando_numero := siguiente_numero(new.mcp_id, 'memorando', new.anio);
    end if;
  elsif new.numero is null then
    new.numero := siguiente_numero(new.mcp_id, tg_table_name, new.anio);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Comprobante de pago de un expediente: solo con conformidad vigente
-- ---------------------------------------------------------------------
create or replace function validar_cp_expediente() returns trigger
language plpgsql as $$
begin
  if new.expediente_id is not null then
    if not exists (select 1 from expedientes where id = new.expediente_id and estado = 'aprobado') then
      raise exception 'El requerimiento del expediente no está aprobado.';
    end if;
    if not exists (select 1 from conformidades where expediente_id = new.expediente_id and not anulado) then
      raise exception 'El expediente no tiene conformidad: aún no se puede generar el comprobante de pago.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Gastos de caja chica: solo en caja abierta y sin pasar el fondo
-- ---------------------------------------------------------------------
create or replace function validar_gasto_caja() returns trigger
language plpgsql as $$
declare v_caja cajas_chicas; v_total numeric;
begin
  select * into v_caja from cajas_chicas where id = new.caja_id;
  if v_caja.estado <> 'abierta' then
    raise exception 'La caja chica ya está liquidada o anulada.';
  end if;
  if new.anulado and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
    raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
  end if;
  select coalesce(sum(monto), 0) into v_total from caja_chica_gastos
    where caja_id = new.caja_id and not anulado and id <> new.id;
  if not new.anulado and v_total + new.monto > v_caja.monto_fondo then
    raise exception 'El gasto pasa el saldo del fondo (quedan S/ %).', v_caja.monto_fondo - v_total;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Registros anulables simples (ítems, cotizaciones, órdenes, etc.)
-- ---------------------------------------------------------------------
create or replace function validar_anulable() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(old)->>'anulado')::boolean then
    raise exception 'El registro está anulado y no se puede cambiar.';
  end if;
  return new;
end $$;

create or replace function validar_ingreso() returns trigger
language plpgsql as $$
begin
  if old.estado = 'anulado' then
    raise exception 'El recibo está anulado y no se puede cambiar.';
  end if;
  if new.estado = 'anulado' then
    if coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
      raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
    end if;
    if (to_jsonb(new) - array['estado','anulado_motivo']) is distinct from
       (to_jsonb(old) - array['estado','anulado_motivo']) then
      raise exception 'Al anular solo cambia el estado y el motivo.';
    end if;
  elsif to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'Un recibo emitido no se edita: anúlelo y emita otro.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  -- Auditoría y prohibición de borrado en todas las tablas de negocio
  foreach t in array array['mcps','fuentes','perfiles','miembros','proveedores','expedientes',
    'expediente_items','cotizaciones','ordenes','conformidades','cajas_chicas','caja_chica_gastos',
    'comprobantes_pago','ingresos','rendiciones','rendicion_items','periodos','periodo_reaperturas']
  loop
    execute format('create trigger %I after insert or update on %I for each row execute function registrar_auditoria()', t || '_auditoria', t);
    execute format('create trigger %I before delete on %I for each row execute function prohibir_borrado()', t || '_sin_borrado', t);
  end loop;
  -- Mes cerrado
  foreach t in array array['expedientes','comprobantes_pago','caja_chica_gastos','ingresos','ordenes','conformidades']
  loop
    execute format('create trigger %I before insert or update on %I for each row execute function validar_periodo_abierto()', t || '_periodo', t);
  end loop;
  -- Numeración
  foreach t in array array['expedientes','comprobantes_pago','ingresos','rendiciones','ordenes','conformidades']
  loop
    execute format('create trigger %I before insert on %I for each row execute function asignar_numero()', t || '_numero', t);
  end loop;
  -- Anulables simples
  foreach t in array array['expediente_items','cotizaciones','ordenes','conformidades','caja_chica_gastos']
  loop
    execute format('create trigger %I before update on %I for each row execute function validar_anulable()', t || '_anulable', t);
  end loop;
end $$;

create trigger auditoria_sin_borrado before delete or update on auditoria
  for each row execute function prohibir_borrado();

create trigger expedientes_estado before update on expedientes
  for each row execute function validar_documento();
create trigger comprobantes_estado before update on comprobantes_pago
  for each row execute function validar_documento();
create trigger comprobantes_conformidad before insert on comprobantes_pago
  for each row execute function validar_cp_expediente();
create trigger caja_gastos_validar before insert or update on caja_chica_gastos
  for each row execute function validar_gasto_caja();
create trigger ingresos_validar before update on ingresos
  for each row execute function validar_ingreso();

-- Perfil automático al crear un usuario
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre) values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function crear_perfil();

-- ---------------------------------------------------------------------
-- Operaciones de varios pasos (se ejecutan completas o no se ejecutan)
-- ---------------------------------------------------------------------

-- Liquidar caja chica: crea el comprobante de pago por lo gastado
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

-- Generar rendición: marca los comprobantes de pago elegidos como rendidos
create or replace function generar_rendicion(p_mcp uuid, p_fuente uuid, p_periodo text, p_comprobantes uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_fuente fuentes; v_malos int;
begin
  if not tiene_rol(p_mcp, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para generar la rendición.';
  end if;
  select * into v_fuente from fuentes where id = p_fuente and mcp_id = p_mcp;
  if not found then raise exception 'La municipalidad que transfiere no pertenece a esta MCP.'; end if;
  if coalesce(array_length(p_comprobantes, 1), 0) = 0 then
    raise exception 'Marque al menos un comprobante de pago.';
  end if;

  select count(*) into v_malos from unnest(p_comprobantes) c(id)
  left join comprobantes_pago cp on cp.id = c.id
  where cp.id is null or cp.mcp_id <> p_mcp or cp.fuente_id <> p_fuente
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

-- Anular rendición: libera los comprobantes para armarla de nuevo
create or replace function anular_rendicion(p_rendicion uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v rendiciones;
begin
  select * into v from rendiciones where id = p_rendicion for update;
  if not found then raise exception 'Rendición no encontrada.'; end if;
  if not tiene_rol(v.mcp_id, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para anular la rendición.';
  end if;
  if v.estado = 'anulada' then raise exception 'La rendición ya está anulada.'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 10 then
    raise exception 'Escriba un motivo de al menos 10 caracteres.';
  end if;
  update rendiciones set estado = 'anulada', anulado_motivo = p_motivo where id = p_rendicion;
  update comprobantes_pago set estado = 'aprobado'
    where id in (select comprobante_id from rendicion_items where rendicion_id = p_rendicion and activo);
  update expedientes e set estado = 'aprobado'
    from rendicion_items ri join comprobantes_pago cp on cp.id = ri.comprobante_id
    where ri.rendicion_id = p_rendicion and ri.activo and cp.expediente_id = e.id and e.estado = 'rendido';
  update rendicion_items set activo = false where rendicion_id = p_rendicion;
end $$;

-- Cerrar y reabrir un mes
create or replace function cerrar_periodo(p_mcp uuid, p_periodo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_rol(p_mcp, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para cerrar el mes.';
  end if;
  insert into periodos (mcp_id, periodo, cerrado, cerrado_por, cerrado_en)
  values (p_mcp, p_periodo, true, auth.uid(), now())
  on conflict (mcp_id, periodo) do update set cerrado = true, cerrado_por = auth.uid(), cerrado_en = now();
end $$;

create or replace function reabrir_periodo(p_mcp uuid, p_periodo text, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_rol(p_mcp, array['admin']::rol_mcp[]) then
    raise exception 'Solo el administrador de la MCP puede reabrir un mes.';
  end if;
  insert into periodo_reaperturas (mcp_id, periodo, motivo) values (p_mcp, p_periodo, p_motivo);
  update periodos set cerrado = false where mcp_id = p_mcp and periodo = p_periodo;
end $$;

-- Relevo: cierra el cargo del que sale y abre el del que entra
create or replace function registrar_relevo(p_mcp uuid, p_sale uuid, p_entra uuid, p_rol rol_mcp, p_fecha date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (es_soporte() or tiene_rol(p_mcp, array['admin']::rol_mcp[])) then
    raise exception 'Sin permiso para registrar el relevo.';
  end if;
  update miembros set hasta = p_fecha - 1, activo = false
    where mcp_id = p_mcp and user_id = p_sale and rol = p_rol and activo;
  insert into miembros (mcp_id, user_id, rol, desde) values (p_mcp, p_entra, p_rol, p_fecha);
end $$;

-- ---------------------------------------------------------------------
-- Seguridad por filas (RLS)
-- ---------------------------------------------------------------------
alter table perfiles            enable row level security;
alter table mcps                enable row level security;
alter table fuentes             enable row level security;
alter table miembros            enable row level security;
alter table correlativos        enable row level security;
alter table periodos            enable row level security;
alter table periodo_reaperturas enable row level security;
alter table proveedores         enable row level security;
alter table expedientes         enable row level security;
alter table expediente_items    enable row level security;
alter table cotizaciones        enable row level security;
alter table ordenes             enable row level security;
alter table conformidades       enable row level security;
alter table cajas_chicas        enable row level security;
alter table caja_chica_gastos   enable row level security;
alter table comprobantes_pago   enable row level security;
alter table ingresos            enable row level security;
alter table rendiciones         enable row level security;
alter table rendicion_items     enable row level security;
alter table auditoria           enable row level security;

-- Perfiles: uno mismo, compañeros de la misma MCP, o soporte
create policy perfiles_ver on perfiles for select using (
  id = auth.uid() or es_soporte() or exists (
    select 1 from miembros a join miembros b on a.mcp_id = b.mcp_id
    where a.user_id = auth.uid() and a.activo and b.user_id = perfiles.id)
);
create policy perfiles_editar_propio on perfiles for update
  using (id = auth.uid()) with check (id = auth.uid() and es_soporte = es_soporte());
create policy perfiles_soporte on perfiles for update using (es_soporte()) with check (es_soporte());

-- MCP: miembros la ven; soporte la crea y la ve; el administrador edita sus datos
create policy mcps_ver on mcps for select using (es_miembro(id) or es_soporte());
create policy mcps_crear on mcps for insert with check (es_soporte());
create policy mcps_editar on mcps for update
  using (es_soporte() or tiene_rol(id, array['admin']::rol_mcp[]))
  with check (es_soporte() or tiene_rol(id, array['admin']::rol_mcp[]));

create policy fuentes_ver on fuentes for select using (es_miembro(mcp_id) or es_soporte());
create policy fuentes_crear on fuentes for insert with check (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[]));
create policy fuentes_editar on fuentes for update using (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[]));

create policy miembros_ver on miembros for select using (es_miembro(mcp_id) or es_soporte() or user_id = auth.uid());
create policy miembros_crear on miembros for insert with check (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[]));
create policy miembros_editar on miembros for update using (es_soporte() or tiene_rol(mcp_id, array['admin']::rol_mcp[]));

create policy periodos_ver on periodos for select using (es_miembro(mcp_id));
create policy reaperturas_ver on periodo_reaperturas for select using (es_miembro(mcp_id));

-- Tablas financieras: solo miembros de la MCP (soporte no las ve)
do $$
declare t text;
begin
  foreach t in array array['proveedores','expedientes','expediente_items','cotizaciones','ordenes',
    'conformidades','cajas_chicas','caja_chica_gastos','comprobantes_pago','ingresos']
  loop
    execute format('create policy %I on %I for select using (es_miembro(mcp_id))', t || '_ver', t);
    execute format('create policy %I on %I for insert with check (puede_registrar(mcp_id))', t || '_crear', t);
    execute format('create policy %I on %I for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id))', t || '_editar', t);
  end loop;
end $$;

-- Rendiciones: se leen aquí; se crean y anulan solo con las funciones de arriba
create policy rendiciones_ver on rendiciones for select using (es_miembro(mcp_id));
create policy rendicion_items_ver on rendicion_items for select using (es_miembro(mcp_id));
create policy rendiciones_entregar on rendiciones for update
  using (tiene_rol(mcp_id, array['admin','tesorero']::rol_mcp[]))
  with check (tiene_rol(mcp_id, array['admin','tesorero']::rol_mcp[]));

-- Auditoría: el administrador y el alcalde ven la de su MCP; soporte solo
-- la de datos de configuración (MCP, fuentes, miembros)
create policy auditoria_ver on auditoria for select using (
  (mcp_id is not null and tiene_rol(mcp_id, array['admin','alcalde']::rol_mcp[]))
  or (es_soporte() and tabla in ('mcps', 'fuentes', 'miembros'))
  or (user_id = auth.uid() and tabla = 'sesion')
);

-- Funciones que la app puede llamar (solo usuarios con sesión; nunca anónimos)
revoke execute on function siguiente_numero(uuid, text, int) from public, anon, authenticated;
revoke execute on function registrar_acceso() from public, anon;
revoke execute on function liquidar_caja_chica(uuid) from public, anon;
revoke execute on function generar_rendicion(uuid, uuid, text, uuid[]) from public, anon;
revoke execute on function anular_rendicion(uuid, text) from public, anon;
revoke execute on function cerrar_periodo(uuid, text) from public, anon;
revoke execute on function reabrir_periodo(uuid, text, text) from public, anon;
revoke execute on function registrar_relevo(uuid, uuid, uuid, rol_mcp, date) from public, anon;
grant execute on function registrar_acceso() to authenticated;
grant execute on function liquidar_caja_chica(uuid) to authenticated;
grant execute on function generar_rendicion(uuid, uuid, text, uuid[]) to authenticated;
grant execute on function anular_rendicion(uuid, text) to authenticated;
grant execute on function cerrar_periodo(uuid, text) to authenticated;
grant execute on function reabrir_periodo(uuid, text, text) to authenticated;
grant execute on function registrar_relevo(uuid, uuid, uuid, rol_mcp, date) to authenticated;

-- ---------------------------------------------------------------------
-- Archivos de sustento (bucket privado; carpeta = id de la MCP)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('sustentos', 'sustentos', false)
on conflict (id) do nothing;

create policy sustentos_ver on storage.objects for select
  using (bucket_id = 'sustentos' and es_miembro(((storage.foldername(name))[1])::uuid));
create policy sustentos_subir on storage.objects for insert
  with check (bucket_id = 'sustentos' and puede_registrar(((storage.foldername(name))[1])::uuid));
