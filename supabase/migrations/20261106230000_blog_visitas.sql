-- =====================================================================
-- Visitas del blog: cuántas personas entran a cada artículo, desde qué
-- país/región/ciudad y por qué canal (WhatsApp, Google, Facebook…).
-- No se guarda la IP: solo un código irreversible que cambia cada día.
-- =====================================================================
create table if not exists blog_visitas (
  id           bigint generated always as identity primary key,
  articulo_id  uuid references blog_articulos(id) on delete set null, -- null = portada u otras páginas
  ruta         text not null,
  visitante    text not null,   -- código diario irreversible (no es la IP)
  pais         text,
  region       text,
  ciudad       text,
  canal        text,
  dispositivo  text,
  creado_en    timestamptz not null default now()
);
create index if not exists blog_visitas_fecha_idx on blog_visitas (creado_en desc);
create index if not exists blog_visitas_art_idx on blog_visitas (articulo_id, creado_en desc);
alter table blog_visitas enable row level security;
drop policy if exists blog_visitas_ver on blog_visitas;
create policy blog_visitas_ver on blog_visitas for select using (es_superadmin());

-- El sitio público registra una visita sin tener permiso de escribir en la tabla
create or replace function blog_registrar_visita(
  p_slug text, p_ruta text, p_visitante text, p_pais text, p_region text, p_ciudad text, p_canal text, p_dispositivo text
) returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(length(p_visitante), 0) not between 8 and 64 then return; end if;
  if coalesce(p_slug, '') <> '' then
    select id into v_id from blog_articulos
     where slug = p_slug and estado in ('publicado', 'programado') and publicado_en <= now();
    if v_id is null then return; end if;
  end if;
  insert into blog_visitas (articulo_id, ruta, visitante, pais, region, ciudad, canal, dispositivo)
  values (v_id, left(coalesce(p_ruta, '/'), 200), p_visitante, left(p_pais, 60), left(p_region, 80), left(p_ciudad, 80), left(p_canal, 40), left(p_dispositivo, 20));
end $$;
revoke execute on function blog_registrar_visita(text, text, text, text, text, text, text, text) from public;
grant execute on function blog_registrar_visita(text, text, text, text, text, text, text, text) to anon, authenticated;

-- Resumen para el panel del superadmin (últimos N días)
create or replace function blog_estadisticas(p_dias int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)));
  r jsonb;
begin
  if not es_superadmin() then raise exception 'Solo el superadmin puede ver las estadísticas'; end if;
  select jsonb_build_object(
    'total', (select count(*) from blog_visitas where creado_en >= desde),
    'unicos', (select count(distinct visitante) from blog_visitas where creado_en >= desde),
    'portada', (select count(*) from blog_visitas where creado_en >= desde and articulo_id is null),
    'moviles', (select count(*) from blog_visitas where creado_en >= desde and dispositivo = 'movil'),
    'por_dia', coalesce((select jsonb_agg(to_jsonb(x) order by x.dia) from (
        select (creado_en at time zone 'America/Lima')::date as dia, count(*) as visitas, count(distinct visitante) as unicos
        from blog_visitas where creado_en >= desde group by 1) x), '[]'::jsonb),
    'articulos', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitas desc) from (
        select a.id, a.titulo, a.slug, count(*) as visitas, count(distinct v.visitante) as unicos,
               count(*) filter (where v.dispositivo = 'movil') as moviles
        from blog_visitas v join blog_articulos a on a.id = v.articulo_id
        where v.creado_en >= desde group by a.id, a.titulo, a.slug limit 50) x), '[]'::jsonb),
    'paises', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitas desc) from (
        select coalesce(pais, '?') as pais, count(*) as visitas from blog_visitas where creado_en >= desde group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
    'regiones', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitas desc) from (
        select coalesce(pais, '?') as pais, coalesce(region, '?') as region, count(*) as visitas from blog_visitas where creado_en >= desde group by 1, 2 order by 3 desc limit 15) x), '[]'::jsonb),
    'ciudades', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitas desc) from (
        select coalesce(ciudad, '?') as ciudad, coalesce(pais, '?') as pais, count(*) as visitas from blog_visitas where creado_en >= desde group by 1, 2 order by 3 desc limit 15) x), '[]'::jsonb),
    'canales', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitas desc) from (
        select coalesce(canal, 'directo') as canal, count(*) as visitas from blog_visitas where creado_en >= desde group by 1 order by 2 desc limit 12) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke execute on function blog_estadisticas(int) from public;
grant execute on function blog_estadisticas(int) to authenticated;
