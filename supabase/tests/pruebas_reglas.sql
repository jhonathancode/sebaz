-- Pruebas de las reglas de la base de datos. Se ejecuta en un Postgres local
-- después de stub_supabase.sql y la migración. Se detiene al primer error.
\set ON_ERROR_STOP 1
\set QUIET 1

create function pg_temp.debe_fallar(p_sql text, p_texto text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_texto in sqlerrm) = 0 then
      raise exception 'Falló con otro mensaje. Esperado "%", obtenido "%"', p_texto, sqlerrm;
    end if;
    raise notice 'OK, se bloqueó: %', p_texto;
    return;
  end;
  raise exception 'Debió fallar: %', p_sql;
end $$;

create function pg_temp.como(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user, false);
end $$;

create function pg_temp.igual(p_valor anyelement, p_esperado anyelement, p_que text) returns void language plpgsql as $$
begin
  if p_valor is distinct from p_esperado then
    raise exception 'Prueba "%": esperado %, obtenido %', p_que, p_esperado, p_valor;
  end if;
  raise notice 'OK: %', p_que;
end $$;

-- ---------------------------------------------------------------- datos base
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'soporte@x.pe',  '{"nombre":"Soporte"}'),
  ('00000000-0000-0000-0000-00000000000b', 'tesorera@x.pe', '{"nombre":"María Q."}'),
  ('00000000-0000-0000-0000-00000000000c', 'alcalde@x.pe',  '{"nombre":"Carlos R."}'),
  ('00000000-0000-0000-0000-00000000000d', 'otra@x.pe',     '{"nombre":"Otra MCP"}'),
  ('00000000-0000-0000-0000-00000000000e', 'nueva@x.pe',    '{"nombre":"Nueva tesorera"}');
update perfiles set es_soporte = true where id = '00000000-0000-0000-0000-00000000000a';

set role authenticated;

-- Soporte da de alta la MCP
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into mcps (id, nombre, distrito, provincia) values
  ('10000000-0000-0000-0000-000000000001', 'MCP Puerto Yurinaki', 'Perené', 'Chanchamayo'),
  ('10000000-0000-0000-0000-000000000002', 'MCP Otra', 'Perené', 'Chanchamayo');
insert into fuentes (id, mcp_id, tipo, municipalidad, monto_mensual, formato) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'distrito', 'Municipalidad Distrital de Perené', 7080, 'perene'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'provincia', 'Municipalidad Provincial de Chanchamayo', 2675, 'chanchamayo');
insert into miembros (mcp_id, user_id, rol, desde) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'tesorero', '2026-01-01'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'alcalde',  '2026-01-01'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', 'tesorero', '2026-01-01');

-- --------------------------------------------------------- flujo del gasto
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into proveedores (id, mcp_id, tipo_doc, num_doc, razon_social) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'RUC', '20123456789', 'Proveedor A');
insert into expedientes (id, mcp_id, fecha, tipo, descripcion, fuente_id) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-10-05', 'compra', 'Útiles de oficina', '20000000-0000-0000-0000-000000000001');
select pg_temp.igual((select numero from expedientes where id = '40000000-0000-0000-0000-000000000001'), 1, 'numeración automática del expediente');
insert into expediente_items (mcp_id, expediente_id, item, cantidad, unidad, descripcion, precio_unitario) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 4, 'CAJA', 'Papel bond A4', 80);

select pg_temp.debe_fallar($$update expedientes set estado = 'aprobado' where id = '40000000-0000-0000-0000-000000000001'$$, 'Solo el alcalde');
delete from expedientes where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.igual((select count(*) from expedientes), 1::bigint, 'la app no puede borrar (sin permiso de borrado)');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
update expedientes set estado = 'aprobado' where id = '40000000-0000-0000-0000-000000000001';

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$update expedientes set descripcion = 'Cambiado' where id = '40000000-0000-0000-0000-000000000001'$$, 'ya no está en borrador');
select pg_temp.debe_fallar($$insert into comprobantes_pago (mcp_id, fecha, origen, expediente_id, fuente_id, beneficiario, concepto, importe)
  values ('10000000-0000-0000-0000-000000000001', '2026-10-05', 'expediente', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Proveedor A', 'Útiles', 320)$$, 'no tiene conformidad');

insert into ordenes (mcp_id, expediente_id, tipo, fecha, proveedor_id, concepto, monto) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'compra', '2026-10-05', '30000000-0000-0000-0000-000000000001', 'Útiles de oficina', 320);
insert into conformidades (mcp_id, expediente_id, fecha) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-10-05');
insert into comprobantes_pago (id, mcp_id, fecha, origen, expediente_id, fuente_id, beneficiario, concepto, importe) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-10-05', 'expediente', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Proveedor A', 'Útiles de oficina', 320);

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
update comprobantes_pago set estado = 'aprobado' where id = '50000000-0000-0000-0000-000000000001';

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$update comprobantes_pago set importe = 999 where id = '50000000-0000-0000-0000-000000000001'$$, 'ya no está en borrador');
select pg_temp.debe_fallar($$select generar_rendicion('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-10', array['50000000-0000-0000-0000-000000000001']::uuid[])$$, 'no tienen cheque');
update comprobantes_pago set cheque = '00001202' where id = '50000000-0000-0000-0000-000000000001';
select pg_temp.debe_fallar($$update comprobantes_pago set cheque = '99999999' where id = '50000000-0000-0000-0000-000000000001'$$, 'ya no está en borrador');

