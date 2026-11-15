"use client";

import { useEffect, useMemo, useState } from "react";
import type { ModuloTutorial, Tutorial } from "@/lib/tutoriales";

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
type Abierto = { tutorial: Tutorial; modulo: ModuloTutorial };

/** Módulos a la izquierda, guías como tarjetas pequeñas y el paso a paso en una ventana. */
export default function PanelTutoriales({ modulos }: { modulos: ModuloTutorial[] }) {
  const [q, setQ] = useState("");
  const [clave, setClave] = useState(modulos[0]?.clave ?? "");
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const buscando = q.trim().length > 0;

  const tarjetas = useMemo(() => {
    const t = sinTildes(q.trim());
    const fuente = buscando ? modulos : modulos.filter((m) => m.clave === clave);
    return fuente.flatMap((m) =>
      m.tutoriales
        .filter((x) => !t || sinTildes(`${x.titulo} ${x.pasos.join(" ")} ${x.consejo ?? ""}`).includes(t))
        .map((x) => ({ tutorial: x, modulo: m })),
    );
  }, [modulos, q, clave, buscando]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(null);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const actual = modulos.find((m) => m.clave === clave);
  return (
    <div className="tut">
      <label className="buscador tut-buscar">
        <input type="search" placeholder="¿Qué quiere hacer? Ej.: anular, cheque, rendición…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      <div className="tut-cuerpo">
        <nav className="tut-mods" aria-label="Módulos">
          {modulos.map((m) => (
            <button key={m.clave} type="button" className={`tut-mod${!buscando && clave === m.clave ? " activo" : ""}`} onClick={() => { setQ(""); setClave(m.clave); }}>
              <span aria-hidden="true">{m.icono}</span>
              <span>{m.texto}</span>
              <small>{m.tutoriales.length}</small>
            </button>
          ))}
        </nav>
        <div className="tut-der">
          <div className="tut-tit">{buscando ? `Resultados (${tarjetas.length})` : `${actual?.icono ?? ""} ${actual?.texto ?? ""}`}</div>
          {tarjetas.length === 0 && <div className="aviso info">No hay guías con esa búsqueda. Pruebe con otra palabra.</div>}
          <div className="tut-grid">
            {tarjetas.map((c) => (
              <button key={`${c.modulo.clave}-${c.tutorial.titulo}`} type="button" className="tut-card" onClick={() => setAbierto(c)}>
                <b>{c.tutorial.titulo}</b>
                <small>{buscando ? `${c.modulo.texto} · ` : ""}{c.tutorial.pasos.length} pasos</small>
              </button>
            ))}
          </div>
        </div>
      </div>
      {abierto && (
        <div className="tut-velo" onClick={() => setAbierto(null)}>
          <div className="tut-ventana" role="dialog" aria-modal="true" aria-label={abierto.tutorial.titulo} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tut-x" onClick={() => setAbierto(null)} aria-label="Cerrar">×</button>
            <small className="tenue">{abierto.modulo.icono} {abierto.modulo.texto}</small>
            <h2>{abierto.tutorial.titulo}</h2>
            <ol>{abierto.tutorial.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
            {abierto.tutorial.consejo && <p className="tut-consejo"><b>Consejo:</b> {abierto.tutorial.consejo}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
