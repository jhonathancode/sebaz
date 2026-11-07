import Link from "next/link";
import { fechaCorta, limpiarTexto, rutaSitio, supabasePublico, tiempoLectura, urlWeb, type Articulo, type Categoria } from "@/lib/sitio/datos";

const POR_PAGINA = 9;

export function Avatar({ nombre }: { nombre: string | null }) {
  const n = (nombre || "Redacción").trim();
  const iniciales = n.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className="sb-avatar" aria-hidden="true">{iniciales}</span>;
}

function Reloj() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  );
}
function Calendario() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
  );
}

export function MetaLectura({ x }: { x: Articulo }) {
  return (
    <>
      <span><Reloj /> Lectura de {tiempoLectura(x.contenido)} min</span>
      <span><Calendario /> {fechaCorta(x.publicado_en)}</span>
    </>
  );
}

export function TarjetaArticulo({ x, base }: { x: Articulo; cat?: Categoria | null; base: string }) {
  const portada = urlWeb(x.portada_path);
  return (
    <article className="sb-tarjeta">
      <Link href={`${base}/${x.slug}`} className="sb-img" aria-label={x.titulo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {portada ? <img src={portada} alt="" loading="lazy" /> : <span className="sb-sinimg">{x.titulo.slice(0, 1)}</span>}
      </Link>
      <h3><Link href={`${base}/${x.slug}`}>{x.titulo}</Link></h3>
      <div className="sb-meta"><MetaLectura x={x} /></div>
      <div className="sb-autor"><Avatar nombre={x.autor} /> {x.autor || "Redacción"}</div>
    </article>
  );
}

/** Lista del blog (estilo revista): destacado, lo más leído, últimos artículos, categorías, buscador y paginación. */
export default async function ListaBlog({ categoriaSlug, q, pag }: { categoriaSlug?: string; q?: string; pag?: string }) {
  const sb = supabasePublico();
  const base = await rutaSitio("/blog");
  const ahora = new Date().toISOString();
  const { data: cats } = await sb.from("blog_categorias").select("id, slug, nombre, descripcion").order("orden");
  const categorias = (cats ?? []) as Categoria[];
  const actual = categoriaSlug ? categorias.find((c) => c.slug === categoriaSlug) ?? null : null;
  const pagina = Math.max(1, Math.floor(Number(pag)) || 1);
  const termino = (q ?? "").replace(/[,()%*\\]/g, " ").trim();

  let consulta = sb.from("blog_articulos").select("*", { count: "exact" }).in("estado", ["publicado", "programado"]).lte("publicado_en", ahora).order("destacado", { ascending: false }).order("publicado_en", { ascending: false });
  if (actual) consulta = consulta.eq("categoria_id", actual.id);
  if (termino) consulta = consulta.or(`titulo.ilike.%${termino}%,extracto.ilike.%${termino}%,contenido.ilike.%${termino}%`);
  const { data, count } = await consulta.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  const arts = (data ?? []) as Articulo[];
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const portadaPrincipal = !termino && !actual && pagina === 1;
  // El destacado es el marcado como tal o, si no hay, el más reciente.
  const destacado = portadaPrincipal ? arts[0] ?? null : null;
  const resto = destacado ? arts.filter((x) => x.id !== destacado.id) : arts;

  let masLeidos: Articulo[] = [];
  if (portadaPrincipal && destacado) {
    const { data: top } = await sb.from("blog_articulos").select("*").in("estado", ["publicado", "programado"]).lte("publicado_en", ahora).neq("id", destacado.id).order("lecturas", { ascending: false }).order("publicado_en", { ascending: false }).limit(3);
    masLeidos = (top ?? []) as Articulo[];
  }

  const link = (p: number) => {
    const params = new URLSearchParams();
    if (termino) params.set("q", termino);
    if (p > 1) params.set("pag", String(p));
    const s = params.toString();
    return `${actual ? `${base}/categoria/${actual.slug}` : base}${s ? `?${s}` : ""}`;
  };
  const portadaDest = destacado ? urlWeb(destacado.portada_path) : null;

  return (
    <div className="sb">
      <div className="sw-contenedor">
        <div className="sb-cab">
          <div>
            <h1>{actual ? actual.nombre : "Blog"}</h1>
            <p>{actual?.descripcion || "Guías, normas y buenas prácticas para la gestión de su municipalidad de centro poblado."}</p>
          </div>
          <form className="sb-buscar" method="get" action={actual ? `${base}/categoria/${actual.slug}` : base} role="search">
            <input name="q" defaultValue={termino} placeholder="Buscar artículos…" aria-label="Buscar en el blog" />
            <button type="submit">Buscar</button>
          </form>
        </div>
        <div className="sb-filtros">
          <Link className={`sb-pildora${!actual ? " activa" : ""}`} href={base}>Todos</Link>
          {categorias.map((c) => (
            <Link key={c.id} className={`sb-pildora${actual?.id === c.id ? " activa" : ""}`} href={`${base}/categoria/${c.slug}`}>{c.nombre}</Link>
          ))}
        </div>

        {destacado && (
          <section className={`sb-portada-fila${masLeidos.length === 0 ? " sola" : ""}`}>
            <article className="sb-destacado">
              <Link href={`${base}/${destacado.slug}`} className="sb-destacado-img" aria-label={destacado.titulo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {portadaDest ? <img src={portadaDest} alt="" /> : <span className="sb-sinimg grande">{destacado.titulo.slice(0, 1)}</span>}
                <span className="sb-etiqueta">Post destacado</span>
              </Link>
              <div className="sb-destacado-cuerpo">
                <h2><Link href={`${base}/${destacado.slug}`}>{destacado.titulo}</Link></h2>
                <p>{limpiarTexto(destacado.extracto || destacado.contenido, 200)}</p>
              </div>
              <div className="sb-destacado-pie">
                <span className="sb-autor"><Avatar nombre={destacado.autor} /> {destacado.autor || "Redacción"}</span>
                <span className="sb-meta"><MetaLectura x={destacado} /></span>
              </div>
            </article>

            {masLeidos.length > 0 && (
              <aside className="sb-leidos">
                <h2>Lo más leído</h2>
                {masLeidos.map((x) => {
                  const p = urlWeb(x.portada_path);
                  return (
                    <article key={x.id} className="sb-leido">
                      <Link href={`${base}/${x.slug}`} className="sb-leido-img" aria-label={x.titulo}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p ? <img src={p} alt="" loading="lazy" /> : <span className="sb-sinimg">{x.titulo.slice(0, 1)}</span>}
                      </Link>
                      <div>
                        <h3><Link href={`${base}/${x.slug}`}>{x.titulo}</Link></h3>
                        <div className="sb-meta"><MetaLectura x={x} /></div>
                        <div className="sb-autor"><Avatar nombre={x.autor} /> {x.autor || "Redacción"}</div>
                      </div>
                    </article>
                  );
                })}
              </aside>
            )}
          </section>
        )}


        {resto.length > 0 && (
          <section className="sb-ultimos">
            <h2>{termino ? `Resultados para «${termino}»` : destacado ? "Últimos artículos" : actual ? actual.nombre : "Artículos"}</h2>
            <div className="sb-grilla">
              {resto.map((x) => (
                <TarjetaArticulo key={x.id} x={x} base={base} />
              ))}
            </div>
          </section>
        )}

        {arts.length === 0 && <div className="sb-vacio">{termino ? `No hay artículos para «${termino}».` : "Pronto publicaremos nuevos artículos."}</div>}

        {paginas > 1 && (
          <nav className="sb-paginas" aria-label="Páginas del blog">
            {pagina > 1 && <Link href={link(pagina - 1)}>‹ Anterior</Link>}
            {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (n === pagina ? <span key={n} className="activa">{n}</span> : <Link key={n} href={link(n)}>{n}</Link>))}
            {pagina < paginas && <Link href={link(pagina + 1)}>Siguiente ›</Link>}
          </nav>
        )}
      </div>
    </div>
  );
}
