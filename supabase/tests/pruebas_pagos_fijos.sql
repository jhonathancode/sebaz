-- Pruebas de pagos fijos por mes.
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
insert into pagos_fijos (id, mcp_id, concepto, beneficiario, monto, fuente_id) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'HONORARIOS DEL ASESOR CONTABLE', 'CARLOS R.', 800, '20000000-0000-0000-0000-000000000001');
insert into expedientes (mcp_id, fecha, tipo, descripcion, fuente_id, pago_fijo_id, mes_pagado) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-02', 'pago_fijo', 'HONORARIOS DEL ASESOR CONTABLE - ENERO 2026', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '2026-01');
select pg_temp.debe_fallar($$insert into expedientes (mcp_id, fecha, tipo, descripcion, fuente_id, pago_fijo_id, mes_pagado) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-02', 'pago_fijo', 'OTRA VEZ ENERO', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '2026-01')$$, 'pago_fijo_mes_unico');
select pg_temp.debe_fallar($$insert into expedientes (mcp_id, fecha, tipo, descripcion, fuente_id, pago_fijo_id, mes_pagado) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-02', 'compra', 'X', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '2026-02')$$, 'Solo un requerimiento de pago fijo');
select pg_temp.debe_fallar($$insert into expedientes (mcp_id, fecha, tipo, descripcion, fuente_id, pago_fijo_id) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-02', 'pago_fijo', 'X', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001')$$, 'de qué mes');
-- Febrero sí
insert into expedientes (mcp_id, fecha, tipo, descripcion, fuente_id, pago_fijo_id, mes_pagado) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-02', 'pago_fijo', 'HONORARIOS - FEBRERO 2026', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '2026-02');
-- Si se anula enero, se puede volver a registrar
update expedientes set estado = 'anulado', anulado_motivo = 'Se registró con monto errado' where mes_pagado = '2026-01';
insert into expedientes (mcp_id, fecha, tipo, descripcion, fuente_id, pago_fijo_id, mes_pagado) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-02', 'pago_fijo', 'HONORARIOS - ENERO 2026', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '2026-01');
delete from pagos_fijos;
do $$ begin if (select count(*) from pagos_fijos) <> 1 then raise exception 'se borró un pago fijo'; end if; raise notice 'OK: los pagos fijos no se borran'; end $$;
\echo 'PRUEBAS DE PAGOS FIJOS PASARON'
