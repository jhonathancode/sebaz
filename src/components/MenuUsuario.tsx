"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BotonConfirmar from "./BotonConfirmar";

export type EnlaceMenu = { href: string; texto: string; grupo: "cuenta" | "administracion" | "soporte" };

/** Menú desplegable bajo el nombre del usuario: cuenta, administración y cerrar sesión. */
export default function MenuUsuario({
  nombre,
  cargo,
  mcp,
  iniciales,
  enlaces,
  mcps,
  mcpActual,
  cambiarMcp,
  salir,
}: {
  nombre: string;
  cargo: string;
  mcp: string | null;
  iniciales: string;
  enlaces: EnlaceMenu[];
  mcps: { id: string; nombre: string }[];
  mcpActual: string | null;
  cambiarMcp: (fd: FormData) => Promise<void>;
  salir: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const ruta = usePathname();

  useEffect(() => setAbierto(false), [ruta]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const grupo = (g: EnlaceMenu["grupo"]) => enlaces.filter((e) => e.grupo === g);

  return (
    <div className="menu-usuario" ref={caja}>
      <button type="button" className="usuario" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        <span className="avatar" aria-hidden="true">{iniciales}</span>
        <span className="usuario-texto">
          <span className="usuario-nombre">{nombre}</span>
          <span className="sub">{cargo}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ opacity: 0.7 }}>
          <path d={abierto ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>

      {abierto && (
        <div className="desplegable" role="menu">
          <div className="desplegable-cab">
            <div style={{ fontWeight: 600 }}>{nombre}</div>
            <div className="tenue pequeno">{cargo}</div>
            {mcp && <div className="tenue pequeno">{mcp}</div>}
          </div>

          {mcps.length > 1 && (
            <form action={cambiarMcp} className="desplegable-seccion" style={{ gap: 6 }}>
              <label className="campo">
                Trabajar en
                <select name="mcp" defaultValue={mcpActual ?? undefined}>
                  {mcps.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </label>
              <button className="btn" type="submit">Cambiar de MCP</button>
            </form>
          )}

          {(["cuenta", "administracion", "soporte"] as const).map((g) =>
            grupo(g).length ? (
              <div key={g} className="desplegable-seccion">
                {g === "administracion" && <div className="etiqueta">Administración</div>}
                {g === "soporte" && <div className="etiqueta">Soporte</div>}
                {grupo(g).map((e) => (
                  <Link key={e.href} href={e.href} role="menuitem" className={ruta.startsWith(e.href) ? "activo" : undefined}>
                    {e.texto}
                  </Link>
                ))}
              </div>
            ) : null,
          )}

          <form action={salir} className="desplegable-seccion">
            <BotonConfirmar className="salir" pregunta="¿Cerrar sesión?" textoConfirmar="Sí, salir">Cerrar sesión</BotonConfirmar>
          </form>
        </div>
      )}
    </div>
  );
}
