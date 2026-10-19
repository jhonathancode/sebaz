-- Pruebas de la migración 2 (pago fijo e ingresos propios). Se corre después de pruebas_reglas.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
create function pg_temp.debe_fallar(p_sql text, p_texto text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_texto in sqlerrm) = 0 then raise exception 'Esperado "%", obtenido "%"', p_texto, sqlerrm; end if;
    raise notice 'OK, se bloqueó: %', p_texto; return;
  end;
  raise exception 'Debió fallar: %', p_sql;
end $$;
create function pg_temp.igual(p_valor anyelement, p_esperado anyelement, p_que text) returns void language plpgsql as $$
begin
  if p_valor is distinct from p_esperado then raise exception 'Prueba "%": esperado %, obtenido %', p_que, p_esperado, p_valor; end if;
  raise notice 'OK: %', p_que;
end $$;

select pg_temp.igual((select count(*) from fuentes where tipo = 'propios'), 2::bigint, 'las MCP existentes reciben su fuente de ingresos propios');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into mcps (id, nombre) values ('10000000-0000-0000-0000-000000000003', 'MCP Nueva');
select pg_temp.igual((select count(*) from fuentes where mcp_id = '10000000-0000-0000-0000-000000000003' and tipo = 'propios'), 1::bigint, 'una MCP nueva nace con ingresos propios');

-- La tesorera nueva (relevo) registra un pago fijo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
insert into expedientes (id, mcp_id, fecha, tipo, descripcion, fuente_id) values
  ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '2026-11-05', 'pago_fijo', 'Dieta de regidores', '20000000-0000-0000-0000-000000000001');
select pg_temp.debe_fallar($$insert into cotizaciones (mcp_id, expediente_id, proveedor_id, monto) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', 10)$$, 'no lleva cotizaciones');
select pg_temp.debe_fallar($$insert into comprobantes_pago (mcp_id, fecha, origen, expediente_id, fuente_id, beneficiario, concepto, importe) values ('10000000-0000-0000-0000-000000000001', '2026-11-05', 'expediente', '40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 'Regidor', 'Dieta', 300)$$, 'no está aprobado');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update expedientes set estado = 'aprobado' where id = '40000000-0000-0000-0000-000000000009';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
insert into comprobantes_pago (id, mcp_id, fecha, origen, expediente_id, fuente_id, beneficiario, concepto, importe) values
  ('50000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '2026-11-05', 'expediente', '40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 'Regidor', 'Dieta', 300);
select pg_temp.igual((select count(*) from comprobantes_pago where id = '50000000-0000-0000-0000-000000000009'), 1::bigint, 'pago fijo: comprobante sin cotización ni conformidad');

-- Comprobante pagado con ingresos propios entra en la rendición de noviembre a Perené
insert into comprobantes_pago (id, mcp_id, fecha, origen, fuente_id, beneficiario, concepto, importe) values
  ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '2026-11-06', 'directo',
   (select id from fuentes where mcp_id = '10000000-0000-0000-0000-000000000001' and tipo = 'propios'), 'Ferretería', 'Clavos', 50);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update comprobantes_pago set estado = 'aprobado' where id in ('50000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
update comprobantes_pago set cheque = '1111' where id = '50000000-0000-0000-0000-000000000009';
update comprobantes_pago set cheque = '2222' where id = '50000000-0000-0000-0000-00000000000a';
select pg_temp.debe_fallar($$select generar_rendicion('10000000-0000-0000-0000-000000000001', (select id from fuentes where mcp_id = '10000000-0000-0000-0000-000000000001' and tipo = 'propios'), '2026-11', array['50000000-0000-0000-0000-00000000000a']::uuid[])$$, 'no pertenece');
select generar_rendicion('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-11',
  array['50000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-00000000000a']::uuid[]);
select pg_temp.igual((select count(*) from comprobantes_pago where id in ('50000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-00000000000a') and estado = 'rendido'), 2::bigint, 'la rendición incluye lo pagado con ingresos propios');
\echo 'PRUEBAS DE TIPOS E INGRESOS PROPIOS PASARON'

-- Ítems solo en borrador
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
insert into expedientes (id, mcp_id, fecha, tipo, descripcion, fuente_id) values
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '2026-11-07', 'pago_fijo', 'Dieta', '20000000-0000-0000-0000-000000000001');
insert into expediente_items (id, mcp_id, expediente_id, item, cantidad, descripcion, precio_unitario) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-00000000000b', 1, 1, 'Dieta', 10000);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update expedientes set estado = 'aprobado' where id = '40000000-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select pg_temp.debe_fallar($$update expediente_items set anulado = true where id = '70000000-0000-0000-0000-000000000001'$$, 'devolverlo a borrador');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update expedientes set estado = 'borrador', motivo_devolucion = 'Monto equivocado: era 1000' where id = '40000000-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
update expediente_items set anulado = true where id = '70000000-0000-0000-0000-000000000001';
insert into expediente_items (mcp_id, expediente_id, item, cantidad, descripcion, precio_unitario) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-00000000000b', 1, 1, 'Dieta', 1000);
select pg_temp.igual((select sum(total) from expediente_items where expediente_id = '40000000-0000-0000-0000-00000000000b' and not anulado), 1000.00::numeric, 'devuelto a borrador, el monto se corrige y queda el historial');
\echo 'PRUEBA DE CORRECCIÓN PASÓ'