-- ------------------------------------------------------------- caja chica
insert into cajas_chicas (id, mcp_id, periodo, fuente_id, monto_fondo, responsable_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-10', '20000000-0000-0000-0000-000000000001', 2000, '00000000-0000-0000-0000-00000000000b');
insert into caja_chica_gastos (mcp_id, caja_id, fecha, concepto, sustento_tipo, razon_social, monto) values
  ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '2026-10-02', 'Pasajes a Perené', 'DJ', 'Carlos R.', 1500),
  ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '2026-10-03', 'Útiles', 'BVE', 'Librería X', 500);
select pg_temp.debe_fallar($$insert into caja_chica_gastos (mcp_id, caja_id, fecha, concepto, sustento_tipo, razon_social, monto)
  values ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '2026-10-04', 'Extra', 'DJ', 'X', 1)$$, 'pasa el saldo');
select liquidar_caja_chica('60000000-0000-0000-0000-000000000001');
select pg_temp.igual((select importe from comprobantes_pago where caja_id = '60000000-0000-0000-0000-000000000001'), 2000.00::numeric, 'la liquidación crea el CP por lo gastado');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
update comprobantes_pago set estado = 'aprobado' where caja_id = '60000000-0000-0000-0000-000000000001';
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
update comprobantes_pago set cheque = '00001201' where caja_id = '60000000-0000-0000-0000-000000000001';

-- -------------------------------------------------------------- rendición
select generar_rendicion('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-10',
  array(select id from comprobantes_pago where mcp_id = '10000000-0000-0000-0000-000000000001'));
select pg_temp.igual((select count(*) from comprobantes_pago where estado = 'rendido'), 2::bigint, 'los CP quedan rendidos');
select pg_temp.debe_fallar($$select generar_rendicion('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-10', array['50000000-0000-0000-0000-000000000001']::uuid[])$$, 'no están aprobados');
select pg_temp.debe_fallar($$select anular_rendicion((select id from rendiciones limit 1), 'corto')$$, 'al menos 10');
select anular_rendicion((select id from rendiciones limit 1), 'Se marcó un comprobante equivocado');
select pg_temp.igual((select count(*) from comprobantes_pago where estado = 'aprobado'), 2::bigint, 'al anular la rendición los CP vuelven a aprobado');
select generar_rendicion('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-10',
  array(select id from comprobantes_pago where mcp_id = '10000000-0000-0000-0000-000000000001'));

-- --------------------------------------------------- mes cerrado y reapertura
select cerrar_periodo('10000000-0000-0000-0000-000000000001', '2026-10');
select pg_temp.debe_fallar($$insert into ingresos (mcp_id, fecha, concepto, pagador_nombre, monto)
  values ('10000000-0000-0000-0000-000000000001', '2026-10-20', 'Constancia', 'Vecino', 20)$$, 'está cerrado');
select pg_temp.debe_fallar($$select reabrir_periodo('10000000-0000-0000-0000-000000000001', '2026-10', 'Corregir un recibo mal emitido')$$, 'Solo el administrador');
insert into ingresos (mcp_id, fecha, concepto, pagador_nombre, monto) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-03', 'Constancia de posesión', 'Vecino', 20);
select pg_temp.debe_fallar($$update ingresos set monto = 30$$, 'no se edita');
select pg_temp.debe_fallar($$update ingresos set estado = 'anulado', anulado_motivo = 'mal'$$, 'al menos 10');
update ingresos set estado = 'anulado', anulado_motivo = 'Emitido a nombre equivocado';

-- ------------------------------------------------------------- aislamiento
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.igual((select count(*) from expedientes), 0::bigint, 'otra MCP no ve expedientes ajenos');
select pg_temp.igual((select count(*) from comprobantes_pago), 0::bigint, 'otra MCP no ve comprobantes ajenos');
select pg_temp.debe_fallar($$insert into expedientes (mcp_id, fecha, descripcion) values ('10000000-0000-0000-0000-000000000001', '2026-11-05', 'Intruso')$$, 'row-level security');

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual((select count(*) from expedientes), 0::bigint, 'soporte no ve expedientes');
select pg_temp.igual((select count(*) from comprobantes_pago), 0::bigint, 'soporte no ve comprobantes');
select pg_temp.igual((select count(*) from rendiciones), 0::bigint, 'soporte no ve rendiciones');
select pg_temp.igual((select count(*) from mcps), 2::bigint, 'soporte ve las MCP');

-- ------------------------------------------------------------------ relevo
select registrar_relevo('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000e', 'tesorero', current_date);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.igual((select count(*) from expedientes), 0::bigint, 'la tesorera que sale ya no ve nada');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.igual((select count(*) from expedientes), 1::bigint, 'la tesorera nueva ve el historial');
select pg_temp.igual((select nombre from perfiles p join expedientes e on e.creado_por = p.id limit 1), 'María Q.', 'el historial conserva quién lo registró');

-- --------------------------------------------------------------- auditoría
reset role;
select pg_temp.debe_fallar($$delete from expedientes$$, 'No se puede eliminar');
select pg_temp.igual((select count(*) > 20 from auditoria), true, 'todo queda en auditoría');
select pg_temp.debe_fallar($$delete from auditoria$$, 'No se puede eliminar');
select pg_temp.debe_fallar($$update auditoria set accion = 'x'$$, 'No se puede eliminar');
\echo 'TODAS LAS PRUEBAS PASARON'
