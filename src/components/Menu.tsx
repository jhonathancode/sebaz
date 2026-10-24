"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  "/rendicion": (
    <>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" />
      <path d="M14 3v5h5" />
      <path d="m9 14.5 2 2 4-4.5" />
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
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[href] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

const CLAVE = "menu-compacto";

export default function Menu({ items, nuevo = true }: { items: ItemMenu[]; nuevo?: boolean }) {
  const ruta = usePathname();
  const [compacto, setCompacto] = useState(false);

  useEffect(() => {
    try {
      setCompacto(localStorage.getItem(CLAVE) === "1");
    } catch {
      /* sin almacenamiento: menú normal */
    }
  }, []);

  function alternar() {
    setCompacto((v) => {
      try {
        localStorage.setItem(CLAVE, v ? "0" : "1");
      } catch {
        /* sin almacenamiento */
      }
      return !v;
    });
  }

  return (
    <nav className={`lateral-menu no-imprimir${compacto ? " compacto" : ""}`} aria-label="Menú del sistema">
      {nuevo && (
        <Link href="/expedientes?nuevo=1" className="lm-nuevo" title="Nuevo requerimiento">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="lm-texto">Nuevo requerimiento</span>
        </Link>
      )}

      <div className="lm-titulo">Trabajo diario</div>
      <ul>
        {items.map((i) => {
          const activo = ruta === i.href || ruta.startsWith(i.href + "/");
          return (
            <li key={i.href}>
              <Link href={i.href} className={activo ? "activo" : undefined} aria-current={activo ? "page" : undefined} title={i.texto}>
                <span className="lm-icono"><Icono href={i.href} /></span>
                <span className="lm-texto">{i.texto}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <button type="button" className="lm-plegar" onClick={alternar} aria-label={compacto ? "Mostrar el menú completo" : "Achicar el menú"} title={compacto ? "Mostrar el menú completo" : "Achicar el menú"}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={compacto ? "m10 7 5 5-5 5" : "m14 7-5 5 5 5"} />
        </svg>
        <span className="lm-texto">Achicar menú</span>
      </button>
    </nav>
  );
}
