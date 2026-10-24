-- =====================================================================
-- Fecha límite de la rendición
--   Cada municipalidad que transfiere fija hasta qué día del mes siguiente
--   se entrega la rendición (por defecto, el día 10).
-- =====================================================================
alter table fuentes add column if not exists dia_limite smallint not null default 10;
alter table fuentes drop constraint if exists fuentes_dia_limite_check;
alter table fuentes add constraint fuentes_dia_limite_check check (dia_limite between 1 and 28);
