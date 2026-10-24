-- =====================================================================
-- Logo de la MCP
--   Se guarda en un bucket público "logos" (carpeta = id de la MCP), para
--   mostrarlo en el menú y en los formatos impresos sin pasos extra.
--   Solo soporte o el administrador de la MCP pueden subirlo o cambiarlo.
-- =====================================================================
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do update set public = true;

drop policy if exists logos_subir on storage.objects;
create policy logos_subir on storage.objects for insert
  with check (bucket_id = 'logos' and (es_soporte() or tiene_rol(((storage.foldername(name))[1])::uuid, array['admin']::rol_mcp[])));

drop policy if exists logos_cambiar on storage.objects;
create policy logos_cambiar on storage.objects for update
  using (bucket_id = 'logos' and (es_soporte() or tiene_rol(((storage.foldername(name))[1])::uuid, array['admin']::rol_mcp[])));
