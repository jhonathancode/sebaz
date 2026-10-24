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
