import Link from "next/link";
import { fechaCorta, limpiarTexto, rutaSitio, supabasePublico, tiempoLectura, urlWeb, type Articulo, type Categoria } from "@/lib/sitio/datos";

const POR_PAGINA = 9;

export function TarjetaArticulo({ x, cat, base }: { x: Articulo; cat?: Categoria | null; base: string }) {
  const portada = urlWeb(x.portada_path);
  return (
    <article className="sw-art">
      <Link href={`${base}/${x.slug}`} className="sw-portada" aria-label={x.titulo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {portada && <img src={portada} alt="" />}
      </Link>
      <div className="sw-art-cuerpo">
        <div className="sw-meta">
          {cat && <span className="sw-cat">{cat.nombre}</span>}
          <span>{fechaCorta(x.publicado_en)}</span>
          <span>· {tiempoLectura(x.contenido)} min de lectura</span>
        </div>
        <h3><Link href={`${base}/${x.slug}`}>{x.titulo}</Link></h3>
        <p>{limpiarTexto(x.extracto || x.contenido, 140)}</p>
      </div>
    </article>
  );
}

/** Lista del blog con categorías, buscador y paginación; sirve para el blog y para cada categoría. */
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
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const enMuchos = !termino && !actual && pagina === 1;
  const destacado = enMuchos ? arts.find((x) => x.destacado) ?? null : null;
  const resto = destacado ? arts.filter((x) => x.id !== destacado.id) : arts;
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (termino) params.set("q", termino);
    if (p > 1) params.set("pag", String(p));
    const s = params.toString();
    return `${actual ? `${base}/categoria/${actual.slug}` : base}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="sw-contenedor">
      <div className="sw-blog-cab">
        <h1>{actual ? actual.nombre : "Blog"}</h1>
        <p>{actual?.descripcion || "Guías, normas y buenas prácticas para la gestión de su municipalidad de centro poblado."}</p>
        <div className="sw-filtros">
          <Link className={`sw-pildora${!actual ? " activa" : ""}`} href={base}>Todos</Link>
          {categorias.map((c) => (
            <Link key={c.id} className={`sw-pildora${actual?.id === c.id ? " activa" : ""}`} href={`${base}/categoria/${c.slug}`}>{c.nombre}</Link>
          ))}
          <form className="sw-buscar" method="get" action={actual ? `${base}/categoria/${actual.slug}` : base} role="search">
            <input name="q" defaultValue={termino} placeholder="Buscar artículos…" aria-label="Buscar en el blog" />
            <button className="sw-boton chico" type="submit">Buscar</button>
          </form>
        </div>
      </div>

      {destacado && (
        <article className="sw-destacado">
          <Link href={`${base}/${destacado.slug}`} className="sw-portada" aria-label={destacado.titulo} style={{ aspectRatio: "auto" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {urlWeb(destacado.portada_path) && <img src={urlWeb(destacado.portada_path)!} alt="" />}
          </Link>
          <div className="sw-destacado-texto">
            <div className="sw-meta">
              <span className="sw-cat">Destacado</span>
              {destacado.categoria_id && porId.get(destacado.categoria_id) && <span>· {porId.get(destacado.categoria_id)!.nombre}</span>}
              <span>· {fechaCorta(destacado.publicado_en)}</span>
            </div>
            <h2><Link href={`${base}/${destacado.slug}`}>{destacado.titulo}</Link></h2>
            <p style={{ margin: 0, color: "var(--sw-tenue)", fontSize: 17 }}>{limpiarTexto(destacado.extracto || destacado.contenido, 200)}</p>
            <div><Link className="sw-boton chico" href={`${base}/${destacado.slug}`}>Leer artículo</Link></div>
          </div>
        </article>
      )}

      {resto.length > 0 ? (
        <div className="sw-grilla">
          {resto.map((x) => (
            <TarjetaArticulo key={x.id} x={x} cat={x.categoria_id ? porId.get(x.categoria_id) : null} base={base} />
          ))}
        </div>
      ) : (
        !destacado && <div className="sw-vacio">{termino ? `No hay artículos para «${termino}».` : "Pronto publicaremos nuevos artículos."}</div>
      )}

      {paginas > 1 && (
        <nav className="sw-paginas" aria-label="Páginas del blog">
          {pagina > 1 && <Link href={link(pagina - 1)}>‹ Anterior</Link>}
          {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (n === pagina ? <span key={n} className="activa">{n}</span> : <Link key={n} href={link(n)}>{n}</Link>))}
          {pagina < paginas && <Link href={link(pagina + 1)}>Siguiente ›</Link>}
        </nav>
      )}
    </div>
  );
}
