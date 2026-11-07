import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { SOLO_BLOG, cargarAjustes, limpiarTexto, origenSitio, rutaSitio, urlWeb } from "@/lib/sitio/datos";
import "./sitio.css";

export async function generateMetadata(): Promise<Metadata> {
  const a = await cargarAjustes();
  const origen = await origenSitio(a);
  const titulo = a.seo_titulo || `${a.nombre_sitio} · ${a.eslogan ?? ""}`.trim();
  const desc = limpiarTexto(a.seo_descripcion || a.eslogan, 160);
  const og = urlWeb(a.og_imagen);
  return {
    metadataBase: new URL(origen),
    title: { default: titulo, template: `%s · ${a.nombre_sitio}` },
    description: desc,
    openGraph: { title: titulo, description: desc, siteName: a.nombre_sitio, type: "website", locale: "es_PE", ...(og ? { images: [og] } : {}) },
    twitter: { card: og ? "summary_large_image" : "summary", title: titulo, description: desc },
    verification: a.search_console ? { google: a.search_console } : undefined,
    alternates: { types: { "application/rss+xml": `${origen}/rss.xml` } },
  };
}

async function enlace(href: string) {
  return /^(https?:|mailto:|tel:|#)/.test(href) ? href : rutaSitio(href.startsWith("/") ? href : `/${href}`);
}

export default async function LayoutSitio({ children }: { children: React.ReactNode }) {
  const a = await cargarAjustes();
  const logo = urlWeb(a.logo_path);
  const menu = await Promise.all((a.menu ?? []).map(async (m) => ({ ...m, destino: await enlace(m.href) })));
  const pie = await Promise.all((a.pie_enlaces ?? []).map(async (m) => ({ ...m, destino: await enlace(m.href) })));
  const boton = a.boton_menu_texto ? { texto: a.boton_menu_texto, destino: await enlace(a.boton_menu_enlace || "/login") } : null;
  const inicio = await rutaSitio("/");
  const wa = a.whatsapp ? `https://wa.me/${a.whatsapp.replace(/\D/g, "")}${a.whatsapp_mensaje ? `?text=${encodeURIComponent(a.whatsapp_mensaje)}` : ""}` : null;
  const redes = Object.entries(a.redes ?? {}).filter(([, v]) => v);

  return (
    <div className="sw">
      <header className="sw-cab">
        <div className="sw-contenedor sw-cab-fila">
          <Link href={inicio} className="sw-marca">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={a.nombre_sitio} />
            ) : (
              <>
                <span className="sw-marca-sello" aria-hidden="true">✓</span>
                {a.nombre_sitio}
              </>
            )}
          </Link>
          {(menu.length > 0 || boton) && <nav className="sw-nav" aria-label="Menú principal">
            {menu.map((m) => (
              <Link key={m.href + m.texto} href={m.destino}>{m.texto}</Link>
            ))}
            {boton && <Link className="sw-boton chico" href={boton.destino} style={{ marginLeft: 8 }}>{boton.texto}</Link>}
          </nav>}
          {(menu.length > 0 || boton) && <details className="sw-menu-movil">
            <summary>Menú</summary>
            <nav aria-label="Menú principal">
              {menu.map((m) => (
                <Link key={m.href + m.texto} href={m.destino}>{m.texto}</Link>
              ))}
              {boton && <Link className="sw-boton chico" href={boton.destino}>{boton.texto}</Link>}
            </nav>
          </details>}
        </div>
      </header>

      <main className="sw-principal">{children}</main>

      <footer className="sw-pie">
        <div className="sw-contenedor">
          <div className="sw-pie-cols">
            <div>
              <h4>{a.nombre_sitio}</h4>
              <p style={{ margin: 0, maxWidth: "40ch" }}>{a.pie_texto || a.eslogan}</p>
            </div>
            {!SOLO_BLOG && <div>
              <h4>Enlaces</h4>
              <ul>
                {(pie.length ? pie : menu).map((m) => (
                  <li key={m.href + m.texto}><Link href={m.destino}>{m.texto}</Link></li>
                ))}
              </ul>
            </div>}
            {(!SOLO_BLOG || a.correo || a.telefono || a.direccion || redes.length > 0) && <div>
              <h4>Contacto</h4>
              <ul>
                {a.correo && <li><a href={`mailto:${a.correo}`}>{a.correo}</a></li>}
                {a.telefono && <li><a href={`tel:${a.telefono.replace(/\s/g, "")}`}>{a.telefono}</a></li>}
                {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>}
                {a.direccion && <li>{a.direccion}</li>}
                {redes.map(([k, v]) => (
                  <li key={k}><a href={v} target="_blank" rel="noopener noreferrer" style={{ textTransform: "capitalize" }}>{k}</a></li>
                ))}
              </ul>
            </div>}
          </div>
          <div className="sw-pie-abajo">
            <span>© {new Date().getFullYear()} {a.nombre_sitio}. Todos los derechos reservados.</span>
            {!SOLO_BLOG && <span>Hecho en Chanchamayo, Perú</span>}
          </div>
        </div>
      </footer>

      {wa && <a className="sw-wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribirnos por WhatsApp">WA</a>}

      {a.ga_id && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${a.ga_id}`} strategy="afterInteractive" />
          <Script id="ga" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${a.ga_id.replace(/[^A-Za-z0-9-]/g, "")}');`}</Script>
        </>
      )}
    </div>
  );
}
