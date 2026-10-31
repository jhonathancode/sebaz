import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import { obtenerContexto } from "@/lib/contexto";
import { fechaHora } from "@/lib/formato";
import { urlWeb } from "@/lib/sitio/datos";
import { supabaseServidor } from "@/lib/supabase/server";
import { cambiarEstadoArticulo } from "../acciones";

const ESTADOS = [["", "Todos"], ["publicado", "Publicados"], ["programado", "Programados"], ["borrador", "Borradores"], ["archivado", "Archivados"]];

export default async function ListaBlogAdmin({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const estado = sp.estado ?? "";
  const q = (sp.q ?? "").replace(/[,()%*\\]/g, " ").trim();
  let c = supabase.from("blog_articulos").select("id, slug, titulo, estado, publicado_en, lecturas, portada_path, categoria_id, destacado, actualizado_en").order("actualizado_en", { ascending: false });
  if (estado) c = c.eq("estado", estado);
  if (q) c = c.ilike("titulo", `%${q}%`);
  const [{ data }, { data: todos }, { data: cats }] = await Promise.all([c, supabase.from("blog_articulos").select("estado"), supabase.from("blog_categorias").select("id, nombre")]);
  const cuenta = (e: string) => (e ? (todos ?? []).filter((a) => a.estado === e).length : (todos ?? []).length);
  const nombreCat = new Map((cats ?? []).map((x) => [x.id, x.nombre]));
  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Blog</h1>
          <div className="sub">Artículos de la web pública</div>
        </div>
        <span className="espacio" />
        <Link className="btn contorno" href="/superadmin/web/blog/categorias">Categorías</Link>
        <Link className="btn primario grande" href="/superadmin/web/blog/nuevo">+ Nuevo artículo</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="filtros">
        <div className="grupo" role="group" aria-label="Estado">
          {ESTADOS.map(([v, t]) => (
            <Link key={v} className={`f-chip${estado === v ? " activo" : ""}`} href={`/superadmin/web/blog${v ? `?estado=${v}` : ""}`}>{t} <span className="n">{cuenta(v)}</span></Link>
          ))}
        </div>
        <form className="buscador" method="get" role="search">
          <input type="hidden" name="estado" value={estado} />
          <input name="q" defaultValue={q} placeholder="Buscar por título…" aria-label="Buscar" />
          <button className="btn chico" type="submit">Buscar</button>
        </form>
      </div>
      <div className="wl-lista">
        {(data ?? []).length === 0 && <div className="aviso info">Aún no hay artículos. Empiece con «+ Nuevo artículo».</div>}
        {(data ?? []).map((a) => (
          <div key={a.id} className="wl-fila">
            <div className="wl-mini">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urlWeb(a.portada_path) && <img src={urlWeb(a.portada_path)!} alt="" />}
            </div>
            <div className="wl-titulo">
              <b>{a.destacado ? "★ " : ""}{a.titulo}</b>
              <small>/blog/{a.slug} · {a.categoria_id ? nombreCat.get(a.categoria_id) : "Sin categoría"} · {a.publicado_en ? fechaHora(a.publicado_en) : "sin fecha"} · {a.lecturas} lecturas</small>
            </div>
            <span className={`wl-estado ${a.estado}`}>{a.estado}</span>
            <div className="acciones-fila">
              <Link className="btn chico contorno" href={`/superadmin/web/blog/${a.id}`}>Editar</Link>
              {a.estado === "publicado" && <a className="btn chico contorno" href={`/sitio/blog/${a.slug}`} target="_blank" rel="noreferrer">Ver</a>}
              {a.estado !== "archivado" && (
                <form action={cambiarEstadoArticulo}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="estado" value={a.estado === "publicado" ? "borrador" : "publicado"} />
                  <BotonConfirmar className="btn chico" pregunta={a.estado === "publicado" ? "¿Quitar de la web?" : "¿Publicar ahora?"} detalle={a.estado === "publicado" ? "Pasa a borrador y deja de verse en el blog." : "Se verá de inmediato en el blog."} textoConfirmar="Sí">{a.estado === "publicado" ? "Despublicar" : "Publicar"}</BotonConfirmar>
                </form>
              )}
              {a.estado !== "archivado" && (
                <form action={cambiarEstadoArticulo}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="estado" value="archivado" />
                  <BotonConfirmar className="btn chico" pregunta="¿Archivar el artículo?" detalle="No se borra: deja de verse en la web y queda guardado." textoConfirmar="Sí, archivar" peligro>Archivar</BotonConfirmar>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
