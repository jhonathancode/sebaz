-- =====================================================================
-- Login propio de cada municipalidad: /login/<RUC> muestra su logo, su
-- nombre y su RUC. Solo se expone lo que ya es público de la MCP.
-- =====================================================================
create or replace function mcp_para_login(p_ruc text)
returns table (nombre text, ruc text, logo_path text)
language sql stable security definer set search_path = public as $$
  select m.nombre, m.ruc, m.logo_path
    from mcps m
   where m.ruc = regexp_replace(coalesce(p_ruc, ''), '\D', '', 'g')
   limit 1;
$$;
revoke execute on function mcp_para_login(text) from public;
grant execute on function mcp_para_login(text) to anon, authenticated;
