import { cargarAjustes, origenSitio, supabasePublico } from "@/lib/sitio/datos";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await cargarAjustes();
  const origen = await origenSitio(a);
  const sb = supabasePublico();
  const ahora = new Date().toISOString();
  const [{ data: arts }, { data: cats }, { data: paginas }] = await Promise.all([
    sb.from("blog_articulos").select("slug, actualizado_en").in("estado", ["publicado", "programado"]).lte("publicado_en", ahora),
    sb.from("blog_categorias").select("slug"),
    sb.from("web_paginas").select("slug, actualizado_en").eq("publicada", true),
  ]);
  const urls = [
    { loc: `${origen}/`, mod: ahora },
    { loc: `${origen}/blog`, mod: ahora },
    ...(paginas ?? []).filter((p) => p.slug !== "inicio").map((p) => ({ loc: `${origen}/${p.slug}`, mod: p.actualizado_en })),
    ...(cats ?? []).map((c) => ({ loc: `${origen}/blog/categoria/${c.slug}`, mod: ahora })),
    ...(arts ?? []).map((x) => ({ loc: `${origen}/blog/${x.slug}`, mod: x.actualizado_en })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u.loc}</loc><lastmod>${new Date(u.mod).toISOString()}</lastmod></url>`).join("")}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
