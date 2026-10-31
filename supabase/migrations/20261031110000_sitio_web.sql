-- Sitio web público (dominio principal) administrado desde el superadmin: ajustes, páginas y blog
create table if not exists web_ajustes (
  id                int primary key default 1 check (id = 1),
  nombre_sitio      text not null default 'Sebaz',
  eslogan           text,
  dominio           text,
  logo_path         text,
  whatsapp          text,
  whatsapp_mensaje  text,
  correo            text,
  telefono          text,
  direccion         text,
  redes             jsonb not null default '{}'::jsonb,
  menu              jsonb not null default '[]'::jsonb,
  boton_menu_texto  text,
  boton_menu_enlace text,
  pie_texto         text,
  pie_enlaces       jsonb not null default '[]'::jsonb,
  seo_titulo        text,
  seo_descripcion   text,
  og_imagen         text,
  ga_id             text,
  search_console    text,
  scripts_cabeza    text,
  actualizado_en    timestamptz not null default now()
);
insert into web_ajustes (id, nombre_sitio, eslogan, menu, boton_menu_texto, boton_menu_enlace)
values (1, 'Sebaz', 'Sistema de control para municipalidades de centros poblados',
  '[{"texto":"Inicio","href":"/"},{"texto":"Precios","href":"/precios"},{"texto":"Blog","href":"/blog"},{"texto":"Contacto","href":"/contacto"}]'::jsonb,
  'Ingresar al sistema', '/ingresar')
on conflict (id) do nothing;

create table if not exists web_paginas (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  titulo           text not null,
  seo_titulo       text,
  seo_descripcion  text,
  og_imagen        text,
  secciones        jsonb not null default '[]'::jsonb,
  publicada        boolean not null default true,
  en_menu          boolean not null default false,
  orden            int not null default 0,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create table if not exists blog_categorias (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  nombre       text not null,
  descripcion  text,
  orden        int not null default 0,
  creado_en    timestamptz not null default now()
);

create table if not exists blog_articulos (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  titulo           text not null,
  extracto         text,
  contenido        text not null default '',
  portada_path     text,
  categoria_id     uuid references blog_categorias(id),
  etiquetas        text[] not null default '{}',
  autor            text,
  estado           text not null default 'borrador' check (estado in ('borrador', 'programado', 'publicado', 'archivado')),
  publicado_en     timestamptz,
  destacado        boolean not null default false,
  seo_titulo       text,
  seo_descripcion  text,
  lecturas         int not null default 0,
  creado_por       uuid default auth.uid(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists blog_articulos_pub on blog_articulos (estado, publicado_en desc);

alter table web_ajustes enable row level security;
alter table web_paginas enable row level security;
alter table blog_categorias enable row level security;
alter table blog_articulos enable row level security;

-- Lectura pública de lo publicado; escritura solo del superadmin
drop policy if exists web_ajustes_leer on web_ajustes;
create policy web_ajustes_leer on web_ajustes for select using (true);
drop policy if exists web_ajustes_admin on web_ajustes;
create policy web_ajustes_admin on web_ajustes for all using (es_superadmin()) with check (es_superadmin());

drop policy if exists web_paginas_leer on web_paginas;
create policy web_paginas_leer on web_paginas for select using (publicada or es_superadmin());
drop policy if exists web_paginas_admin on web_paginas;
create policy web_paginas_admin on web_paginas for all using (es_superadmin()) with check (es_superadmin());

drop policy if exists blog_categorias_leer on blog_categorias;
create policy blog_categorias_leer on blog_categorias for select using (true);
drop policy if exists blog_categorias_admin on blog_categorias;
create policy blog_categorias_admin on blog_categorias for all using (es_superadmin()) with check (es_superadmin());

drop policy if exists blog_articulos_leer on blog_articulos;
create policy blog_articulos_leer on blog_articulos for select
  using ((estado in ('publicado', 'programado') and publicado_en is not null and publicado_en <= now()) or es_superadmin());
drop policy if exists blog_articulos_admin on blog_articulos;
create policy blog_articulos_admin on blog_articulos for all using (es_superadmin()) with check (es_superadmin());

-- Suma una lectura sin dar permiso de escribir en la tabla
create or replace function blog_sumar_lectura(p_slug text) returns void
language sql security definer set search_path = public as $$
  update blog_articulos set lecturas = lecturas + 1
  where slug = p_slug and estado in ('publicado', 'programado') and publicado_en <= now();
$$;
revoke execute on function blog_sumar_lectura(text) from public;
grant execute on function blog_sumar_lectura(text) to anon, authenticated;

-- Imágenes del sitio (bucket público; solo el superadmin sube)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('web', 'web', true) on conflict (id) do nothing;
  end if;
end $$;
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists web_subir on storage.objects;
    create policy web_subir on storage.objects for insert with check (bucket_id = 'web' and es_superadmin());
    drop policy if exists web_cambiar on storage.objects;
    create policy web_cambiar on storage.objects for update using (bucket_id = 'web' and es_superadmin());
    drop policy if exists web_borrar on storage.objects;
    create policy web_borrar on storage.objects for delete using (bucket_id = 'web' and es_superadmin());
  end if;
end $$;

insert into blog_categorias (slug, nombre, descripcion, orden) values
  ('rendicion-de-cuentas', 'Rendición de cuentas', 'Cómo rendir bien a Perené y Chanchamayo', 1),
  ('gestion-municipal', 'Gestión municipal', 'Orden y buenas prácticas en la MCP', 2),
  ('normas', 'Normas y plazos', 'Lo que dice la norma, explicado simple', 3),
  ('novedades', 'Novedades de Sebaz', 'Lo nuevo del sistema', 4)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
