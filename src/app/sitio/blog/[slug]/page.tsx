import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CompartirEnlace from "@/components/CompartirEnlace";
import { cargarAjustes, limpiarTexto, mdAHtml, origenSitio, rutaSitio, supabasePublico, urlWeb, type Articulo, type Categoria } from "@/lib/sitio/datos";
import { Avatar, MetaLectura, TarjetaArticulo } from "../ListaBlog";

export const dynamic = "force-dynamic";

async function cargar(slug: string) {
  const sb = supabasePublico();
  const { data } = await sb.from("blog_articulos").select("*").eq("slug", slug).in("estado", ["publicado", "programado"]).lte("publicado_en", new Date().toISOString()).maybeSingle();
  return (data as Articulo | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await cargar(slug);
  if (!a) return {};
  const aj = await cargarAjustes();
  const origen = await origenSitio(aj);
  const portada = urlWeb(a.portada_path) ?? urlWeb(aj.og_imagen);
  const titulo = a.seo_titulo || a.titulo;
  const desc = limpiarTexto(a.seo_descripcion || a.extracto || a.contenido, 160);
  return {
    title: titulo,
    description: desc,
    alternates: { canonical: `${origen}/blog/${a.slug}` },
    openGraph: { type: "article", title: titulo, description: desc, publishedTime: a.publicado_en ?? undefined, modifiedTime: a.actualizado_en, authors: a.autor ? [a.autor] : undefined, ...(portada ? { images: [portada] } : {}) },
    twitter: { card: portada ? "summary_large_image" : "summary", title: titulo, description: desc },
  };
}

export default async function ArticuloPagina({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await cargar(slug);
  if (!a) notFound();
  const sb = supabasePublico();
  const base = await rutaSitio("/blog");
  const aj = await cargarAjustes();
  const origen = await origenSitio(aj);
  void sb.rpc("blog_sumar_lectura", { p_slug: slug });

  const [{ data: cat }, { data: relacionados }] = await Promise.all([
    a.categoria_id ? sb.from("blog_categorias").select("id, slug, nombre, descripcion").eq("id", a.categoria_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("blog_articulos").select("*").in("estado", ["publicado", "programado"]).lte("publicado_en", new Date().toISOString()).neq("id", a.id).eq("categoria_id", a.categoria_id ?? "00000000-0000-0000-0000-000000000000").order("publicado_en", { ascending: false }).limit(3),
  ]);
  const categoria = cat as Categoria | null;
  const { html, indice } = mdAHtml(a.contenido);
  const portada = urlWeb(a.portada_path);
  const url = `${origen}/blog/${a.slug}`;
  const json = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.titulo,
    description: limpiarTexto(a.seo_descripcion || a.extracto || a.contenido, 160),
    image: portada ? [portada] : undefined,
    datePublished: a.publicado_en,
    dateModified: a.actualizado_en,
    author: { "@type": "Person", name: a.autor || aj.nombre_sitio },
    publisher: { "@type": "Organization", name: aj.nombre_sitio },
    mainEntityOfPage: url,
  };

  return (
    <div className="sb">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }} />
      <div className="sw-contenedor">
        <header className="sb-hero">
          <div className="sb-hero-texto">
            <div className="sb-ruta">
              <Link href={base}>Blog</Link>
              {categoria && <> <span>/</span> <Link href={`${base}/categoria/${categoria.slug}`}>{categoria.nombre}</Link></>}
            </div>
            <h1>{a.titulo}</h1>
            {a.extracto && <p className="sb-extracto">{a.extracto}</p>}
            <div className="sb-meta vertical"><MetaLectura x={a} /></div>
          </div>
          {portada && (
            <div className="sb-hero-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portada} alt={a.titulo} />
            </div>
          )}
        </header>


        <div className="sb-cuerpo">
          <article className="sb-contenido">
            <div className="sw-texto" dangerouslySetInnerHTML={{ __html: html }} />
            {a.etiquetas.length > 0 && <div className="sw-etiquetas">{a.etiquetas.map((t) => <span key={t}>#{t}</span>)}</div>}
            <CompartirEnlace url={url} titulo={a.titulo} />
          </article>

          <aside className="sb-lateral">
            <div className="sb-caja">
              <h4>Autor del artículo</h4>
              <div className="sb-autor grande"><Avatar nombre={a.autor} /> <b>{a.autor || aj.nombre_sitio}</b></div>
            </div>
            {indice.length > 1 && (
              <nav className="sb-caja" aria-label="Contenido del artículo">
                <h4>En este artículo</h4>
                {indice.map((i) => (
                  <a key={i.id} href={`#${i.id}`} className={i.nivel === 3 ? "n3" : undefined}>{i.texto}</a>
                ))}
              </nav>
            )}
          </aside>
        </div>

        {(relacionados ?? []).length > 0 && (
          <section className="sb-ultimos">
            <h2>Artículos relacionados</h2>
            <div className="sb-grilla">
              {((relacionados ?? []) as Articulo[]).map((x) => (
                <TarjetaArticulo key={x.id} x={x} base={base} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
