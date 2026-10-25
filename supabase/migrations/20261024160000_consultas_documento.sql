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
