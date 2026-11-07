import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import "./hub.css";

const I = {
  blog: <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />,
  mas: <path d="M12 5v14M5 12h14" />,
  tag: <path d="M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01" />,
  graf: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  cfg: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>,
};
const Ico = ({ d }: { d: React.ReactNode }) => (
  <span className="hub-ico"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg></span>
);
const num = (n: number) => Number(n).toLocaleString("es-PE");
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima" }) : "sin fecha");

export default async function WebAdmin({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const [{ data: arts, error }, { data: aj }, { data: est }] = await Promise.all([
    supabase.from("blog_articulos").select("id, titulo, estado, lecturas, publicado_en, actualizado_en").order("actualizado_en", { ascending: false }),
    supabase.from("web_ajustes").select("dominio, nombre_sitio, whatsapp, ga_id, search_console, logo_path, seo_descripcion").eq("id", 1).maybeSingle(),
    supabase.rpc("blog_estadisticas", { p_dias: 7 }),
  ]);
  const lista = arts ?? [];
  const n = (e: string) => lista.filter((a) => a.estado === e).length;
  const s = est as { total?: number; unicos?: number } | null;
  const dominio = (aj?.dominio ?? "").trim();
  const pasos: { ok: boolean; t: string; go?: string }[] = [
    { ok: !!dominio, t: "Dominio conectado", go: "/superadmin/web/ajustes" },
    { ok: !!aj?.nombre_sitio && aj.nombre_sitio !== "Zebaz", t: "Nombre del blog", go: "/superadmin/web/ajustes" },
    { ok: !!aj?.logo_path, t: "Logo", go: "/superadmin/web/ajustes" },
    { ok: !!aj?.seo_descripcion, t: "Descripción para Google", go: "/superadmin/web/ajustes" },
    { ok: !!aj?.search_console, t: "Google Search Console", go: "/superadmin/web/ajustes" },
    { ok: !!aj?.ga_id, t: "Google Analytics", go: "/superadmin/web/ajustes" },
    { ok: !!aj?.whatsapp, t: "WhatsApp de contacto", go: "/superadmin/web/ajustes" },
    { ok: n("publicado") > 0, t: "Al menos un artículo publicado", go: "/superadmin/web/blog/nuevo" },
  ];
  const hechos = pasos.filter((p) => p.ok).length;

  return (
    <div className="hub">
      <div className="hub-cab">
        <div>
          <h1>Sitio web</h1>
          <div className="sub">{dominio || "Aún sin dominio configurado"} · Blog público de {aj?.nombre_sitio ?? "Zebaz"}</div>
        </div>
        <span className="esp" />
        <Link className="btn contorno" href="/sitio" target="_blank">Ver la web</Link>
        <Link className="btn primario" href="/superadmin/web/blog/nuevo">+ Nuevo artículo</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {error && <div className="aviso error">La web aún no está activa: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql).</div>}

      <div className="hub-kpis">
        <Link className="hub-kpi" href="/superadmin/web/blog?estado=publicado"><span className="et">Publicados</span><span className="val">{n("publicado")}</span><span className="det">artículos en línea</span></Link>
        <Link className="hub-kpi" href="/superadmin/web/blog?estado=borrador"><span className="et">Borradores</span><span className="val">{n("borrador")}</span><span className="det">{n("programado")} programado(s)</span></Link>
        <Link className="hub-kpi" href="/superadmin/web/visitas?dias=7"><span className="et">Visitas · 7 días</span><span className="val">{s ? num(s.total ?? 0) : "—"}</span><span className="det">{s ? `${num(s.unicos ?? 0)} visitantes únicos` : "activa las visitas en Supabase"}</span></Link>
        <Link className="hub-kpi" href="/superadmin/web/visitas"><span className="et">Lecturas totales</span><span className="val">{num(lista.reduce((t, a) => t + Number(a.lecturas ?? 0), 0))}</span><span className="det">desde el inicio</span></Link>
      </div>

      <div className="hub-grid">
        <div className="hub-col">
          <section className="hub-sec">
            <header><h2>Accesos</h2><span className="sub">todo lo del blog en un lugar</span></header>
            <div className="hub-acciones">
              <Link className="hub-acc" href="/superadmin/web/blog"><Ico d={I.blog} /><div><b>Artículos</b><span className="t">Ver, editar, programar y archivar</span></div></Link>
              <Link className="hub-acc" href="/superadmin/web/blog/nuevo"><Ico d={I.mas} /><div><b>Nuevo artículo</b><span className="t">Escriba y publique en minutos</span></div></Link>
              <Link className="hub-acc" href="/superadmin/web/blog/categorias"><Ico d={I.tag} /><div><b>Categorías</b><span className="t">Ordene los artículos por tema</span></div></Link>
              <Link className="hub-acc" href="/superadmin/web/visitas"><Ico d={I.graf} /><div><b>Visitas</b><span className="t">Quién lee, desde dónde y por qué canal</span></div></Link>
              <Link className="hub-acc" href="/superadmin/web/ajustes"><Ico d={I.cfg} /><div><b>Ajustes y SEO</b><span className="t">Nombre, logo, dominio, WhatsApp, Google</span></div></Link>
            </div>
          </section>

          <section className="hub-sec">
            <header><h2>Últimos artículos</h2><Link href="/superadmin/web/blog">Ver todos</Link></header>
            {lista.length === 0 ? (
              <div className="hub-vacio">Aún no hay artículos. <Link href="/superadmin/web/blog/nuevo">Escriba el primero</Link>.</div>
            ) : (
              <ul className="hub-lista">
                {lista.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link className="t" href={`/superadmin/web/blog/${a.id}`}>{a.titulo}</Link>
                    <span className={`hub-est ${a.estado}`}>{a.estado}</span>
                    <span className="m">{fecha(a.publicado_en)} · {num(a.lecturas ?? 0)} lect.</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="hub-sec">
          <header><h2>Puesta a punto</h2><span className="sub">{hechos} de {pasos.length}</span></header>
          <ul className="hub-check">
            {pasos.map((p) => (
              <li key={p.t} className={p.ok ? "ok" : ""}>
                <span className="pto">{p.ok ? "✓" : ""}</span>
                {p.t}
                {!p.ok && p.go && <Link className="go" href={p.go}>Configurar</Link>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
