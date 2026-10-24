-- Pruebas del superadmin (planes, suscripciones, pagos).
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
-- El usuario "a" (soporte) pasa a ser el dueño del sistema
update perfiles set es_superadmin = true where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.igual((select count(*) from suscripciones where mcp_id = '10000000-0000-0000-0000-000000000001'), 1::bigint, 'la MCP existente tiene su suscripción de prueba');

set role authenticated;
-- La tesorera no registra pagos ni se da soporte
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select pg_temp.debe_fallar($$select registrar_pago_cliente('10000000-0000-0000-0000-000000000001', current_date, 150, 1, 'yape', '123', null)$$, 'Solo el superadmin');
select pg_temp.debe_fallar($$update perfiles set es_soporte = true where id = '00000000-0000-0000-0000-00000000000e'$$, 'Solo el superadmin');

-- El superadmin registra 3 meses: el vencimiento se extiende y la MCP queda activa
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update suscripciones set vence_el = '2027-01-31' where mcp_id = '10000000-0000-0000-0000-000000000001';
select registrar_pago_cliente('10000000-0000-0000-0000-000000000001', '2027-01-20', 450, 3, 'transferencia', 'OP-1', 'B001-1');
select pg_temp.igual((select vence_el from suscripciones where mcp_id = '10000000-0000-0000-0000-000000000001'), '2027-04-30'::date, 'el pago de 3 meses extiende el vencimiento');
select pg_temp.igual((select estado from mcps where id = '10000000-0000-0000-0000-000000000001'), 'activa', 'con el pago la MCP queda activa');
select pg_temp.debe_fallar($$select anular_pago_cliente((select id from pagos_clientes limit 1), 'corto')$$, 'al menos 10');
select anular_pago_cliente((select id from pagos_clientes limit 1), 'Pago registrado dos veces por error');
select pg_temp.igual((select vence_el from suscripciones where mcp_id = '10000000-0000-0000-0000-000000000001'), '2027-01-31'::date, 'al anular el pago el vencimiento vuelve exacto');
-- MCP nueva: nace en prueba
insert into mcps (id, nombre) values ('10000000-0000-0000-0000-0000000000f1', 'MCP NUEVA');
select pg_temp.igual((select count(*) from suscripciones where mcp_id = '10000000-0000-0000-0000-0000000000f1'), 1::bigint, 'la MCP nueva nace con suscripción de prueba');
\echo 'PRUEBAS DE SUPERADMIN PASARON'
