-- Pruebas de los datos contables.
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
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
insert into saldos_iniciales (mcp_id, anio, saldo_banco) values ('10000000-0000-0000-0000-000000000001', 2026, 1500);
insert into transferencias_recibidas (mcp_id, fuente_id, periodo, fecha, monto, documento) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-11', '2026-11-05', 7080, 'OP 123456');
select pg_temp.debe_fallar($$insert into transferencias_recibidas (mcp_id, fuente_id, periodo, fecha, monto) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-11', '2026-11-06', 7080)$$, 'transferencia_vigente_unica');
select pg_temp.debe_fallar($$update transferencias_recibidas set anulado = true where periodo = '2026-11'$$, 'motivo');
insert into conciliaciones (mcp_id, periodo, saldo_extracto) values ('10000000-0000-0000-0000-000000000001', '2026-11', 8000);
update conciliaciones set saldo_extracto = 8100 where periodo = '2026-11';
insert into cheques_cobrados (mcp_id, comprobante_id, fecha_cobro)
  select mcp_id, id, '2026-11-20' from comprobantes_pago where id = '50000000-0000-0000-0000-000000000099';
select pg_temp.debe_fallar($$insert into cheques_cobrados (mcp_id, comprobante_id, fecha_cobro) values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000099', '2026-11-21')$$, 'cheque_cobrado_unico');
\echo 'PRUEBAS DE CONTABILIDAD PASARON'
