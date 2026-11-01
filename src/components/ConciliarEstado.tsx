"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import BotonConfirmar from "@/components/BotonConfirmar";
import BotonPdf from "@/components/BotonPdf";
import { aNum, fmt, idsEnlace, igual, r2, sugerir, tipoLinea, type Candidatos, type Enlace, type LineaExtracto, type Sugerencia } from "@/lib/extracto";

export type { LineaExtracto } from "@/lib/extracto";

export type CabeceraExtracto = {
  fecha_corte: string;
  fecha_saldo_anterior: string;
  saldo_anterior: string;
  n_pdf: string;
  cargos_pdf: string;
  abonos_pdf: string;
  saldo_pdf: string;
};

type Col = "codigo" | "cargo" | "abono" | "saldo" | "dia";

const vacia = (): LineaExtracto => ({ codigo: "", cargo: "", abono: "", saldo: "", dia: "", enlace: null });

/** «2250» → «2,250.00» al salir del campo. */
const darFormato = (v: string) => {
  const n = aNum(v);
  return n === null ? v.trim() : fmt(n);
};

/** ISO → «06/02/2025» para mostrar; lo que se escribe se entiende como día, ddmm, ddmmyy o ddmmyyyy. */
const isoAVista = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso);
function vistaAIso(texto: string, ref: string): string {
  const t = texto.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const [ry, rm] = (/^\d{4}-\d{2}/.test(ref) ? ref : "").slice(0, 7).split("-");
  const nums = t.replace(/\D/g, "");
  let d = "", m = ry ? rm : "", y = ry ?? "";
  if (t.includes("/") || t.includes("-")) {
    const partes = t.split(/[/-]/).map((x) => x.replace(/\D/g, ""));
    d = partes[0] ?? "";
    if (partes[1]) m = partes[1];
    if (partes[2]) y = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
  } else if (nums.length <= 2) d = nums;
  else if (nums.length === 4) { d = nums.slice(0, 2); m = nums.slice(2); }
  else if (nums.length === 6) { d = nums.slice(0, 2); m = nums.slice(2, 4); y = `20${nums.slice(4)}`; }
  else if (nums.length === 8) { d = nums.slice(0, 2); m = nums.slice(2, 4); y = nums.slice(4); }
  else return "";
  if (!d || !m || !y) return "";
  const iso = `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const f = new Date(`${iso}T00:00:00`);
  return Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== iso ? "" : iso;
}

/** Pone las barras solas mientras se escribe: «24» → «24/», «2402» → «24/02/», «24021993» → «24/02/1993». */
function autoBarras(raw: string, anterior: string, anio: string): { t: string; auto: boolean } {
  if (/^\d{4}-/.test(raw)) return { t: raw, auto: false };
  const borrando = raw.length < anterior.length;
  let partes: string[];
  if (raw.includes("/") || raw.includes("-")) partes = raw.split(/[/-]/).slice(0, 3).map((p) => p.replace(/\D/g, ""));
  else {
    const d = raw.replace(/\D/g, "").slice(0, 8);
    partes = [d.slice(0, 2)];
    if (d.length > 2) partes.push(d.slice(2, 4));
    if (d.length > 4) partes.push(d.slice(4));
  }
  partes = partes.map((p, i) => p.slice(0, i === 2 ? 4 : 2));
  const out = partes.map((p, i) => (i < partes.length - 1 && p.length === 1 ? `0${p}` : p)).join("/");
  // Con día y mes completos el año sale solo (el del estado de cuenta): queda seleccionado por si hay que cambiarlo
  const diaMesListos = partes.length >= 2 && partes[0].length === 2 && partes[1].length === 2;
  if (!borrando && anio && diaMesListos && (partes.length === 2 || (partes.length === 3 && partes[2] === ""))) return { t: `${partes[0]}/${partes[1]}/${anio}`, auto: true };
  return { t: !borrando && partes.length < 3 && partes[partes.length - 1].length === 2 ? `${out}/` : out, auto: false };
}

/** Campo de fecha que se escribe rápido: «6» → día 6 del mes del estado de cuenta; «0602» → 06/02. */
function CampoDia({ valor, refFecha, onCambio, ...resto }: { valor: string; refFecha: string; onCambio: (iso: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "ref">) {
  const [texto, setTexto] = useState(isoAVista(valor));
  const [editando, setEditando] = useState(false);
  const caja = useRef<HTMLInputElement>(null);
  const selAnio = useRef(false);
  const anioRef = /^\d{4}-\d{2}/.test(refFecha) ? refFecha.slice(0, 4) : "";
  useEffect(() => {
    if (!editando) setTexto(isoAVista(valor));
  }, [valor, editando]);
  useEffect(() => {
    if (selAnio.current && caja.current) {
      caja.current.setSelectionRange(6, 10);
      selAnio.current = false;
    }
  }, [texto]);
  return (
    <input
      {...resto}
      ref={caja}
      value={texto}
      inputMode="numeric"
      placeholder={/^\d{4}-\d{2}/.test(refFecha) ? `dd/${refFecha.slice(5, 7)}/${refFecha.slice(0, 4)}` : "dd/mm/aaaa"}
      onFocus={(e) => { setEditando(true); e.currentTarget.select(); }}
      onChange={(e) => {
        const r = autoBarras(e.target.value, texto, anioRef);
        selAnio.current = r.auto;
        setTexto(r.t);
      }}
      onBlur={() => {
        setEditando(false);
        const iso = texto.trim() === "" ? "" : vistaAIso(texto, refFecha);
        onCambio(iso);
        setTexto(iso ? isoAVista(iso) : texto.trim() === "" ? "" : texto);
      }}
    />
  );
}

const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (per: string) => `${MES_LARGO[Number(per.slice(5, 7)) - 1] ?? per} ${per.slice(0, 4)}`;


/** Ventana para elegir con qué se enlaza un movimiento. */
function Elegir({ abierta, indice, linea, lineas, cands, sug, onElegir, onCerrar }: { abierta: boolean; indice: number; linea: LineaExtracto | null; lineas: LineaExtracto[]; cands: Candidatos; sug: Sugerencia; onElegir: (e: Enlace | null) => void; onCerrar: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [nota, setNota] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [modo, setModo] = useState<"ver" | "elegir">("elegir");
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (abierta && !d.open) {
      setQ("");
      setNota("");
      setSel(linea?.enlace?.tipo === "cp" ? idsEnlace(linea.enlace) : []);
      setModo(linea?.enlace ? "ver" : "elegir");
      d.showModal();
    }
    if (!abierta && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);
  if (!linea) return <dialog ref={dlg} className="cj-dlg" onClose={onCerrar} />;
  const t = tipoLinea(linea);
  const vista = modo === "ver" && !!linea.enlace;
  const cpsVer = linea.enlace?.tipo === "cp" ? (idsEnlace(linea.enlace).map((id) => cands.cps.find((c) => c.id === id)).filter(Boolean) as Candidatos["cps"]) : [];
  const sumaVer = r2(cpsVer.reduce((t0, c) => t0 + c.monto, 0));
  const esAbono = aNum(linea.abono) !== null;
  const monto = (esAbono ? aNum(linea.abono) : aNum(linea.cargo)) ?? 0;
  const usadoPor = (id: string) => lineas.findIndex((l, j) => j !== indice && idsEnlace(l.enlace).includes(id));
  const termino = q.trim().toLowerCase();
  const cps = cands.cps
    .filter((c) => !termino || `${c.codigo} ${c.cheque} ${c.beneficiario} ${c.concepto}`.toLowerCase().includes(termino))
    .sort((a, b) => Number(igual(b.monto, monto)) - Number(igual(a.monto, monto)) || b.fecha.localeCompare(a.fecha))
    .slice(0, 40);
  const etqCp = (id: string) => { const c = cands.cps.find((x) => x.id === id); return c ? `${c.codigo} · ${c.beneficiario}` : ""; };
  const sumaSel = r2(sel.reduce((t, id) => t + (cands.cps.find((x) => x.id === id)?.monto ?? 0), 0));
  const armar = (): Enlace => ({ tipo: "cp", id: sel[0], etiqueta: etqCp(sel[0]), ...(sel.length > 1 ? { extra: sel.slice(1).map((id) => ({ id, etiqueta: etqCp(id) })) } : {}) });
  return (
    <dialog ref={dlg} className="cj-dlg" onClose={onCerrar} onClick={(e) => e.target === dlg.current && onCerrar()}>
      <div className="cj-dlg-cab">
        <div>
          <strong>Enlazar movimiento</strong>
          <span>{linea.codigo || "Sin código"} · {esAbono ? "abono" : "cargo"} de S/ {fmt(monto)}</span>
        </div>
        <button type="button" className="cj-x" onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>
      <div className="cj-dlg-cuerpo">
        {vista && linea.enlace ? (
          <div className="cj-ver">
            <div className="cj-ver-monto">
              <span>{esAbono ? "Abono del banco" : "Cargo del banco"}</span>
              <b>S/ {fmt(monto)}</b>
              <small>{linea.codigo || "Sin código"}{linea.dia ? ` · ${linea.dia.split("-").reverse().join("/")}` : ""}</small>
            </div>
            <h4>Está enlazado con</h4>
            {cpsVer.length > 0 ? (
              <ul className="cj-ver-lista">
                {cpsVer.map((c) => (
                  <li key={c.id}>
                    <div><b>{c.codigo}</b><span>{c.beneficiario}</span><small>{c.concepto}</small></div>
                    <em>S/ {fmt(c.monto)}</em>
                  </li>
                ))}
                {cpsVer.length > 1 && <li className="tot"><div><b>Suman</b></div><em>S/ {fmt(sumaVer)}</em></li>}
              </ul>
            ) : (
              <ul className="cj-ver-lista">
                <li><div><b>{[linea.enlace.etiqueta, ...(linea.enlace.extra ?? []).map((x) => x.etiqueta)].join(" + ")}</b></div></li>
              </ul>
            )}
            {cpsVer.length > 0 && (igual(sumaVer, monto)
              ? <div className="cj-veredicto-v ok">✓ Cuadra con el banco</div>
              : <div className="cj-veredicto-v falta">⚠ {monto > sumaVer ? `Faltan S/ ${fmt(r2(monto - sumaVer))} por enlazar` : `Sobran S/ ${fmt(r2(sumaVer - monto))}`}: el banco cobró S/ {fmt(monto)}</div>)}
          </div>
        ) : (
        <>
        {sug && !linea.enlace && (
          <div className="cj-sug-banner">
            <div>
              <span>Sugerido</span>
              <b>{[sug.enlace.etiqueta, ...(sug.enlace.extra ?? []).map((x) => x.etiqueta)].join(" + ")}</b>
              {sug.aviso && <small>{sug.aviso}</small>}
            </div>
            <button type="button" className="btn primario" onClick={() => onElegir(sug.enlace)}>Aceptar</button>
          </div>
        )}
        {!esAbono ? (
          <>
            <input className="cj-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por N° de cheque, beneficiario o concepto…" autoFocus />
            <div className="cj-opciones">
              {cps.length === 0 && <p className="tenue">No hay comprobantes de pago con cheque que coincidan.</p>}
              {cps.map((c) => {
                const otra = usadoPor(c.id);
                const marcado = sel.includes(c.id);
                return (
                  <button key={c.id} type="button" className={`cj-op${igual(c.monto, monto) ? " igual" : ""}${marcado ? " marcado" : ""}`} disabled={otra >= 0} onClick={() => setSel((x) => (x.includes(c.id) ? x.filter((i) => i !== c.id) : [...x, c.id]))}>
                    <span className="cj-op-t"><i className="cj-caja" aria-hidden="true">{marcado ? "✓" : ""}</i><b>{c.codigo}</b> · Cheque {c.cheque}{igual(c.monto, monto) && <i className="cj-ok">coincide</i>}{otra >= 0 && <i className="cj-ya">ya enlazado en la línea {otra + 1}</i>}</span>
                    <span className="cj-op-d">{c.beneficiario} · {c.concepto}</span>
                    <span className="cj-op-m">S/ {fmt(c.monto)}</span>
                  </button>
                );
              })}
            </div>
            <div className={`cj-suma${sel.length === 0 ? "" : igual(sumaSel, monto) ? " cuadra" : " falta"}`}>
              <span>
                {sel.length === 0
                  ? "Marque uno o varios comprobantes. Si un cheque pagó varios expedientes, marque todos."
                  : igual(sumaSel, monto)
                    ? `✓ ${sel.length} comprobante(s) suman S/ ${fmt(sumaSel)}: cuadra con el banco`
                    : sumaSel < monto
                      ? `${sel.length} comprobante(s) suman S/ ${fmt(sumaSel)} · faltan S/ ${fmt(r2(monto - sumaSel))} para S/ ${fmt(monto)}`
                      : `${sel.length} comprobante(s) suman S/ ${fmt(sumaSel)} · sobran S/ ${fmt(r2(sumaSel - monto))}`}
              </span>
              <button type="button" className="btn chico primario" disabled={sel.length === 0} onClick={() => onElegir(armar())}>Enlazar {sel.length || ""}</button>
            </div>
            <div className="cj-otros">
              <button type="button" className="cj-op chico" onClick={() => onElegir({ tipo: "banco", etiqueta: t === "itf" ? "Impuesto a las transacciones (ITF)" : "Gasto del banco (comisión, mantenimiento)" })}>Es un gasto del banco (ITF, comisión, mantenimiento)</button>
            </div>
          </>
        ) : (
          <>
            <h4>Transferencias registradas</h4>
            <div className="cj-opciones">
              {cands.transferencias.length === 0 && <p className="tenue">Aún no hay transferencias registradas. Regístrelas en Contabilidad → Datos contables.</p>}
              {cands.transferencias.map((x) => {
                const otra = usadoPor(x.id);
                return (
                  <button key={x.id} type="button" className={`cj-op${igual(x.monto, monto) ? " igual" : ""}`} disabled={otra >= 0} onClick={() => onElegir({ tipo: "transferencia", id: x.id, etiqueta: `Transferencia de ${x.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")} · ${x.periodo}` })}>
                    <span className="cj-op-t"><b>{x.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")}</b> · {nombreMes(x.periodo)}{igual(x.monto, monto) && <i className="cj-ok">coincide</i>}{otra >= 0 && <i className="cj-ya">ya enlazada</i>}</span>
                    <span className="cj-op-d">{x.documento || "Sin documento"}</span>
                    <span className="cj-op-m">S/ {fmt(x.monto)}</span>
                  </button>
                );
              })}
            </div>
            <h4>Depósito de ingresos propios</h4>
            <div className="cj-opciones">
              {cands.ingresos.filter((x) => x.n > 0).length === 0 && <p className="tenue">No hay recibos de ingresos propios emitidos.</p>}
              {cands.ingresos.filter((x) => x.n > 0).map((x) => (
                <button key={x.periodo} type="button" className={`cj-op${igual(x.total, monto) ? " igual" : ""}`} onClick={() => onElegir({ tipo: "ingresos", periodo: x.periodo, etiqueta: `Depósito de ingresos propios de ${nombreMes(x.periodo)}` })}>
                  <span className="cj-op-t"><b>Recibos de {nombreMes(x.periodo)}</b>{igual(x.total, monto) && <i className="cj-ok">coincide</i>}</span>
                  <span className="cj-op-d">{x.n} recibo(s) emitido(s)</span>
                  <span className="cj-op-m">S/ {fmt(x.total)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="cj-nota">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Otro motivo (escríbalo) y pulse «Enlazar como otro»" />
          <button type="button" className="btn contorno" disabled={nota.trim().length < 4} onClick={() => onElegir({ tipo: "otro", etiqueta: nota.trim().toUpperCase() })}>Enlazar como otro</button>
        </div>
        </>
        )}
      </div>
      <div className="cj-dlg-pie">
        {linea.enlace && <button type="button" className="btn contorno rojo" onClick={() => onElegir(null)}>Quitar el enlace</button>}
        <span className="espacio" />
        {linea.enlace && vista && <button type="button" className="btn primario" onClick={() => setModo("elegir")}>{cpsVer.length > 0 && !igual(sumaVer, monto) ? "Agregar el que falta" : "Cambiar enlace"}</button>}
        {linea.enlace && !vista && <button type="button" className="btn" onClick={() => setModo("ver")}>← Volver al detalle</button>}
        <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
      </div>
    </dialog>
  );
}

