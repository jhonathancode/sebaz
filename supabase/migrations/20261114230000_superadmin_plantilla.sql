-- El superadmin puede configurar a cualquier cliente (actúa como administrador de la MCP que abre)
create or replace function es_miembro(p_mcp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_superadmin() or exists (
    select 1 from miembros
    where mcp_id = p_mcp and user_id = auth.uid() and activo
      and desde <= current_date and (hasta is null or hasta >= current_date)
  );
$$;

create or replace function tiene_rol(p_mcp uuid, p_roles rol_mcp[]) returns boolean
language sql stable security definer set search_path = public as $$
  select (es_superadmin() and 'admin'::rol_mcp = any(p_roles)) or exists (
    select 1 from miembros
    where mcp_id = p_mcp and user_id = auth.uid() and activo and rol = any(p_roles)
      and desde <= current_date and (hasta is null or hasta >= current_date)
  );
$$;

-- Plantilla de configuración para las MCP nuevas (pagos fijos tipo y comprobante por gasto)
create table if not exists plantilla_config (
  id              text primary key default 'general',
  sustentos_gasto jsonb not null default '{}',
  pagos           jsonb not null default '[]',
  origen          text,
  actualizado_en  timestamptz not null default now()
);
alter table plantilla_config enable row level security;
drop policy if exists plantilla_ver on plantilla_config;
create policy plantilla_ver on plantilla_config for select using (es_soporte());
drop policy if exists plantilla_crear on plantilla_config;
create policy plantilla_crear on plantilla_config for insert with check (es_superadmin());
drop policy if exists plantilla_editar on plantilla_config;
create policy plantilla_editar on plantilla_config for update using (es_superadmin()) with check (es_superadmin());
