-- Pruebas del almacén (NEA, PECOSA, stock). Se corre después de las demás.
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

-- Compra de bienes de noviembre con conformidad
insert into expedientes (id, mcp_id, fecha, tipo, descripcion, fuente_id) values
  ('40000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000001', '2026-11-03', 'compra', 'COMPRA DE UTILES', '20000000-0000-0000-0000-000000000001');
insert into expediente_items (mcp_id, expediente_id, item, cantidad, unidad, descripcion, precio_unitario) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000091', 1, 10, 'PAQUETE', 'PAPEL BOND A4', 12),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000091', 2, 20, 'UNIDAD', 'LAPICERO AZUL', 1);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update expedientes set estado = 'aprobado' where id = '40000000-0000-0000-0000-000000000091';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);

-- Sin conformidad no entra al almacén
select pg_temp.debe_fallar($$select emitir_nea('10000000-0000-0000-0000-000000000001', '2026-11-05', 'compra', '40000000-0000-0000-0000-000000000091', 'Proveedor A', 'F001-1', null,
  '[{"descripcion":"Papel bond A4","unidad":"paquete","cantidad":10,"precio_unitario":12}]')$$, 'Primero registre la conformidad');

insert into ordenes (mcp_id, expediente_id, tipo, fecha, proveedor_id, concepto, monto) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000091', 'compra', '2026-11-04', '30000000-0000-0000-0000-000000000001', 'Útiles', 140);
insert into conformidades (mcp_id, expediente_id, fecha) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000091', '2026-11-05');

