import Link from "next/link";
import { contextoMcp } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import { cargarTupa, sinTildes, textoCosto, type ProcTupa } from "@/lib/tupa";

/** El TUPA y los servicios no exclusivos de la municipalidad, para consultar costos y requisitos. */
export default async function TupaCompleto({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { procs, modelo, fuente } = await cargarTupa(supabase, ctx.mcp.id);
  const q = sinTildes((sp.q ?? "").trim());
  const tipo = sp.tipo === "tupa" || sp.tipo === "tusne" ? sp.tipo : "";
  const filtradas = procs.filter(
    (p) => (!tipo || p.tipo === tipo) && (!q || sinTildes(`${p.nombre} ${p.area} ${p.numero} ${p.requisitos.join(" ")}`).includes(q)),
  );
  const grupos = new Map<string, ProcTupa[]>();
  for (const p of filtradas) {
    const k = `${p.tipo === "tusne" ? "Servicios no exclusivos (TUSNE)" : "Procedimientos (TUPA)"} · ${p.area}`;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  const abrir = !!q && filtradas.length <= 4;

  return (
    <>
      <div className="titulo-ventana">
        <Link className="btn" href="/ingresos">← Ingresos</Link>
        <h1>TUPA y servicios · {ctx.mcp.nombre}</h1>
      </div>

      {procs.length === 0 ? (
        <div className="panel"><div className="panel-cuerpo"><p className="tenue" style={{ margin: 0 }}>Todavía no hay un TUPA cargado para consultar.</p></div></div>
      ) : (
        <>
          {modelo && (
            <div className="aviso" style={{ marginBottom: 12 }}>
              Este es el TUPA modelo{fuente ? ` (${fuente})` : ""}. Los costos y requisitos de su municipalidad pueden ser distintos.
            </div>
          )}
          <form className="filtros" method="get" style={{ marginBottom: 12 }}>
            <label className="campo" style={{ flex: "1 1 260px" }}>
              Buscar
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre del trámite, requisito, área o número" />
            </label>
            <label className="campo">
              Mostrar
              <select name="tipo" defaultValue={tipo}>
                <option value="">Todo</option>
                <option value="tusne">Servicios no exclusivos</option>
                <option value="tupa">Procedimientos del TUPA</option>
              </select>
            </label>
            <button className="btn">Filtrar</button>
            {(q || tipo) && <Link className="btn contorno" href="/ingresos/tupa">Quitar filtros</Link>}
          </form>
          <p className="pequeno tenue" style={{ margin: "0 0 10px" }}>{filtradas.length} de {procs.length}</p>

          {[...grupos].map(([titulo, lista]) => (
            <section key={titulo} className="panel tupa-grupo">
              <div className="panel-cab">{titulo}</div>
              <div className="panel-cuerpo">
                {lista.map((p) => (
                  <details key={p.id} className="tupa-fila" open={abrir}>
                    <summary>
                      <span className="tupa-n">{p.numero}</span>
                      <span className="tupa-nombre">{p.nombre}</span>
                      <b className="tupa-costo">{p.derechos.length ? p.derechos.map(textoCosto).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(" · ") : "—"}</b>
                    </summary>
                    <div className="tupa-detalle plano">
                      <div className="tupa-bloque">
                        <span className="tupa-et">Costo{p.unidad ? ` (por ${p.unidad.replace(/\.$/, "")})` : ""}</span>
                        <ul className="tupa-costos">
                          {p.derechos.map((d, i) => (
                            <li key={i}>
                              <span className="tupa-c-txt">{d.detalle || (p.tipo === "tusne" ? "Costo" : "Derecho de tramitación")}{d.pct ? <small>{d.pct} de la UIT</small> : null}</span>
                              <b className={d.gratuito ? "gratis" : ""}>{textoCosto(d)}</b>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {p.requisitos.length > 0 && (
                        <div className="tupa-bloque">
                          <span className="tupa-et">Requisitos ({p.requisitos.length})</span>
                          <ul className="tupa-req">{p.requisitos.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      {(p.plazo || p.calificacion || p.autoridad) && (
                        <p className="tupa-pie">{[p.plazo && `Plazo: ${p.plazo} hábiles`, p.calificacion && `Calificación: ${p.calificacion}`, p.autoridad && `Resuelve: ${p.autoridad}`].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
          {filtradas.length === 0 && <p className="tenue">No hay resultados. Pruebe con otra palabra.</p>}
        </>
      )}
    </>
  );
}
