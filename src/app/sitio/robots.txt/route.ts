import { cargarAjustes, origenSitio } from "@/lib/sitio/datos";

export const dynamic = "force-dynamic";

export async function GET() {
  const origen = await origenSitio(await cargarAjustes());
  // Las búsquedas internas (?q=) no deben indexarse: generan páginas casi vacías y duplicadas.
  const txt = `User-agent: *\nAllow: /\nDisallow: /*?q=\nDisallow: /login\nSitemap: ${origen}/sitemap.xml\n`;
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
