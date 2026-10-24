-- Aprobar comprobantes y expedientes con todas las migraciones aplicadas.
\set ON_ERROR_STOP 1
\set QUIET 1
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
insert into comprobantes_pago (id, mcp_id, fecha, origen, fuente_id, beneficiario, concepto, importe, cheque) values
  ('50000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', '2026-11-10', 'directo', '20000000-0000-0000-0000-000000000001', 'Asesor', 'Honorarios', 900, '8577474');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update comprobantes_pago set estado = 'aprobado' where id = '50000000-0000-0000-0000-000000000099';
do $$ begin
  if (select estado from comprobantes_pago where id = '50000000-0000-0000-0000-000000000099') <> 'aprobado' then raise exception 'no se aprobó'; end if;
  raise notice 'OK: el comprobante de pago se aprueba';
end $$;
insert into expedientes (id, mcp_id, fecha, tipo, descripcion, fuente_id) values
  ('40000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', '2026-11-10', 'servicio', 'SERVICIO X', '20000000-0000-0000-0000-000000000001');
update expedientes set estado = 'aprobado' where id = '40000000-0000-0000-0000-000000000099';
do $$ begin
  if (select estado from expedientes where id = '40000000-0000-0000-0000-000000000099') <> 'aprobado' then raise exception 'no se aprobó'; end if;
  raise notice 'OK: el requerimiento se aprueba';
end $$;
\echo 'PRUEBAS DE APROBACIÓN PASARON'
