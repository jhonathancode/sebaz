"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export type ItemMenu = { href: string; texto: string };

/** Íconos de trazo fino (estilo lineal), dibujados aquí para no cargar librerías. */
const ICONOS: Record<string, React.ReactNode> = {
  "/inicio": (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  "/expedientes": (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M8 13h8M8 16.5h5" />
    </>
  ),
  "/comprobantes": (
    <>
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  "/caja-chica": (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M16 14.5h2" />
      <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V6" />
    </>
  ),
  "/ingresos": (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M3 11v4c0 1.7 2.7 3 6 3 1 0 2-.1 2.8-.4" />
      <path d="M18 13v7M15 17l3 3 3-3" />
    </>
  ),
  "/almacen": (
    <>
      <path d="M3 8.5 12 4l9 4.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
      <path d="M7 20v-7h10v7" />
      <path d="M7 16.5h10" />
    </>
  ),
  "/rendicion": (
    <>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" />
      <path d="M14 3v5h5" />
      <path d="m9 14.5 2 2 4-4.5" />
    </>
  ),
  "/configuracion": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  "/responsables": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </>
  ),
  "/auditoria": (
    <>
      <path d="M9 4h6l1 2h3v15H5V6h3Z" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  "/soporte": (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

function Icono({ href }: { href: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      {ICONOS[href] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

/** Abre o cierra el menú: en computadora lo oculta (se recuerda); en celular lo despliega encima. */
export function BotonMenu() {
  function alternar() {
    const marco = document.querySelector<HTMLElement>(".marco-app");
    if (!marco) return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      marco.dataset.movil = marco.dataset.movil === "abierto" ? "" : "abierto";
      return;
    }
    const oculto = marco.dataset.menu !== "oculto";
    marco.dataset.menu = oculto ? "oculto" : "visible";
    document.cookie = `menu=${oculto ? "oculto" : "visible"}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button type="button" className="boton-menu" onClick={alternar} aria-label="Mostrar u ocultar el menú" title="Mostrar u ocultar el menú">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <span>Menú</span>
    </button>
  );
}

export type DatosMcpMenu = { nombre: string; ruc: string | null; logo: string | null } | null;

export default function Menu({ items, abajo = [], nuevo = true, mcp }: { items: ItemMenu[]; abajo?: ItemMenu[]; nuevo?: boolean; mcp: DatosMcpMenu }) {
  const ruta = usePathname();

  // En celular, al cambiar de página se cierra el menú.
  useEffect(() => {
    const marco = document.querySelector<HTMLElement>(".marco-app");
    if (marco) marco.dataset.movil = "";
  }, [ruta]);

  function cerrar() {
    const marco = document.querySelector<HTMLElement>(".marco-app");
    if (marco) marco.dataset.movil = "";
  }

  return (
    <>
      <div className="lm-fondo" onClick={cerrar} aria-hidden="true" />
      <nav className="lateral-menu no-imprimir" aria-label="Menú del sistema">
        {mcp && (
          <div className="lm-mcp">
            <div className="lm-escudo">
              {mcp.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mcp.logo} alt="" />
              ) : (
                <span aria-hidden="true">MCP</span>
              )}
            </div>
            <div className="lm-mcp-texto">
              <strong>{mcp.nombre}</strong>
              <span>RUC {mcp.ruc ?? "pendiente"}</span>
            </div>
          </div>
        )}

        {nuevo && (
          <Link href="/expedientes?nuevo=1" className="lm-nuevo">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo requerimiento
          </Link>
        )}

        <div className="lm-titulo">Trabajo diario</div>
        <ul>
          {items.map((i) => {
            const activo = ruta === i.href || ruta.startsWith(i.href + "/");
            return (
              <li key={i.href}>
                <Link href={i.href} className={activo ? "activo" : undefined} aria-current={activo ? "page" : undefined}>
                  <Icono href={i.href} />
                  <span>{i.texto}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {abajo.length > 0 && (
          <details className="lm-admin" open={abajo.some((i) => ruta.startsWith(i.href)) || undefined}>
            <summary>
              <Icono href="/configuracion" />
              <span>Configuración</span>
              <svg className="lm-flecha" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m6 15 6-6 6 6" />
              </svg>
            </summary>
            <ul>
              {abajo.map((i) => {
                const activo = ruta === i.href || ruta.startsWith(i.href + "/");
                return (
                  <li key={i.href}>
                    <Link href={i.href} className={activo ? "activo" : undefined} aria-current={activo ? "page" : undefined}>
                      <Icono href={i.href} />
                      <span>{i.texto}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </nav>
    </>
  );
}
