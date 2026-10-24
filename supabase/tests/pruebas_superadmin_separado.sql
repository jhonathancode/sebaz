-- El superadmin no queda ligado a ninguna MCP.
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
select case when (select count(*) from miembros m join perfiles p on p.id = m.user_id where p.es_superadmin and m.activo) = 0
  then 'OK: el superadmin no tiene cargos vigentes en MCP' else 'ERROR: el superadmin sigue ligado a una MCP' end;
select pg_temp.debe_fallar($$insert into miembros (mcp_id, user_id, rol) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'admin')$$, 'no puede tener cargo');
\echo 'PRUEBAS DE SUPERADMIN SEPARADO PASARON'
