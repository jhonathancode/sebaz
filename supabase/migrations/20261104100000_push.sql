-- =====================================================================
-- Avisos al celular (notificaciones push): cada persona puede activar los
-- avisos en sus dispositivos. Un envío automático (cada minuto) manda al
-- celular los avisos nuevos de la campanita.
-- =====================================================================
create table if not exists push_suscripciones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references perfiles(id),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  agente       text,
  activa       boolean not null default true,
  creado_en    timestamptz not null default now(),
  ultimo_envio timestamptz
);
create index if not exists push_suscripciones_user_idx on push_suscripciones (user_id) where activa;
alter table push_suscripciones enable row level security;
drop policy if exists push_ver on push_suscripciones;
create policy push_ver on push_suscripciones for select using (user_id = auth.uid());
-- Altas y bajas las hace solo la aplicación (clave de servicio); nada se borra
drop trigger if exists push_sin_borrado on push_suscripciones;
create trigger push_sin_borrado before delete on push_suscripciones for each row execute function prohibir_borrado();

-- Marca de cuándo se mandó cada aviso al celular. Los avisos que ya existían no se reenvían.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notificaciones' and column_name = 'push_en') then
    alter table notificaciones add column push_en timestamptz;
    update notificaciones set push_en = now() where push_en is null;
  end if;
end $$;
create index if not exists notificaciones_push_pend_idx on notificaciones (creado_en) where push_en is null;
