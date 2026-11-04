"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { resumenCosto, sinTildes, textoCosto, type DerechoTupa, type ProcTupa } from "@/lib/tupa";

type Filtro = "todo" | "tupa" | "tusne";
const MAX = 12;
const REQ_VISIBLES = 5;

/** Rubro del recibo según lo que se cobra: los trámites del TUPA son tasas; los del TUSNE, según su nombre. */
function rubroDe(p: ProcTupa): string {
  if (p.tipo === "tupa") return "tasa";
  if (/alquiler/i.test(p.nombre)) return "alquiler";
  if (/venta/i.test(p.nombre)) return "venta";
  return "servicio";
}
const NOMBRE_RUBRO: Record<string, string> = { tasa: "Tasa o derecho", servicio: "Prestación de servicios", venta: "Venta de bienes", alquiler: "Alquileres" };
const unidadTxt = (p: ProcTupa) => (p.unidad ? `por ${p.unidad.replace(/\.$/, "")}` : "");

function Lupa() {
  return (
    <svg className="tp-lupa" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 13l4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Panel del TUPA junto al recibo de ingreso: se busca el trámite o servicio, se ve su costo (tarjetas) y sus
 * requisitos, y con un clic se llenan el rubro, el concepto y el monto del recibo, que se pueden corregir.
 */
export default function BuscadorTupa({ procs, modelo, fuente }: { procs: ProcTupa[]; modelo: boolean; fuente: string | null }) {
  const raiz = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [sel, setSel] = useState<ProcTupa | null>(null);
  const [costoSel, setCostoSel] = useState<number | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const hayTusne = procs.some((p) => p.tipo === "tusne");
  const frecuentes = useMemo(() => procs.filter((p) => p.tipo === "tusne").slice(0, 7), [procs]);

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
    const limite = filtro === "tusne" && !t ? 40 : MAX;
    return { lista: ok.slice(0, limite), total: ok.length };
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
    poner("rubro", rubroDe(p));
    poner("concepto", d?.detalle && p.tipo === "tupa" ? `${p.nombre} - ${d.detalle}` : p.nombre);
    poner("monto", d?.monto != null ? d.monto.toFixed(2) : "");
  }

  function elegir(p: ProcTupa) {
    setSel(p);
    setVerTodos(false);
    const clarosIdx = p.derechos.map((d, i) => (!d.gratuito && d.monto != null ? i : -1)).filter((i) => i >= 0);
    // Si el costo es uno solo y claro, el recibo se llena de una vez; si hay varios, se elige cuál cobrar
    if (p.derechos.length === 1 && clarosIdx.length === 1) {
      setCostoSel(clarosIdx[0]);
      llenar(p, p.derechos[clarosIdx[0]]);
    } else {
      setCostoSel(null);
      llenar(p);
    }
  }

  function elegirCosto(p: ProcTupa, i: number) {
    setCostoSel(i);
    llenar(p, p.derechos[i]);
  }

  function volver() {
    setSel(null);
    setCostoSel(null);
  }

  const inicio = !sel && !q.trim() && filtro === "todo";
  const cobrable = (d: DerechoTupa) => !d.gratuito && d.monto != null;

  return (
    <div ref={raiz} className="tp">
      <div className="tp-cab">
        <div className="tp-tit">
          <b>TUPA</b>
          {modelo && <span className="tp-modelo" title={`TUPA modelo${fuente ? ` (${fuente})` : ""}. Los costos de su municipalidad pueden ser distintos: revíselos antes de cobrar.`}>Modelo</span>}
        </div>
        <Link className="tp-ver" href="/ingresos/tupa" target="_blank">Ver todo ↗</Link>
      </div>

      <div className="tp-buscar">
        <Lupa />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            volver();
          }}
          placeholder="Buscar: copias, constancia, alquiler, partida…"
          aria-label="Buscar en el TUPA"
          autoComplete="off"
          enterKeyHint="search"
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
      </div>

      {hayTusne && (
        <div className="tp-seg" role="group" aria-label="Qué buscar">
          {([["todo", "Todo"], ["tusne", "Servicios"], ["tupa", "Trámites"]] as [Filtro, string][]).map(([k, t]) => (
            <button key={k} type="button" className={filtro === k ? "activo" : ""} aria-pressed={filtro === k} onClick={() => { setFiltro(k); volver(); }}>{t}</button>
          ))}
        </div>
      )}

      <div className="tp-cuerpo">
        {inicio && frecuentes.length > 0 && (
          <div className="tp-grupo">
            <span className="tp-et">Servicios frecuentes</span>
            <ul className="tp-lista">
              {frecuentes.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => elegir(p)}>
                    <span className="tp-nombre">{p.nombre}<small>{unidadTxt(p)}</small></span>
                    <b className="tp-costo">{resumenCosto(p)}</b>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="tp-mas-btn" onClick={() => setFiltro("tusne")}>Ver todos los servicios</button>
          </div>
        )}
        {inicio && frecuentes.length === 0 && <p className="tp-nada">Escriba arriba el trámite que va a cobrar.</p>}

        {!sel && lista.length > 0 && (
          <div className="tp-grupo">
            <span className="tp-et">{total} resultado{total === 1 ? "" : "s"}</span>
            <ul className="tp-lista">
              {lista.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => elegir(p)}>
                    <span className="tp-nombre">
                      {p.nombre}
                      <small>{p.tipo === "tusne" ? "Servicio" : `Trámite ${p.numero}`} · {p.area}{unidadTxt(p) ? ` · ${unidadTxt(p)}` : ""}</small>
                    </span>
                    <b className="tp-costo">{resumenCosto(p)}</b>
                  </button>
                </li>
              ))}
            </ul>
            {total > lista.length && <p className="tp-nada">Hay {total - lista.length} más. Escriba más letras para acotar.</p>}
          </div>
        )}
        {!sel && !inicio && lista.length === 0 && <p className="tp-nada">No hay nada con «{q.trim()}». Puede escribir el concepto a mano.</p>}

        {sel && (
          <div className="tp-det">
            <button type="button" className="tp-volver" onClick={volver}>← Volver a los resultados</button>
            <div className="tp-det-tit">
              <b>{sel.nombre}</b>
              <div className="tp-etiquetas">
                <span>{sel.tipo === "tusne" ? "Servicio" : "Trámite del TUPA"}</span>
                <span>{sel.area}</span>
                <span>N° {sel.numero}</span>
              </div>
            </div>

            <div className="tp-bloque">
              <span className="tp-et">Costo{sel.unidad ? ` (${unidadTxt(sel)})` : ""}</span>
              <div className="tp-costos">
                {sel.derechos.map((d, i) => {
                  const activo = costoSel === i;
                  const rotulo = d.detalle || (sel.tipo === "tusne" ? "Costo" : "Derecho de tramitación");
                  return cobrable(d) ? (
                    <button key={i} type="button" className={`tp-costo-card${activo ? " activo" : ""}`} aria-pressed={activo} onClick={() => elegirCosto(sel, i)}>
                      <span className="tp-cc-txt">{rotulo}{d.pct ? <small>{d.pct} de la UIT</small> : null}</span>
                      <b>{textoCosto(d)}</b>
                      <span className="tp-cc-marca">{activo ? "✓ En el recibo" : "Usar"}</span>
                    </button>
                  ) : (
                    <div key={i} className="tp-costo-card fijo">
                      <span className="tp-cc-txt">{rotulo}{d.pct ? <small>{d.pct} de la UIT</small> : null}</span>
                      <b className={d.gratuito ? "gratis" : ""}>{textoCosto(d)}</b>
                      <span className="tp-cc-marca">{d.gratuito ? "No se cobra" : "Costo variable: escriba el monto"}</span>
                    </div>
                  );
                })}
              </div>
              {costoSel == null && sel.derechos.filter(cobrable).length > 1 && <p className="tp-pista">Elija el costo que va a cobrar: el monto del recibo se llena con él.</p>}
              {costoSel != null && <p className="tp-aplicado" role="status">✓ Recibo lleno: {NOMBRE_RUBRO[rubroDe(sel)]} · {textoCosto(sel.derechos[costoSel])}. Revíselo antes de emitir.</p>}
            </div>

            {sel.requisitos.length > 0 && (
              <div className="tp-bloque">
                <span className="tp-et">Requisitos que debe presentar ({sel.requisitos.length})</span>
                <ul className="tp-req">
                  {(verTodos ? sel.requisitos : sel.requisitos.slice(0, REQ_VISIBLES)).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                {sel.requisitos.length > REQ_VISIBLES && (
                  <button type="button" className="tp-mas-btn" onClick={() => setVerTodos((v) => !v)}>{verTodos ? "Ver menos" : `Ver los ${sel.requisitos.length} requisitos`}</button>
                )}
              </div>
            )}

            {(sel.plazo || sel.calificacion || sel.autoridad) && (
              <div className="tp-datos">
                {sel.plazo && <span><small>Plazo</small>{sel.plazo} hábiles</span>}
                {sel.calificacion && <span><small>Calificación</small>{sel.calificacion}</span>}
                {sel.autoridad && <span><small>Resuelve</small>{sel.autoridad}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {modelo && <p className="tp-aviso">TUPA modelo{fuente ? ` · ${fuente.replace(/^TUPA 2026 · /, "")}` : ""}. Revise los costos de su municipalidad antes de cobrar.</p>}
    </div>
  );
}
