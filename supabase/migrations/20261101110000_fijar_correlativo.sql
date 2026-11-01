-- =====================================================================
-- Fijar desde qué número sigue cada documento (una MCP que ya avanzó antes).
-- Solo el administrador; la app impide poner un número menor a lo ya emitido.
-- Queda registrado en la auditoría.
-- =====================================================================
create or replace function fijar_correlativo(p_mcp uuid, p_tipo text, p_anio int, p_ultimo int) returns void
language plpgsql security definer set search_path = public as $$
declare v_antes int;
begin
  if not (es_soporte() or tiene_rol(p_mcp, array['admin']::rol_mcp[])) then
    raise exception 'Solo el administrador puede cambiar la numeración.';
  end if;
  if p_ultimo < 0 or p_ultimo > 999998 then
    raise exception 'Número no válido.';
  end if;
  select ultimo into v_antes from correlativos where mcp_id = p_mcp and tipo = p_tipo and anio = p_anio;
  insert into correlativos (mcp_id, tipo, anio, ultimo) values (p_mcp, p_tipo, p_anio, p_ultimo)
  on conflict (mcp_id, tipo, anio) do update set ultimo = excluded.ultimo;
  insert into auditoria (mcp_id, user_id, tabla, registro_id, accion, antes, despues)
  values (p_mcp, auth.uid(), 'correlativos', p_tipo || '/' || p_anio, 'editar',
          jsonb_build_object('ultimo', coalesce(v_antes, 0)), jsonb_build_object('ultimo', p_ultimo, 'proximo', p_ultimo + 1));
end $$;
revoke execute on function fijar_correlativo(uuid, text, int, int) from public, anon;
grant execute on function fijar_correlativo(uuid, text, int, int) to authenticated;
