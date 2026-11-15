"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
type Tarjeta = { slug: string; titulo: string; pasos: number; video: boolean; texto: string };
type Modulo = { clave: string; texto: string; icono: string; tutoriales: Tarjeta[] };

/** Módulos a la izquierda y guías como tarjetas; cada una abre su propia página con video y pasos. */
export default function PanelTutoriales({ modulos, inicial }: { modulos: Modulo[]; inicial?: string }) {
  const [q, setQ] = useState("");
  const [clave, setClave] = useState(modulos.some((m) => m.clave === inicial) ? inicial! : "todos");
  const buscando = q.trim().length > 0;
  const tarjetas = useMemo(() => {
    const t = sinTildes(q.trim());
    const fuente = buscando || clave === "todos" ? modulos : modulos.filter((m) => m.clave === clave);
    return fuente.flatMap((m) => m.tutoriales.filter((x) => !t || sinTildes(`${x.titulo} ${x.texto}`).includes(t)).map((x) => ({ x, m })));
  }, [modulos, q, clave, buscando]);
  const actual = modulos.find((m) => m.clave === clave);
  return (
    <div className="tut">
      <label className="buscador tut-buscar">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" placeholder="¿Qué quiere hacer? Ej.: anular, cheque, rendición…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      <div className="tut-cuerpo">
        <nav className="tut-mods" aria-label="Módulos">
          <button type="button" className={`tut-mod${!buscando && clave === "todos" ? " activo" : ""}`} onClick={() => { setQ(""); setClave("todos"); }}>
            <span aria-hidden="true">📚</span>
            <span>Todas las guías</span>
            <small>{modulos.reduce((n, m) => n + m.tutoriales.length, 0)}</small>
          </button>
          {modulos.map((m) => (
            <button key={m.clave} type="button" className={`tut-mod${!buscando && clave === m.clave ? " activo" : ""}`} onClick={() => { setQ(""); setClave(m.clave); }}>
              <span aria-hidden="true">{m.icono}</span>
              <span>{m.texto}</span>
              <small>{m.tutoriales.length}</small>
            </button>
          ))}
        </nav>
        <div className="tut-der">
          {buscando && <div className="tut-tit">Resultados ({tarjetas.length})</div>}
          {tarjetas.length === 0 && <div className="aviso info">No hay guías con esa búsqueda. Pruebe con otra palabra.</div>}
          {(buscando ? [null] : modulos.filter((m) => clave === "todos" || m.clave === clave)).map((m) => {
            const lista = m ? m.tutoriales.map((x) => ({ x, m })) : tarjetas;
            return (
              <section key={m?.clave ?? "res"} className="tut-seccion">
                {m && <div className="tut-tit"><span aria-hidden="true">{m.icono}</span> {m.texto} <small>{m.tutoriales.length}</small></div>}
                <div className="tut-grid">
                  {lista.map(({ x, m: mm }) => (
                    <Link key={x.slug} href={`/tutoriales/${x.slug}`} className="tut-card">
                      <span className="tut-play" aria-hidden="true">{x.video ? "▶" : "☰"}</span>
                      <span className="tut-card-t">
                        <b>{x.titulo}</b>
                        <small>{buscando ? `${mm.texto} · ` : ""}{x.video ? "Video · " : ""}{x.pasos} pasos</small>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
