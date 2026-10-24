-- Pruebas de la migración de cuadres. Se corre después de pruebas_tipos_propios.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
create function pg_temp.debe_fallar(p_sql text, p_texto text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_texto in sqlerrm) = 0 then raise exception 'Esperado "%", obtenido "%"', p_texto, sqlerrm; end if;
    raise notice 'OK, se bloqueó: %', sqlerrm; return;
  end;
  raise exception 'Debió fallar: %', p_sql;
end $$;
create function pg_temp.igual(p_valor anyelement, p_esperado anyelement, p_que text) returns void language plpgsql as $$
begin
  if p_valor is distinct from p_esperado then raise exception 'Prueba "%": esperado %, obtenido %', p_que, p_esperado, p_valor; end if;
  raise notice 'OK: %', p_que;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);

-- Caja chica de setiembre: 500 de fondo, 300 gastados → no cierra
insert into cajas_chicas (id, mcp_id, periodo, fuente_id, monto_fondo, responsable_id) values
  ('60000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '2026-09', '20000000-0000-0000-0000-000000000001', 500, '00000000-0000-0000-0000-00000000000e');
insert into caja_chica_gastos (mcp_id, caja_id, fecha, concepto, sustento_tipo, razon_social, monto) values
  ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000012', '2026-09-02', 'Pasajes', 'DJ', 'Carlos R.', 300);
select pg_temp.debe_fallar($$select liquidar_caja_chica('60000000-0000-0000-0000-000000000012')$$, 'no cuadra');
insert into caja_chica_gastos (mcp_id, caja_id, fecha, concepto, sustento_tipo, razon_social, monto) values
  ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000012', '2026-09-03', 'Útiles', 'BVE', 'Librería', 200);
select liquidar_caja_chica('60000000-0000-0000-0000-000000000012');
select pg_temp.igual((select estado from cajas_chicas where id = '60000000-0000-0000-0000-000000000012'), 'liquidada', 'la caja chica cierra cuando lo gastado iguala el fondo');

-- Rendición de diciembre a Chanchamayo (2,675): no se arma hasta llegar al monto
insert into comprobantes_pago (id, mcp_id, fecha, origen, fuente_id, beneficiario, concepto, importe) values
  ('50000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001', '2026-12-05', 'directo', '20000000-0000-0000-0000-000000000002', 'Regidor', 'Dieta', 2000),
  ('50000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000001', '2026-12-06', 'directo', '20000000-0000-0000-0000-000000000002', 'Proveedor', 'Cemento', 675);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update comprobantes_pago set estado = 'aprobado' where id in ('50000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000022');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
update comprobantes_pago set cheque = '3001' where id = '50000000-0000-0000-0000-000000000021';
update comprobantes_pago set cheque = '3002' where id = '50000000-0000-0000-0000-000000000022';
select pg_temp.debe_fallar($$select generar_rendicion('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2026-12', array['50000000-0000-0000-0000-000000000021']::uuid[])$$, 'no cuadra');
select generar_rendicion('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2026-12',
  array['50000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000022']::uuid[]);
select pg_temp.igual((select count(*) from rendiciones where periodo = '2026-12' and estado = 'generada'), 1::bigint, 'la rendición se arma cuando suma exactamente lo transferido');
\echo 'PRUEBAS DE CUADRES PASARON'
