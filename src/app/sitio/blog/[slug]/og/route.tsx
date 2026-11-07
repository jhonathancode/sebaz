import { ImageResponse } from "next/og";
import { cargarAjustes, supabasePublico } from "@/lib/sitio/datos";

export const dynamic = "force-dynamic";

/** Tarjeta 1200×630 con el título, para artículos sin portada (vista previa al compartir en WhatsApp, Facebook, LinkedIn). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ data }, aj] = await Promise.all([
    supabasePublico().from("blog_articulos").select("titulo, autor").eq("slug", slug).maybeSingle(),
    cargarAjustes(),
  ]);
  const titulo = (data?.titulo ?? aj.nombre_sitio).slice(0, 120);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0b3b8c 0%, #080e1a 70%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 34, color: "#fbbf4a", fontWeight: 700 }}>{aj.nombre_sitio}</div>
        <div style={{ display: "flex", fontSize: titulo.length > 70 ? 56 : 72, fontWeight: 800, lineHeight: 1.1 }}>{titulo}</div>
        <div style={{ display: "flex", fontSize: 30, color: "#9fb0cc" }}>{data?.autor ? `Por ${data.autor}` : "Municipalidades de centros poblados"}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
