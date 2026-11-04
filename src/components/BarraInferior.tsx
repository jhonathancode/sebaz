"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, alternarMenu } from "@/components/Menu";

export type PestanaInferior = { href: string; texto: string; n?: number };

/** Barra de pestañas de abajo (solo celular): lo más usado a un toque del pulgar; «Más» abre el menú completo. */
export default function BarraInferior({ pestanas }: { pestanas: PestanaInferior[] }) {
  const ruta = usePathname();
  const activa = pestanas
    .map((p) => p.href)
    .filter((h) => (h === "/" ? ruta === "/" : ruta === h || ruta.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="barra-inf no-imprimir" aria-label="Accesos principales">
      {pestanas.map((p) => (
        <Link key={p.href} href={p.href} className={activa === p.href ? "activo" : undefined} aria-current={activa === p.href ? "page" : undefined}>
          <span className="bi-ico">
            <Icono href={p.href} />
            {!!p.n && <span className="bi-n">{p.n}</span>}
          </span>
          <span className="bi-txt">{p.texto}</span>
        </Link>
      ))}
      <button type="button" onClick={alternarMenu} aria-label="Abrir el menú completo">
        <span className="bi-ico">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </span>
        <span className="bi-txt">Más</span>
      </button>
    </nav>
  );
}
