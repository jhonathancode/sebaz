import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function WebAdmin({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const [{ data: arts, error }, { data: aj }] = await Promise.all([
    supabase.from("blog_articulos").select("estado, lecturas"),
    supabase.from("web_ajustes").select("dominio, nombre_sitio").eq("id", 1).maybeSingle(),
  ]);
  const n = (e: string) => (arts ?? []).filter((a) => a.estado === e).length;
  const lecturas = (arts ?? []).reduce((t, a) => t + Number(a.lecturas ?? 0), 0);
  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Sitio web</h1>
          <div className="sub">{aj?.dominio ? aj.dominio : "Aún sin dominio configurado"} · Administre la web pública de {aj?.nombre_sitio ?? "Zebaz"}</div>
        </div>
        <span className="espacio" />
        <Link className="btn contorno" href="/sitio" target="_blank">Ver la web</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {error && <div className="aviso error">La web aún no está activa: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql).</div>}
      <div className="wh-tarjetas">
        <Link className="wh-tarjeta" href="/superadmin/web/blog"><b>Blog</b><span>{n("publicado")} publicado(s) · {n("programado")} programado(s) · {n("borrador")} borrador(es) · {lecturas} lecturas</span></Link>
        <Link className="wh-tarjeta" href="/superadmin/web/blog/nuevo"><b>+ Nuevo artículo</b><span>Escriba y publique en minutos</span></Link>
        <Link className="wh-tarjeta" href="/superadmin/web/blog/categorias"><b>Categorías del blog</b><span>Ordene los artículos por tema</span></Link>
        <Link className="wh-tarjeta" href="/superadmin/web/ajustes"><b>Menú, contacto y SEO</b><span>Menú, botón, WhatsApp, pie de página, redes, Google Analytics</span></Link>
      </div>
    </>
  );
}
