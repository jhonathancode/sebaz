import { createHash } from "crypto";
import { supabasePublico } from "@/lib/sitio/datos";

export const dynamic = "force-dynamic";

const ROBOTS = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|curl|wget|python|axios|node-fetch|go-http/i;
const decodificar = (v: string | null) => {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Registra una visita al blog: país/región/ciudad vienen de las cabeceras de Vercel; la IP nunca se guarda. */
export async function POST(req: Request) {
  try {
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || ROBOTS.test(ua)) return new Response(null, { status: 204 });
    const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    // Código que cambia cada día y no se puede revertir a una IP: sirve para contar visitantes únicos.
    const visitante = createHash("sha256").update(`${ip}|${ua}|${dia}|${process.env.VISITAS_SAL ?? "zebaz-visitas"}`).digest("hex").slice(0, 32);
    await supabasePublico().rpc("blog_registrar_visita", {
      p_slug: texto(cuerpo.slug, 120),
      p_ruta: texto(cuerpo.ruta, 200) || "/",
      p_visitante: visitante,
      p_pais: req.headers.get("x-vercel-ip-country"),
      p_region: req.headers.get("x-vercel-ip-country-region"),
      p_ciudad: decodificar(req.headers.get("x-vercel-ip-city")),
      p_canal: texto(cuerpo.canal, 40) || "directo",
      p_dispositivo: cuerpo.dispositivo === "movil" ? "movil" : "escritorio",
    });
  } catch {
    /* contar visitas nunca debe romper la página */
  }
  return new Response(null, { status: 204 });
}
