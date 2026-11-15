"use client";

import { useMemo, useState } from "react";
import type { ModuloTutorial } from "@/lib/tutoriales";

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Buscador, módulos en pestañas y guías que se abren y cierran. */
export default function PanelTutoriales({ modulos }: { modulos: ModuloTutorial[] }) {
  const [q, setQ] = useState("");
  const [modulo, setModulo] = useState<string>("todos");
  const filtrados = useMemo(() => {
    const t = sinTildes(q.trim());
    return modulos
      .filter((m) => modulo === "todos" || m.clave === modulo)
      .map((m) => ({ ...m, tutoriales: m.tutoriales.filter((x) => !t || sinTildes(`${x.titulo} ${x.pasos.join(" ")} ${x.consejo ?? ""}`).includes(t)) }))
      .filter((m) => m.tutoriales.length > 0);
  }, [modulos, q, modulo]);
  return (
    <div className="tut">
      <label className="buscador" style={{ maxWidth: 520 }}>
        <input type="search" placeholder="¿Qué quiere hacer? Ej.: anular, cheque, rendición…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      <div className="tut-mods" role="tablist" aria-label="Módulos">
        <button type="button" className={`f-chip${modulo === "todos" ? " activo" : ""}`} onClick={() => setModulo("todos")}>Todos</button>
        {modulos.map((m) => (
          <button key={m.clave} type="button" className={`f-chip${modulo === m.clave ? " activo" : ""}`} onClick={() => setModulo(m.clave)}>
            <span aria-hidden="true">{m.icono}</span> {m.texto}
          </button>
        ))}
      </div>
      {filtrados.length === 0 && <div className="aviso info">No hay guías con esa búsqueda. Pruebe con otra palabra.</div>}
      {filtrados.map((m) => (
        <section key={m.clave} className="tut-mod">
          <h2 className="sec-grupo"><span aria-hidden="true">{m.icono}</span> {m.texto}</h2>
          <div className="tut-lista">
            {m.tutoriales.map((x) => (
              <details key={x.titulo} className="tut-item" open={q.trim().length > 0}>
                <summary>{x.titulo}</summary>
                <ol>{x.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
                {x.consejo && <p className="tut-consejo"><b>Consejo:</b> {x.consejo}</p>}
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
