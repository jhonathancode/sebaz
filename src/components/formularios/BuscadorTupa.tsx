"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { resumenCosto, sinTildes, textoCosto, type DerechoTupa, type ProcTupa } from "@/lib/tupa";

type Filtro = "todo" | "tupa" | "tusne";
const MAX = 10;

/** Rubro del recibo según lo que se cobra: los trámites del TUPA son tasas; los del TUSNE, según su nombre. */
function rubroDe(p: ProcTupa): string {
  if (p.tipo === "tupa") return "tasa";
  if (/alquiler/i.test(p.nombre)) return "alquiler";
  if (/venta/i.test(p.nombre)) return "venta";
  return "servicio";
}
const NOMBRE_RUBRO: Record<string, string> = { tasa: "Tasa o derecho", servicio: "Prestación de servicios", venta: "Venta de bienes", alquiler: "Alquileres" };

/**
 * Buscador del TUPA dentro del recibo de ingreso: se escribe el trámite, se ve su costo y sus requisitos, y con un
 * clic se llenan el rubro, el concepto y el monto del recibo (que se pueden corregir).
 */
export default function BuscadorTupa({ procs, modelo, fuente }: { procs: ProcTupa[]; modelo: boolean; fuente: string | null }) {
  const raiz = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [sel, setSel] = useState<ProcTupa | null>(null);
  const [aplicado, setAplicado] = useState("");
  const hayTusne = procs.some((p) => p.tipo === "tusne");

  const { lista, total } = useMemo(() => {
    const t = sinTildes(q.trim());
    const base = procs.filter((p) => filtro === "todo" || p.tipo === filtro);
    if (!t && filtro === "todo") return { lista: [] as ProcTupa[], total: 0 };
    const puntos = (p: ProcTupa) => {
      const n = sinTildes(p.nombre);
      if (!t) return 1;
      if (n.startsWith(t)) return 4;
      if (n.includes(t)) return 3;
      if (sinTildes(`${p.area} ${p.numero}`).includes(t)) return 2;
      if (sinTildes(p.requisitos.join(" ")).includes(t)) return 1;
      return 0;
    };
    const ok = base.map((p) => ({ p, s: puntos(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.p);
    return { lista: ok.slice(0, MAX), total: ok.length };
  }, [procs, q, filtro]);

  /** Escribe en un campo del formulario del recibo como si lo hubiera tecleado la persona. */
  function poner(nombre: string, valor: string) {
    const form = raiz.current?.closest("form");
    const el = form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${nombre}"]`);
    if (!el) return;
    const esSelect = el instanceof HTMLSelectElement;
    Object.getOwnPropertyDescriptor(esSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(el, valor);
    el.dispatchEvent(new Event(esSelect ? "change" : "input", { bubbles: true }));
  }

  /** Llena el rubro, el concepto y el monto del recibo (el monto queda vacío si todavía no se elige un costo). */
  function llenar(p: ProcTupa, d?: DerechoTupa) {
    const rubro = rubroDe(p);
    poner("rubro", rubro);
    poner("concepto", d?.detalle && p.tipo === "tupa" ? `${p.nombre} - ${d.detalle}` : p.nombre);
    const monto = d?.monto ?? null;
    poner("monto", monto != null ? monto.toFixed(2) : "");
    return { rubro, monto };
  }

  function usar(p: ProcTupa, d?: DerechoTupa) {
    const { rubro, monto } = llenar(p, d);
    setAplicado(`Se llenó el recibo: ${NOMBRE_RUBRO[rubro]}${monto != null ? ` · S/ ${monto.toFixed(2)}` : ""}. ${monto == null ? "Escriba el monto. " : ""}Revíselo antes de emitir.`);
  }

  function elegir(p: ProcTupa) {
    setSel(p);
    const costos = p.derechos.filter((d) => !d.gratuito && d.monto != null);
    // Si el costo es uno solo y claro, el recibo se llena de una vez; si hay varios, se elige cuál cobrar
    if (p.derechos.length === 1 && costos.length === 1) usar(p, costos[0]);
    else {
      llenar(p);
      setAplicado(costos.length > 1 ? "Elija abajo el costo que va a cobrar: el monto se llena con él." : "");
    }
  }

  return (
    <div ref={raiz} className="tupa-buscador">
      <div className="tupa-cab">
        <label className="campo tupa-campo">
          Buscar en el TUPA
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(null);
            }}
            placeholder="Copias, constancia, alquiler, partida…"
            autoComplete="off"
            enterKeyHint="search"
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          />
        </label>
        {hayTusne && (
          <div className="tupa-filtros" role="group" aria-label="Qué buscar">
            {([["todo", "Todo"], ["tusne", "Servicios"], ["tupa", "Trámites"]] as [Filtro, string][]).map(([k, t]) => (
              <button key={k} type="button" className={`f-chip${filtro === k ? " activo" : ""}`} aria-pressed={filtro === k} onClick={() => { setFiltro(k); setSel(null); }}>{t}</button>
            ))}
          </div>
        )}
        <Link className="tupa-ver" href="/ingresos/tupa" target="_blank">Ver todo el TUPA ↗</Link>
      </div>

      {!sel && lista.length > 0 && (
        <ul className="tupa-lista">
          {lista.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => elegir(p)}>
                <span className="tupa-n">{p.numero}</span>
                <span className="tupa-nombre">
                  {p.nombre}
                  <small>{p.area}{p.unidad ? ` · por ${p.unidad.replace(/\.$/, "")}` : ""}</small>
                </span>
                <b className="tupa-costo">{resumenCosto(p)}</b>
              </button>
            </li>
          ))}
          {total > lista.length && <li className="tupa-mas">Hay {total - lista.length} más. Escriba más letras para acotar.</li>}
        </ul>
      )}
      {!sel && q.trim().length > 1 && lista.length === 0 && <p className="tupa-nada">No hay nada en el TUPA con «{q.trim()}». Puede escribir el concepto a mano.</p>}

      {sel && (
        <div className="tupa-detalle">
          <div className="tupa-det-cab">
            <div>
              <b>{sel.nombre}</b>
              <small>{sel.tipo === "tusne" ? "Servicio no exclusivo" : "Procedimiento del TUPA"} · {sel.area} · N° {sel.numero}</small>
            </div>
            <button type="button" className="btn chico contorno" onClick={() => { setSel(null); setAplicado(""); }}>Cambiar</button>
          </div>

          <div className="tupa-bloque">
            <span className="tupa-et">Costo</span>
            <ul className="tupa-costos">
              {sel.derechos.map((d, i) => (
                <li key={i}>
                  <span className="tupa-c-txt">
                    {d.detalle || (sel.tipo === "tusne" ? `Costo${sel.unidad ? ` por ${sel.unidad.replace(/\.$/, "")}` : ""}` : "Derecho de tramitación")}
                    {d.pct ? <small>{d.pct} de la UIT</small> : null}
                  </span>
                  <b className={d.gratuito ? "gratis" : ""}>{textoCosto(d)}</b>
                  {d.monto != null && !d.gratuito ? (
                    <button type="button" className="btn chico primario" onClick={() => usar(sel, d)}>Usar este monto</button>
                  ) : (
                    <span className="tupa-var">{d.gratuito ? "No se cobra" : "Costo variable: escriba el monto"}</span>
                  )}
                </li>
              ))}
            </ul>
            {sel.derechos.every((d) => d.monto == null) && (
              <button type="button" className="btn chico contorno" onClick={() => usar(sel)}>Usar este trámite sin monto</button>
            )}
          </div>

          {sel.requisitos.length > 0 && (
            <div className="tupa-bloque">
              <span className="tupa-et">Requisitos ({sel.requisitos.length})</span>
              <ul className="tupa-req">
                {sel.requisitos.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {(sel.plazo || sel.calificacion || sel.autoridad) && (
            <p className="tupa-pie">
              {[sel.plazo && `Plazo: ${sel.plazo} hábiles`, sel.calificacion && `Calificación: ${sel.calificacion}`, sel.autoridad && `Resuelve: ${sel.autoridad}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {aplicado && <p className="tupa-aplicado" role="status">{aplicado}</p>}
        </div>
      )}

      {modelo && (
        <p className="tupa-modelo">
          Este es el TUPA modelo{fuente ? ` (${fuente})` : ""}. Los costos de su municipalidad pueden ser distintos: revíselos antes de cobrar.
        </p>
      )}
    </div>
  );
}
