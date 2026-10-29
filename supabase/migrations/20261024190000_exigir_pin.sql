-- =====================================================================
-- El PIN para aprobar/firmar se activa o desactiva por MCP desde Configuración
-- (por ahora apagado).
-- =====================================================================
alter table mcps add column if not exists exigir_pin boolean not null default false;
