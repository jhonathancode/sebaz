-- Secretaría: numeración correlativa configurable por tipo de documento y año.
-- Permite empezar en el número que ya lleva la MCP (por ejemplo, el siguiente oficio será el 080).

create or replace function sec_proximo(p_mcp uuid, p_tipo text, p_anio int) returns int
language plpgsql stable security definer set search_path = public as $$
declare v int;
begin
  if not es_miembro(p_mcp) then raise exception 'No tiene acceso.'; end if;
  select ultimo + 1 into v from correlativos where mcp_id = p_mcp and tipo = 'sec_' || p_tipo and anio = p_anio;
  return coalesce(v, 1);
end $$;
revoke execute on function sec_proximo(uuid, text, int) from public, anon;
grant execute on function sec_proximo(uuid, text, int) to authenticated;

create or replace function sec_fijar_numero(p_mcp uuid, p_tipo text, p_anio int, p_siguiente int) returns void
language plpgsql security definer set search_path = public as $$
declare mayor int;
begin
  if not tiene_rol(p_mcp, array['admin','contador']::rol_mcp[]) then raise exception 'Solo el administrador o el contador pueden cambiar la numeración.'; end if;
  if p_siguiente is null or p_siguiente < 1 or p_siguiente > 99999 then raise exception 'Escriba un número válido.'; end if;
  select coalesce(max(numero), 0) into mayor from sec_documentos where mcp_id = p_mcp and tipo = p_tipo and anio = p_anio and numero is not null;
  if p_siguiente - 1 < mayor then raise exception 'Ya se emitió el N° %: el siguiente debe ser mayor.', mayor; end if;
  insert into correlativos (mcp_id, tipo, anio, ultimo) values (p_mcp, 'sec_' || p_tipo, p_anio, p_siguiente - 1)
  on conflict (mcp_id, tipo, anio) do update set ultimo = excluded.ultimo;
end $$;
revoke execute on function sec_fijar_numero(uuid, text, int, int) from public, anon;
grant execute on function sec_fijar_numero(uuid, text, int, int) to authenticated;
