-- La lista de módulos ya se valida en la aplicación (guarda también la marca menus_v2 y cada menú nuevo).
-- La restricción fija de la base rechazaba los menús nuevos, como patrimonio.
alter table mcps drop constraint if exists mcps_modulos_validos;
