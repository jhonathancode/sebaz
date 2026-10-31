import { cargarAjustes, origenSitio } from "@/lib/sitio/datos";

export const dynamic = "force-dynamic";

export async function GET() {
  const origen = await origenSitio(await cargarAjustes());
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${origen}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
