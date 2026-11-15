-- Permite habilitar el módulo Patrimonio (y los demás menús) en la lista de módulos de cada municipalidad.
alter table mcps drop constraint if exists mcps_modulos_validos;
alter table mcps add constraint mcps_modulos_validos
  check (modulos <@ array['caja_chica','ingresos','almacen','rendicion','contabilidad','estados_cuenta','balance_anual','registro_civil','secretaria','patrimonio']::text[]);
