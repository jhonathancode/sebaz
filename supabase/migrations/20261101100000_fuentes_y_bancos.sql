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
