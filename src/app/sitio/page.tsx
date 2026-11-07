import Link from "next/link";
import ListaBlog from "./blog/ListaBlog";
import { SOLO_BLOG, cargarAjustes, fechaCorta, limpiarTexto, rutaSitio, supabasePublico, tiempoLectura, urlWeb, type Articulo, type Categoria } from "@/lib/sitio/datos";

export const dynamic = "force-dynamic";

const PILARES = [
  { t: "Requerimientos que se arman solos", d: "Requerimiento, cotizaciones, orden, conformidad y comprobante de pago en un solo recorrido, con numeración automática y todo en orden." },
  { t: "Caja chica que cuadra", d: "Registre gastos, declaraciones juradas y vea al instante cuánto falta para cuadrar el fondo, mes a mes." },
  { t: "Rendición a Perené y Chanchamayo", d: "El informe y los anexos salen de lo ya registrado. Sin copiar a mano y con la fecha límite siempre a la vista." },
  { t: "Contabilidad y estados de cuenta", d: "Libros, ejecución y conciliación con el estado de cuenta del Banco de la Nación, del cheque al comprobante." },
];

export default async function Inicio({ searchParams }: { searchParams: Promise<{ q?: string; pag?: string }> }) {
  if (SOLO_BLOG) {
    const sp = await searchParams;
    return <ListaBlog q={sp.q} pag={sp.pag} />;
  }
  const a = await cargarAjustes();
  const sb = supabasePublico();
  const [{ data: arts }, { data: cats }] = await Promise.all([
    sb.from("blog_articulos").select("*").in("estado", ["publicado", "programado"]).lte("publicado_en", new Date().toISOString()).order("publicado_en", { ascending: false }).limit(3),
    sb.from("blog_categorias").select("id, slug, nombre, descripcion"),
  ]);
  const categorias = new Map(((cats ?? []) as Categoria[]).map((c) => [c.id, c]));
  const base = await rutaSitio("/blog");
  const boton = a.boton_menu_enlace || "/login";
  const wa = a.whatsapp ? `https://wa.me/${a.whatsapp.replace(/\D/g, "")}` : null;

  return (
    <>
      <section className="sw-hero">
        <div className="sw-contenedor">
          <h1>{a.eslogan || "El orden de su municipalidad, sin papeleo"}</h1>
          <p>Zebaz es el sistema de control para las municipalidades de centros poblados: gastos, caja chica, rendición y contabilidad en un solo lugar, con todo respaldado y auditado.</p>
          <div className="sw-hero-acciones">
            <Link className="sw-boton" href={boton}>{a.boton_menu_texto || "Ingresar al sistema"}</Link>
            {wa ? <a className="sw-boton suave" href={wa} target="_blank" rel="noopener noreferrer">Escribirnos por WhatsApp</a> : <Link className="sw-boton suave" href={base}>Leer el blog</Link>}
          </div>
        </div>
      </section>

      <section className="sw-seccion">
        <div className="sw-contenedor">
          <h2>Todo lo que necesita la tesorería de su MCP</h2>
          <p className="sw-sub">Menos tiempo copiando y más tiempo gestionando: cada documento nace del anterior y nada se pierde.</p>
          <div className="sw-rejilla">
            {PILARES.map((p, i) => (
              <div key={p.t} className="sw-tarjeta">
                <span className="sw-icono">{i + 1}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {(arts ?? []).length > 0 && (
        <section className="sw-seccion">
          <div className="sw-contenedor">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
              <h2>Del blog</h2>
              <Link className="sw-boton suave chico" href={base}>Ver todos los artículos</Link>
            </div>
            <div className="sw-grilla">
              {((arts ?? []) as Articulo[]).map((x) => {
                const portada = urlWeb(x.portada_path);
                const cat = x.categoria_id ? categorias.get(x.categoria_id) : null;
                return (
                  <article key={x.id} className="sw-art">
                    <Link href={`${base}/${x.slug}`} className="sw-portada" aria-label={x.titulo}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {portada && <img src={portada} alt="" />}
                    </Link>
                    <div className="sw-art-cuerpo">
                      <div className="sw-meta">{cat && <span className="sw-cat">{cat.nombre}</span>}<span>{fechaCorta(x.publicado_en)}</span><span>· {tiempoLectura(x.contenido)} min</span></div>
                      <h3><Link href={`${base}/${x.slug}`}>{x.titulo}</Link></h3>
                      <p>{limpiarTexto(x.extracto || x.contenido, 130)}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="sw-contenedor">
        <div className="sw-cta">
          <div>
            <h2>¿Lista su MCP para trabajar con orden?</h2>
            <p>Hablemos y le mostramos Zebaz con los datos de su municipalidad.</p>
          </div>
          {wa ? <a className="sw-boton" href={wa} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a> : <Link className="sw-boton" href={boton}>{a.boton_menu_texto || "Ingresar"}</Link>}
        </div>
      </section>
    </>
  );
}
