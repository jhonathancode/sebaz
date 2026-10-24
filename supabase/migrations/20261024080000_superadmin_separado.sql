-- =====================================================================
-- El superadmin es el dueño del sistema, no un usuario de una MCP.
-- Sus accesos a MCP se cierran (quedan en el historial) y no se le
-- pueden asignar cargos en ninguna municipalidad.
-- =====================================================================
update miembros
   set activo = false,
       hasta  = greatest(desde, current_date)
 where activo
   and user_id in (select id from perfiles where es_superadmin);

create or replace function impedir_superadmin_miembro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.activo and exists (select 1 from perfiles where id = new.user_id and es_superadmin) then
    raise exception 'El administrador del sistema no puede tener cargo en una MCP. Cree un usuario propio de la municipalidad.';
  end if;
  return new;
end $$;
drop trigger if exists miembros_sin_superadmin on miembros;
create trigger miembros_sin_superadmin before insert or update on miembros
  for each row execute function impedir_superadmin_miembro();