-- Sin NEA no hay comprobante de pago
select pg_temp.debe_fallar($$insert into comprobantes_pago (mcp_id, fecha, origen, expediente_id, fuente_id, beneficiario, concepto, importe) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-06', 'expediente', '40000000-0000-0000-0000-000000000091', '20000000-0000-0000-0000-000000000001', 'Proveedor A', 'Útiles', 140)$$, 'entrada al almacén (NEA)');

select emitir_nea('10000000-0000-0000-0000-000000000001', '2026-11-05', 'compra', '40000000-0000-0000-0000-000000000091', 'Proveedor A', 'F001-1', null,
  '[{"descripcion":"Papel bond A4","unidad":"paquete","cantidad":10,"precio_unitario":12},{"descripcion":"lapicero azul","unidad":"unidad","cantidad":20,"precio_unitario":1}]');
select pg_temp.igual((select stock from almacen_stock where descripcion = 'PAPEL BOND A4'), 10.000, 'la NEA suma al stock');
select pg_temp.igual((select count(*) from almacen_bienes), 2::bigint, 'los bienes nuevos se crean en el catálogo');
select pg_temp.igual((select numero from notas_entrada where expediente_id = '40000000-0000-0000-0000-000000000091'), 1, 'la NEA se numera');

-- Ahora sí el comprobante
insert into comprobantes_pago (mcp_id, fecha, origen, expediente_id, fuente_id, beneficiario, concepto, importe) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-06', 'expediente', '40000000-0000-0000-0000-000000000091', '20000000-0000-0000-0000-000000000001', 'Proveedor A', 'Útiles', 140);
select pg_temp.igual(1::bigint, (select count(*) from comprobantes_pago where expediente_id = '40000000-0000-0000-0000-000000000091'), 'con NEA ya se genera el comprobante');

-- Una segunda NEA del mismo expediente no
select pg_temp.debe_fallar($$select emitir_nea('10000000-0000-0000-0000-000000000001', '2026-11-05', 'compra', '40000000-0000-0000-0000-000000000091', 'Proveedor A', 'F001-1', null,
  '[{"descripcion":"Papel bond A4","unidad":"paquete","cantidad":1,"precio_unitario":12}]')$$, 'duplicate key');

-- Donación: más papel al mismo bien (precio 0 → el costo promedio baja)
select emitir_nea('10000000-0000-0000-0000-000000000001', '2026-11-07', 'donacion', null, 'Municipalidad de Perené', null, 'Donación',
  '[{"descripcion":"PAPEL BOND A4","unidad":"PAQUETE","cantidad":10,"precio_unitario":0}]');
select pg_temp.igual((select costo_promedio from almacen_stock where descripcion = 'PAPEL BOND A4'), 6.0000, 'el costo promedio considera todas las entradas');

-- PECOSA: no se entrega más de lo que hay
select pg_temp.debe_fallar(format($$select emitir_pecosa('10000000-0000-0000-0000-000000000001', '2026-11-08', 'Secretaría', 'Ana', 'Uso de oficina', '[{"bien_id":"%s","cantidad":25}]')$$,
  (select id from almacen_bienes where descripcion = 'PAPEL BOND A4')), 'No hay suficiente');
select emitir_pecosa('10000000-0000-0000-0000-000000000001', '2026-11-08', 'Secretaría', 'Ana', 'Uso de oficina',
  jsonb_build_array(jsonb_build_object('bien_id', (select id from almacen_bienes where descripcion = 'PAPEL BOND A4'), 'cantidad', 15)));
select pg_temp.igual((select stock from almacen_stock where descripcion = 'PAPEL BOND A4'), 5.000, 'la PECOSA resta del stock');
select pg_temp.igual((select precio_unitario from pecosa_items limit 1), 6.0000, 'la salida se valoriza a costo promedio');

-- No se anula la NEA si sus bienes ya salieron
select pg_temp.debe_fallar($$update notas_entrada set anulado = true, anulado_motivo = 'Error en la cantidad registrada' where expediente_id = '40000000-0000-0000-0000-000000000091'$$, 'ya se entregó');
-- Sin motivo no se anula
select pg_temp.debe_fallar($$update pecosas set anulado = true where true$$, 'motivo');
update pecosas set anulado = true, anulado_motivo = 'Se registró a otra área por error';
select pg_temp.igual((select stock from almacen_stock where descripcion = 'PAPEL BOND A4'), 20.000, 'al anular la PECOSA vuelve el stock');
-- Lo emitido no se edita
update nota_entrada_items set cantidad = 99 where true;
select pg_temp.igual((select max(cantidad) from nota_entrada_items), 20.000, 'los ítems de una NEA emitida no se cambian');
select pg_temp.debe_fallar($$update notas_entrada set proveedor = 'Otro' where origen = 'donacion'$$, 'no se edita');

-- Compra que no pasa por almacén: con motivo
insert into expedientes (id, mcp_id, fecha, tipo, descripcion, fuente_id) values
  ('40000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000001', '2026-11-03', 'compra', 'COMBUSTIBLE', '20000000-0000-0000-0000-000000000001');
insert into expediente_items (mcp_id, expediente_id, item, cantidad, unidad, descripcion, precio_unitario) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000092', 1, 5, 'GALON', 'GASOLINA', 18);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update expedientes set estado = 'aprobado' where id = '40000000-0000-0000-0000-000000000092';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
insert into ordenes (mcp_id, expediente_id, tipo, fecha, proveedor_id, concepto, monto) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000092', 'compra', '2026-11-04', '30000000-0000-0000-0000-000000000001', 'Gasolina', 90);
insert into conformidades (mcp_id, expediente_id, fecha) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000092', '2026-11-05');
select pg_temp.debe_fallar($$update expedientes set sin_almacen_motivo = 'no' where id = '40000000-0000-0000-0000-000000000092'$$, 'al menos 10');
update expedientes set sin_almacen_motivo = 'Combustible que se consumió en el traslado' where id = '40000000-0000-0000-0000-000000000092';
insert into comprobantes_pago (mcp_id, fecha, origen, expediente_id, fuente_id, beneficiario, concepto, importe) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-06', 'expediente', '40000000-0000-0000-0000-000000000092', '20000000-0000-0000-0000-000000000001', 'Grifo', 'Gasolina', 90);
select pg_temp.igual(1::bigint, (select count(*) from comprobantes_pago where expediente_id = '40000000-0000-0000-0000-000000000092'), 'con motivo, la compra pasa sin NEA');
\echo 'PRUEBAS DE ALMACÉN PASARON'
