import { cargarAjustes, limpiarTexto, mdAHtml, origenSitio, supabasePublico, type Articulo } from "@/lib/sitio/datos";

export const dynamic = "force-dynamic";
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const a = await cargarAjustes();
  const origen = await origenSitio(a);
  const { data } = await supabasePublico().from("blog_articulos").select("*").in("estado", ["publicado", "programado"]).lte("publicado_en", new Date().toISOString()).order("publicado_en", { ascending: false }).limit(30);
  const items = ((data ?? []) as Articulo[])
    .map(
      (x) => `<item><title>${esc(x.titulo)}</title><link>${origen}/blog/${x.slug}</link><guid isPermaLink="true">${origen}/blog/${x.slug}</guid><pubDate>${new Date(x.publicado_en ?? x.actualizado_en).toUTCString()}</pubDate><description>${esc(limpiarTexto(x.extracto || x.contenido, 280))}</description><content:encoded><![CDATA[${mdAHtml(x.contenido).html}]]></content:encoded></item>`,
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>${esc(a.nombre_sitio)} · Blog</title><link>${origen}/blog</link><description>${esc(a.eslogan ?? "")}</description><language>es-pe</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
