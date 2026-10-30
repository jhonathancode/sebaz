-- =====================================================================
-- Número que le tocará al próximo documento (solo lectura): las vistas previas
-- muestran el correlativo automático en vez de «___». El número real lo sigue
-- asignando el sistema al emitir.
-- =====================================================================
create or replace function proximo_numero(p_mcp uuid, p_tipo text, p_anio int) returns int
language sql stable security definer set search_path = public as $$
  select case when es_miembro(p_mcp) or es_soporte()
    then coalesce((select ultimo from correlativos where mcp_id = p_mcp and tipo = p_tipo and anio = p_anio), 0) + 1
    else null end;
$$;