/**
 * Pantalla de trabajo del estado de cuenta: paso 1, copiarlo igual que el original (con sumas que avisan si cuadra);
 * paso 2, enlazar cada cheque, transferencia o depósito con lo registrado en Zebaz.
 */
export default function ConciliarEstado({
  periodo,
  cabInicial,
  lineasInicial,
  candidatos,
  puede,
  guardar,
  autoguardar,
  info,
}: {
  periodo: string;
  cabInicial: CabeceraExtracto;
  lineasInicial: LineaExtracto[];
  candidatos: Candidatos;
  puede: boolean;
  guardar: (fd: FormData) => Promise<void>;
  autoguardar: (periodo: string, datos: string) => Promise<{ ok: boolean; hora?: string; error?: string }>;
  info: { mcp: string; banco: string; cuenta: string; mes: string };
}) {
  const clave = `sebaz-extracto-${periodo}`;
  const [cab, setCab] = useState<CabeceraExtracto>(cabInicial);
  const [lineas, setLineas] = useState<LineaExtracto[]>(lineasInicial.length ? lineasInicial : [vacia()]);
  const [borradorLocal, setBorradorLocal] = useState(false);
  const [eligiendo, setEligiendo] = useState<number | null>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const tocado = useRef(false);
  const [sucio, setSucio] = useState(false);
  const [auto, setAuto] = useState<"" | "guardando" | "ok" | "error">("");
  const [horaAuto, setHoraAuto] = useState("");
  const ultimo = useRef("");
  const enVuelo = useRef(false);
  const instantanea = useRef("");

  // Si se cierra la ventana a medias, lo escrito se recupera (solo en este equipo, hasta guardar)
  useEffect(() => {
    if (lineasInicial.length > 0) return;
    try {
      const g = localStorage.getItem(clave);
      if (g) {
        const d = JSON.parse(g) as { cab: CabeceraExtracto; lineas: LineaExtracto[] };
        if (d.lineas?.length) {
          setCab(d.cab);
          setLineas(d.lineas);
          setBorradorLocal(true);
        }
      }
    } catch {
      /* sin borrador */
    }
  }, [clave, lineasInicial.length]);
  useEffect(() => {
    if (!tocado.current) return;
    setSucio(true);
    try {
      localStorage.setItem(clave, JSON.stringify({ cab, lineas }));
    } catch {
      /* sin espacio */
    }
  }, [cab, lineas, clave]);

  // Autoguardado en el servidor: el avance no se pierde al cerrar ni al apagar, y se sigue otro día
  instantanea.current = JSON.stringify({ cab, lineas });
  async function enviarAvance() {
    if (!puede || enVuelo.current) return;
    const que = instantanea.current;
    if (que === ultimo.current) return;
    enVuelo.current = true;
    setAuto("guardando");
    const r = await autoguardar(periodo, que).catch(() => ({ ok: false as const }));
    enVuelo.current = false;
    if (r.ok) {
      ultimo.current = que;
      setHoraAuto(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
      setAuto("ok");
      if (instantanea.current !== que) void enviarAvance();
    } else {
      setAuto("error");
    }
  }
  useEffect(() => {
    if (!tocado.current) return;
    const t = setTimeout(() => void enviarAvance(), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cab, lineas]);
  useEffect(() => {
    const alSalir = () => {
      if (document.visibilityState === "hidden" && tocado.current) void enviarAvance();
    };
    document.addEventListener("visibilitychange", alSalir);
    window.addEventListener("pagehide", alSalir);
    return () => {
      document.removeEventListener("visibilitychange", alSalir);
      window.removeEventListener("pagehide", alSalir);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Año y mes de referencia: el de la última fecha anotada; si no hay, el del estado de cuenta
  const ultimaDia = [...lineas].reverse().find((l) => l.dia)?.dia ?? "";
  const refFecha = ultimaDia || cab.fecha_corte || cab.fecha_saldo_anterior || `${periodo}-01`;

  function ponCab(k: keyof CabeceraExtracto, v: string) {
    tocado.current = true;
    setCab((c) => ({ ...c, [k]: v }));
  }
  function ponLinea(i: number, k: Col, v: string) {
    tocado.current = true;
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: k === "codigo" ? v.toUpperCase() : v } : l)));
  }
  function ponEnlace(i: number, e: Enlace | null) {
    tocado.current = true;
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, enlace: e } : l)));
  }
  function foco(fila: number, col: Col) {
    setTimeout(() => {
      cuerpo.current?.querySelector<HTMLInputElement>(`input[data-r="${fila}"][data-c="${col}"]`)?.focus();
    }, 0);
  }
  function agregar(codigo = "", foca: Col = "codigo") {
    tocado.current = true;
    const ultima = lineas[lineas.length - 1];
    const enBlanco = !!ultima && !ultima.codigo && !ultima.cargo && !ultima.abono && !ultima.saldo;
    const destino = enBlanco ? lineas.length - 1 : lineas.length;
    setLineas((ls) => {
      const previa = ls[ls.length - 1];
      if (enBlanco) {
        const copia = [...ls];
        copia[copia.length - 1] = { ...previa, codigo };
        return copia;
      }
      return [...ls, { ...vacia(), codigo, dia: previa?.dia ?? "" }];
    });
    foco(destino, foca);
  }
  function quitar(i: number) {
    tocado.current = true;
    setLineas((ls) => (ls.length === 1 ? [vacia()] : ls.filter((_, j) => j !== i)));
  }
  function mover(e: React.KeyboardEvent<HTMLInputElement>, fila: number, col: Col) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (fila === lineas.length - 1) {
        if (e.key === "ArrowDown") return;
        tocado.current = true;
        setLineas((ls) => [...ls, { ...vacia(), dia: ls[ls.length - 1]?.dia ?? "" }]);
      }
      foco(fila + 1, col);
    } else if (e.key === "ArrowUp" && fila > 0) {
      e.preventDefault();
      foco(fila - 1, col);
    }
  }

  const calculo = useMemo(() => {
    const sa = aNum(cab.saldo_anterior);
    let corrida = sa;
    let totalCargos = 0;
    let totalAbonos = 0;
    let n = 0;
    const filas = lineas.map((l) => {
      const c = aNum(l.cargo);
      const a = aNum(l.abono);
      const s = aNum(l.saldo);
      if (c !== null || a !== null || l.codigo.trim() !== "") n += 1;
      totalCargos += c ?? 0;
      totalAbonos += a ?? 0;
      if (corrida !== null) corrida = r2(corrida - (c ?? 0) + (a ?? 0));
      const estado: "ok" | "mal" | null = s === null || corrida === null ? null : igual(s, corrida) ? "ok" : "mal";
      return { corrida, estado };
    });
    totalCargos = r2(totalCargos);
    totalAbonos = r2(totalAbonos);
    const saldoFinal = sa === null ? null : r2(sa - totalCargos + totalAbonos);
    return { filas, totalCargos, totalAbonos, saldoFinal, n };
  }, [cab.saldo_anterior, lineas]);

  const cPdf = aNum(cab.cargos_pdf);
  const aPdf = aNum(cab.abonos_pdf);
  const sPdf = aNum(cab.saldo_pdf);
  const nPdf = aNum(cab.n_pdf);
  const checks = [
    { clave: "n", t: "Movimientos", pdf: nPdf, sist: calculo.n, f: (x: number) => String(x) },
    { clave: "c", t: "Total cargos", pdf: cPdf, sist: calculo.totalCargos, f: fmt },
    { clave: "a", t: "Total abonos", pdf: aPdf, sist: calculo.totalAbonos, f: fmt },
    { clave: "s", t: "Saldo actual", pdf: sPdf, sist: calculo.saldoFinal, f: fmt },
  ];
  const conDato = checks.filter((c) => c.pdf !== null && c.sist !== null);
  const todoCuadra = conDato.length === checks.length && conDato.every((c) => igual(c.pdf!, c.sist!));
  const malas = calculo.filas.filter((f) => f.estado === "mal").length;
  const cuadra = todoCuadra && malas === 0;
  /** Qué total del original todavía no coincide con lo anotado (para decirlo claro). */
  const faltas = checks
    .filter((c) => c.pdf !== null && c.sist !== null && !igual(c.pdf, c.sist))
    .map((c) => {
      const d = r2(c.pdf! - c.sist!);
      return { t: c.t, txt: c.clave === "s" ? `difiere en S/ ${fmt(Math.abs(d))}` : `${d > 0 ? "faltan" : "sobran"} ${c.f(Math.abs(d))}`, falta: d > 0 };
    });

  // Enlaces
  const activas = lineas.map((l, i) => ({ l, i, tipo: tipoLinea(l) })).filter((x) => x.tipo !== "vacia");
  /** Diferencia que falta enlazar (cheque cuyos comprobantes no suman lo que cobró el banco); null si está completo. */
  const faltaDe = (l: LineaExtracto): number | null => {
    if (l.enlace?.tipo !== "cp") return null;
    const cargo = aNum(l.cargo);
    if (cargo === null) return null;
    const suma = r2(idsEnlace(l.enlace).reduce((t, id) => t + (candidatos.cps.find((c) => c.id === id)?.monto ?? 0), 0));
    return igual(suma, cargo) ? null : r2(cargo - suma);
  };
  const enlazadas = activas.filter((x) => x.l.enlace && faltaDe(x.l) === null).length;
  const pctEnlace = activas.length ? Math.round((enlazadas / activas.length) * 100) : 0;
  const usados = useMemo(() => new Set(lineas.flatMap((l) => idsEnlace(l.enlace))), [lineas]);
  const infoCp = useMemo(() => new Map(candidatos.cps.map((c) => [c.id, c])), [candidatos.cps]);

  function enlazarAutomatico() {
    tocado.current = true;
    setLineas((ls) => {
      const ocupados = new Set(ls.flatMap((l) => idsEnlace(l.enlace)));
      return ls.map((l) => {
        if (l.enlace || tipoLinea(l) === "vacia") return l;
        const s = sugerir(l, candidatos, ocupados);
        if (!s) return l;
        idsEnlace(s.enlace).forEach((x) => ocupados.add(x));
        return { ...l, enlace: s.enlace };
      });
    });
  }

  const datos = JSON.stringify({ cab, lineas });
  const lineaElegida = eligiendo !== null ? lineas[eligiendo] ?? null : null;

  return (
    <form
      action={async (fd) => {
        try {
          localStorage.removeItem(clave);
        } catch {
          /* nada */
        }
        await guardar(fd);
      }}
      className="cj"
    >
      <input type="hidden" name="periodo" value={periodo} />
      <input type="hidden" name="datos" value={datos} />

      <header className="cj-resumen" role="status">
        <div className={`cj-sello ${cuadra ? "ok" : ""}`}>
          <b>{cuadra ? "✓ Cuadra con el estado de cuenta" : "Aún no cuadra con el original"}</b>
          {!cuadra && (faltas.length > 0 || malas > 0) && (
            <span className="cj-faltas">
              {faltas.map((f) => <i key={f.t}>{f.t}: {f.txt}</i>)}
              {malas > 0 && <i className="rojo">{malas} saldo(s) del día no coinciden</i>}
            </span>
          )}
          <span>
            {calculo.n} movimiento(s) · cargos S/ {fmt(calculo.totalCargos)} · abonos S/ {fmt(calculo.totalAbonos)}
            {calculo.saldoFinal !== null && <> · saldo S/ {fmt(calculo.saldoFinal)}</>}
          </span>
        </div>
        <div className="cj-avance">
          <span>Enlazados <b>{enlazadas}</b> de {activas.length}</span>
          <div className="cj-barra" aria-hidden="true"><div style={{ width: `${pctEnlace}%` }} /></div>
        </div>
      </header>

      {(sucio || borradorLocal) && (
        <div className={`cj-singuardar${auto === "ok" ? " ok" : ""}`} role="status">
          {auto === "ok" ? (
            <>
              <b>✓ Avance guardado solo · {horaAuto}</b>
              <span>Puede cerrar y seguir otro día: no se pierde. Al terminar pulse <b>Guardar</b> para marcar los cheques como cobrados.</span>
            </>
          ) : auto === "guardando" ? (
            <>
              <b>Guardando su avance…</b>
              <span>No cierre todavía.</span>
            </>
          ) : auto === "error" ? (
            <>
              <b>⚠ No se pudo guardar el avance solo</b>
              <span>Pulse <b>Guardar</b> para no perder lo escrito.</span>
            </>
          ) : (
            <>
              <b>● Cambios sin guardar</b>
              <span>{borradorLocal && !sucio ? "Se recuperó lo escrito en este equipo. " : ""}Se guardan solos en unos segundos.</span>
            </>
          )}
        </div>
      )}

      <div className="cj-paso">
        <details className="cj-guia">
          <summary>Escriba cada línea como está en el original <span>· ver atajos</span></summary>
          <p>En la columna <b>Enlace</b>, pulse el círculo de cada línea para ver con qué está enlazada o para enlazarla: <b>✓</b> cuadra, <b>!</b> falta algo, <b>+</b> sin enlazar. <kbd>Tab</kbd> pasa a la siguiente casilla y <kbd>Enter</kbd> baja a la línea de abajo. En «Día» las barras salen solas: <kbd>6</kbd> = día 6 del mes, <kbd>0602</kbd> = 06/02.</p>
        </details>

        <label className="cj-corte">
          Estado de cuenta al
          <CampoDia valor={cab.fecha_corte} refFecha={refFecha} onCambio={(v) => ponCab("fecha_corte", v)} disabled={!puede} />
        </label>

        <div className="cj-herr">
          {puede && <button type="button" className="btn primario" onClick={enlazarAutomatico}>✨ Enlazar automático</button>}
          <span className="espacio" />
          <BotonPdf nombre={`Estado de cuenta ${info.mes} conciliado`} selector=".cj-pdf-hoja" texto="⬇ Descargar PDF" className="btn contorno" horizontal />
        </div>

        <div className="te-tabla-marco">
          <table className="te-tabla">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Codificación<br />N° cheque</th>
                <th>Cargos</th>
                <th>Abonos</th>
                <th>Saldos</th>
                <th>Día</th>
                <th title="Lo que va la cuenta hasta esta línea">Va en</th>
                <th title="Enlace con lo registrado">Enlace</th>
                <th aria-label="Quitar" />
              </tr>
            </thead>
            <tbody>
              <tr className="te-previo">
                <td className="n">·</td>
                <td className="te-fijo">SALDO ANTERIOR</td>
                <td />
                <td>
                  <CampoDia valor={cab.fecha_saldo_anterior} refFecha={refFecha} onCambio={(v) => ponCab("fecha_saldo_anterior", v)} disabled={!puede} aria-label="Fecha del saldo anterior" />
                </td>
                <td>
                  <input className="m" inputMode="decimal" value={cab.saldo_anterior} disabled={!puede} onChange={(e) => ponCab("saldo_anterior", e.target.value)} onBlur={(e) => ponCab("saldo_anterior", darFormato(e.target.value))} placeholder="4,835.19" aria-label="Saldo anterior" />
                </td>
                <td />
                <td className="te-va" />
                <td />
                <td />
              </tr>
            </tbody>
            <tbody ref={cuerpo}>
              {lineas.map((l, i) => {
                const f = calculo.filas[i];
                const comunes = (col: Col) => ({ "data-r": i, "data-c": col, disabled: !puede, onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => mover(e, i, col) });
                return (
                  <Fragment key={i}>
                  <tr className={f.estado === "mal" ? "mal" : undefined}>
                    <td className="n">{i + 1}</td>
                    <td><input {...comunes("codigo")} value={l.codigo} onChange={(e) => ponLinea(i, "codigo", e.target.value)} placeholder="86106449 · IMPT/ITF · TI 1721" aria-label={`Línea ${i + 1}: codificación`} /></td>
                    <td><input {...comunes("cargo")} className="m" inputMode="decimal" value={l.cargo} onChange={(e) => ponLinea(i, "cargo", e.target.value)} onBlur={(e) => ponLinea(i, "cargo", darFormato(e.target.value))} aria-label={`Línea ${i + 1}: cargo`} /></td>
                    <td><input {...comunes("abono")} className="m" inputMode="decimal" value={l.abono} onChange={(e) => ponLinea(i, "abono", e.target.value)} onBlur={(e) => ponLinea(i, "abono", darFormato(e.target.value))} aria-label={`Línea ${i + 1}: abono`} /></td>
                    <td><input {...comunes("saldo")} className="m" inputMode="decimal" value={l.saldo} onChange={(e) => ponLinea(i, "saldo", e.target.value)} onBlur={(e) => ponLinea(i, "saldo", darFormato(e.target.value))} aria-label={`Línea ${i + 1}: saldo`} /></td>
                    <td><CampoDia {...comunes("dia")} valor={l.dia} refFecha={refFecha} onCambio={(v) => ponLinea(i, "dia", v)} aria-label={`Línea ${i + 1}: día`} /></td>
                    <td className={`te-va${f.estado === "ok" ? " ok" : f.estado === "mal" ? " mal" : ""}`} title={f.estado === "mal" ? `El saldo del banco no coincide: debería ser ${f.corrida !== null ? fmt(f.corrida) : "—"}` : f.estado === "ok" ? "El saldo coincide con lo que va la cuenta" : undefined}>
                      {f.estado === "ok" && <i>✓</i>}{f.estado === "mal" && <i>✗</i>}{f.corrida !== null ? fmt(f.corrida) : ""}
                    </td>
                    <td className="te-enl">
                      {tipoLinea(l) !== "vacia" && (() => {
                        const falta = faltaDe(l);
                        const clase = !l.enlace ? "pend" : falta !== null ? "falta" : "ok";
                        const titulo = !l.enlace ? "Sin enlazar: pulse para enlazar" : falta !== null ? `Falta S/ ${fmt(Math.abs(falta))} por enlazar: pulse para ver` : "Enlazado y cuadra: pulse para ver con qué";
                        return (
                          <button type="button" className={`te-chip ${clase}`} onClick={() => setEligiendo(i)} title={titulo} aria-label={titulo}>
                            {clase === "ok" ? "✓" : clase === "falta" ? "!" : "+"}
                          </button>
                        );
                      })()}
                    </td>
                    <td>{puede && <button type="button" className="te-quitar" onClick={() => quitar(i)} aria-label={`Quitar la línea ${i + 1}`}>×</button>}</td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9}>
                  {puede && (
                    <div className="cj-atajos">
                      <button type="button" className="mas" onClick={() => agregar()}>+ Agregar línea</button>
                      <span>Rápido:</span>
                      <button type="button" className="q-cheque" onClick={() => agregar("", "codigo")}>Cheque</button>
                      <button type="button" className="q-itf" onClick={() => agregar("IMPT/ITF", "cargo")}>IMPT/ITF</button>
                      <button type="button" className="q-mant" onClick={() => agregar("MANUTEN.", "cargo")}>MANUTEN.</button>
                      <button type="button" className="q-ti" onClick={() => agregar("TI ", "abono")}>TI (abono)</button>
                    </div>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <section className="cj-totales" aria-label="Totales del estado de cuenta">
          <h3>Fila de totales del original <small>(al pie del estado de cuenta)</small></h3>
          <div className="cj-totales-rej">
            {[
              { k: "n_pdf" as const, t: "Movimientos", ph: "20", i: 0, num: false },
              { k: "cargos_pdf" as const, t: "Total cargos", ph: "14,282.60", i: 1, num: true },
              { k: "abonos_pdf" as const, t: "Total abonos", ph: "14,160.00", i: 2, num: true },
              { k: "saldo_pdf" as const, t: "Saldo actual", ph: "4,712.59", i: 3, num: true },
            ].map((c) => {
              const ch = checks[c.i];
              const ok = ch.pdf !== null && ch.sist !== null && igual(ch.pdf, ch.sist);
              const sin = ch.pdf === null || ch.sist === null;
              return (
                <div key={c.k} className={`cj-total ${sin ? "" : ok ? "ok" : "mal"}`}>
                  <label>
                    {c.t}
                    <input inputMode={c.num ? "decimal" : "numeric"} value={cab[c.k]} onChange={(e) => ponCab(c.k, e.target.value)} onBlur={(e) => c.num && ponCab(c.k, darFormato(e.target.value))} disabled={!puede} placeholder={c.ph} />
                  </label>
                  <div className="cj-total-suma">
                    <span>Suma de Zebaz</span>
                    <b>{ch.sist === null ? "—" : ch.f(ch.sist)}</b>
                    <small>{sin ? "Escriba el total del original" : ok ? "✓ Cuadra" : `Diferencia ${fmt(Math.abs(ch.sist! - ch.pdf!))}`}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>

      {puede && (
        <div className="cj-pie">
          <span>Al guardar, los cheques enlazados quedan marcados como cobrados en la conciliación.</span>
          <BotonConfirmar className="btn primario grande" pregunta="¿Guardar el estado de cuenta?" detalle="Se guardan las líneas, los totales y los enlaces. Los cheques enlazados con fecha se marcan como cobrados." textoConfirmar="Sí, guardar">
            Guardar
          </BotonConfirmar>
        </div>
      )}

      {/* Hoja para el PDF: cada movimiento con lo que es (fuera de pantalla) */}
      <div className="cj-pdf" aria-hidden="true">
        <div className="cj-pdf-hoja">
          <h2>{info.mcp}</h2>
          <p>Estado de cuenta corriente · {info.banco}{info.cuenta ? ` · cuenta ${info.cuenta}` : ""} · {info.mes}</p>
          <table>
            <thead>
              <tr><th>N°</th><th>Día</th><th>Codificación</th><th>Cargos</th><th>Abonos</th><th>Saldos</th><th>Qué es este movimiento</th></tr>
            </thead>
            <tbody>
              <tr><td>·</td><td>{isoAVista(cab.fecha_saldo_anterior)}</td><td><b>SALDO ANTERIOR</b></td><td /><td /><td className="m">{cab.saldo_anterior}</td><td /></tr>
              {lineas.map((l, i) => {
                if (tipoLinea(l) === "vacia") return null;
                const cpsL = l.enlace?.tipo === "cp" ? (idsEnlace(l.enlace).map((id) => infoCp.get(id)).filter(Boolean) as Candidatos["cps"]) : [];
                const falta = faltaDe(l);
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{isoAVista(l.dia)}</td>
                    <td>{l.codigo}</td>
                    <td className="m">{l.cargo}</td>
                    <td className="m">{l.abono}</td>
                    <td className="m">{l.saldo}</td>
                    <td>
                      {l.enlace ? (
                        cpsL.length > 0 ? (
                          <>
                            {cpsL.map((c) => <div key={c.id}>{c.codigo} · {c.beneficiario}{c.concepto ? ` · ${c.concepto}` : ""} (S/ {fmt(c.monto)})</div>)}
                            <small>{falta === null ? "Cuadra con el banco" : `Faltan S/ ${fmt(Math.abs(falta))} por enlazar`}</small>
                          </>
                        ) : (
                          <div>{[l.enlace.etiqueta, ...(l.enlace.extra ?? []).map((x) => x.etiqueta)].join(" + ")}</div>
                        )
                      ) : (
                        <small>Sin enlazar</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="cj-pdf-pie">
            Total del original: {cab.n_pdf} movimientos · cargos S/ {cab.cargos_pdf} · abonos S/ {cab.abonos_pdf} · saldo actual S/ {cab.saldo_pdf}.{" "}
            Anotado en Zebaz: {calculo.n} movimientos · cargos S/ {fmt(calculo.totalCargos)} · abonos S/ {fmt(calculo.totalAbonos)}.
          </p>
        </div>
      </div>

      <Elegir
        abierta={eligiendo !== null}
        indice={eligiendo ?? 0}
        linea={lineaElegida}
        lineas={lineas}
        cands={candidatos}
        sug={lineaElegida && !lineaElegida.enlace ? sugerir(lineaElegida, candidatos, usados) : null}
        onCerrar={() => setEligiendo(null)}
        onElegir={(e) => {
          if (eligiendo !== null) ponEnlace(eligiendo, e);
          setEligiendo(null);
        }}
      />
    </form>
  );
}
