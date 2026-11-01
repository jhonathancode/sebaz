"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BotonConfirmar from "@/components/BotonConfirmar";
import { aNum, fmt, igual, r2, sugerir, tipoLinea, type Candidatos, type Enlace, type LineaExtracto } from "@/lib/extracto";

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

/** Campo de fecha que se escribe rápido: «6» → día 6 del mes del estado de cuenta; «0602» → 06/02. */
function CampoDia({ valor, refFecha, onCambio, ...resto }: { valor: string; refFecha: string; onCambio: (iso: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "ref">) {
  const [texto, setTexto] = useState(isoAVista(valor));
  const [editando, setEditando] = useState(false);
  useEffect(() => {
    if (!editando) setTexto(isoAVista(valor));
  }, [valor, editando]);
  return (
    <input
      {...resto}
      value={texto}
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      onFocus={(e) => { setEditando(true); e.currentTarget.select(); }}
      onChange={(e) => setTexto(e.target.value)}
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
const diaCorto = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

const ETIQUETA_TIPO: Record<string, string> = {
  cheque: "Cheque cobrado",
  itf: "Impuesto ITF",
  comision: "Mantenimiento / comisión",
  transferencia: "Transferencia recibida",
  abono: "Abono",
  cargo: "Cargo",
};

/** Ventana para elegir con qué se enlaza un movimiento. */
function Elegir({ abierta, indice, linea, lineas, cands, onElegir, onCerrar }: { abierta: boolean; indice: number; linea: LineaExtracto | null; lineas: LineaExtracto[]; cands: Candidatos; onElegir: (e: Enlace | null) => void; onCerrar: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [nota, setNota] = useState("");
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (abierta && !d.open) {
      setQ("");
      setNota("");
      d.showModal();
    }
    if (!abierta && d.open) d.close();
  }, [abierta]);
  if (!linea) return <dialog ref={dlg} className="cj-dlg" onClose={onCerrar} />;
  const t = tipoLinea(linea);
  const esAbono = aNum(linea.abono) !== null;
  const monto = (esAbono ? aNum(linea.abono) : aNum(linea.cargo)) ?? 0;
  const usadoPor = (id: string) => lineas.findIndex((l, j) => j !== indice && l.enlace?.id === id);
  const termino = q.trim().toLowerCase();
  const cps = cands.cps
    .filter((c) => !termino || `${c.codigo} ${c.cheque} ${c.beneficiario} ${c.concepto}`.toLowerCase().includes(termino))
    .sort((a, b) => Number(igual(b.monto, monto)) - Number(igual(a.monto, monto)) || b.fecha.localeCompare(a.fecha))
    .slice(0, 40);
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
        {!esAbono ? (
          <>
            <input className="cj-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por N° de cheque, beneficiario o concepto…" autoFocus />
            <div className="cj-opciones">
              {cps.length === 0 && <p className="tenue">No hay comprobantes de pago con cheque que coincidan.</p>}
              {cps.map((c) => {
                const otra = usadoPor(c.id);
                return (
                  <button key={c.id} type="button" className={`cj-op${igual(c.monto, monto) ? " igual" : ""}`} disabled={otra >= 0} onClick={() => onElegir({ tipo: "cp", id: c.id, etiqueta: `${c.codigo} · ${c.beneficiario}` })}>
                    <span className="cj-op-t"><b>{c.codigo}</b> · Cheque {c.cheque}{igual(c.monto, monto) && <i className="cj-ok">monto igual</i>}{otra >= 0 && <i className="cj-ya">ya enlazado en la línea {otra + 1}</i>}</span>
                    <span className="cj-op-d">{c.beneficiario} · {c.concepto}</span>
                    <span className="cj-op-m">S/ {fmt(c.monto)}</span>
                  </button>
                );
              })}
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
                    <span className="cj-op-t"><b>{x.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")}</b> · {nombreMes(x.periodo)}{igual(x.monto, monto) && <i className="cj-ok">monto igual</i>}{otra >= 0 && <i className="cj-ya">ya enlazada</i>}</span>
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
                  <span className="cj-op-t"><b>Recibos de {nombreMes(x.periodo)}</b>{igual(x.total, monto) && <i className="cj-ok">monto igual</i>}</span>
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
      </div>
      <div className="cj-dlg-pie">
        {linea.enlace && <button type="button" className="btn contorno" onClick={() => onElegir(null)}>Quitar el enlace</button>}
        <span className="espacio" />
        <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
      </div>
    </dialog>
  );
}

/**
 * Pantalla de trabajo del estado de cuenta: paso 1, copiarlo igual que el original (con sumas que avisan si cuadra);
 * paso 2, enlazar cada cheque, transferencia o depósito con lo registrado en Sebaz.
 */
export default function ConciliarEstado({
  periodo,
  cabInicial,
  lineasInicial,
  candidatos,
  puede,
  guardar,
}: {
  periodo: string;
  cabInicial: CabeceraExtracto;
  lineasInicial: LineaExtracto[];
  candidatos: Candidatos;
  puede: boolean;
  guardar: (fd: FormData) => Promise<void>;
}) {
  const clave = `sebaz-extracto-${periodo}`;
  const [paso, setPaso] = useState<"copiar" | "enlazar">("copiar");
  const [cab, setCab] = useState<CabeceraExtracto>(cabInicial);
  const [lineas, setLineas] = useState<LineaExtracto[]>(lineasInicial.length ? lineasInicial : [vacia()]);
  const [borradorLocal, setBorradorLocal] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [eligiendo, setEligiendo] = useState<number | null>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const tocado = useRef(false);

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
    try {
      localStorage.setItem(clave, JSON.stringify({ cab, lineas }));
    } catch {
      /* sin espacio */
    }
  }, [cab, lineas, clave]);

  const refFecha = cab.fecha_corte || cab.fecha_saldo_anterior || `${periodo}-01`;

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

  // Enlaces
  const activas = lineas.map((l, i) => ({ l, i, tipo: tipoLinea(l) })).filter((x) => x.tipo !== "vacia");
  const enlazadas = activas.filter((x) => x.l.enlace).length;
  const pctEnlace = activas.length ? Math.round((enlazadas / activas.length) * 100) : 0;
  const usados = useMemo(() => new Set(lineas.map((l) => l.enlace?.id).filter(Boolean) as string[]), [lineas]);
  const infoCp = useMemo(() => new Map(candidatos.cps.map((c) => [c.id, c])), [candidatos.cps]);

  function enlazarAutomatico() {
    tocado.current = true;
    setLineas((ls) => {
      const ocupados = new Set(ls.map((l) => l.enlace?.id).filter(Boolean) as string[]);
      return ls.map((l) => {
        if (l.enlace || tipoLinea(l) === "vacia") return l;
        const s = sugerir(l, candidatos, ocupados);
        if (!s) return l;
        if (s.enlace.id) ocupados.add(s.enlace.id);
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
          <b>{cuadra ? "✓ Cuadra con el estado de cuenta" : `Aún no cuadra${malas ? ` · ${malas} saldo(s) del día no coinciden` : ""}`}</b>
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

      <div className="cj-pasos" role="tablist" aria-label="Pasos">
        <button type="button" role="tab" aria-selected={paso === "copiar"} className={paso === "copiar" ? "activo" : ""} onClick={() => setPaso("copiar")}>
          <i>1</i> Copiar el estado de cuenta
        </button>
        <button type="button" role="tab" aria-selected={paso === "enlazar"} className={paso === "enlazar" ? "activo" : ""} onClick={() => setPaso("enlazar")}>
          <i>2</i> Enlazar con lo registrado
          {activas.length > 0 && <small>{enlazadas}/{activas.length}</small>}
        </button>
      </div>
      {borradorLocal && <p className="cj-aviso">Se recuperó lo que había escrito sin guardar en este equipo.</p>}

      {/* ----------------------------------------------------------- PASO 1 */}
      <div hidden={paso !== "copiar"} className="cj-paso">
        <p className="cj-guia">
          Escriba cada línea como está en el original. <kbd>Tab</kbd> pasa a la siguiente casilla y <kbd>Enter</kbd> baja a la línea de abajo. En «Día» basta el número (<kbd>6</kbd> = día 6) o <kbd>0602</kbd> para 06/02.
        </p>

        <fieldset disabled={!puede} className="cj-bar">
          <label className="campo">
            Estado de cuenta al
            <CampoDia valor={cab.fecha_corte} refFecha={refFecha} onCambio={(v) => ponCab("fecha_corte", v)} />
          </label>
          {puede && (
            <div className="cj-atajos">
              <span>Agregar línea:</span>
              <button type="button" onClick={() => agregar("", "codigo")}>+ Cheque</button>
              <button type="button" onClick={() => agregar("IMPT/ITF", "cargo")}>+ IMPT/ITF</button>
              <button type="button" onClick={() => agregar("MANUTEN.", "cargo")}>+ MANUTEN.</button>
              <button type="button" onClick={() => agregar("TI ", "abono")}>+ TI (abono)</button>
            </div>
          )}
        </fieldset>

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
                <th aria-label="Comprobación" />
                <th aria-label="Enlace" />
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
                  <tr key={i} className={f.estado === "mal" ? "mal" : undefined}>
                    <td className="n">{i + 1}</td>
                    <td><input {...comunes("codigo")} value={l.codigo} onChange={(e) => ponLinea(i, "codigo", e.target.value)} placeholder="86106449 · IMPT/ITF · TI 1721" aria-label={`Línea ${i + 1}: codificación`} /></td>
                    <td><input {...comunes("cargo")} className="m" inputMode="decimal" value={l.cargo} onChange={(e) => ponLinea(i, "cargo", e.target.value)} onBlur={(e) => ponLinea(i, "cargo", darFormato(e.target.value))} aria-label={`Línea ${i + 1}: cargo`} /></td>
                    <td><input {...comunes("abono")} className="m" inputMode="decimal" value={l.abono} onChange={(e) => ponLinea(i, "abono", e.target.value)} onBlur={(e) => ponLinea(i, "abono", darFormato(e.target.value))} aria-label={`Línea ${i + 1}: abono`} /></td>
                    <td><input {...comunes("saldo")} className="m" inputMode="decimal" value={l.saldo} onChange={(e) => ponLinea(i, "saldo", e.target.value)} onBlur={(e) => ponLinea(i, "saldo", darFormato(e.target.value))} aria-label={`Línea ${i + 1}: saldo`} /></td>
                    <td><CampoDia {...comunes("dia")} valor={l.dia} refFecha={refFecha} onCambio={(v) => ponLinea(i, "dia", v)} aria-label={`Línea ${i + 1}: día`} /></td>
                    <td className="te-va">{f.corrida !== null ? fmt(f.corrida) : ""}</td>
                    <td className="te-chk">
                      {f.estado === "ok" && <span className="si" title="El saldo coincide con lo que va la cuenta">✓</span>}
                      {f.estado === "mal" && <span className="no" title={`Debería ser ${f.corrida !== null ? fmt(f.corrida) : "—"}`}>✗</span>}
                    </td>
                    <td className="te-enl">
                      {l.enlace && <span className="te-enlazado" title={l.enlace.etiqueta}>🔗 Enlazado</span>}
                    </td>
                    <td>{puede && <button type="button" className="te-quitar" onClick={() => quitar(i)} aria-label={`Quitar la línea ${i + 1}`}>×</button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={10}>{puede && <button type="button" className="btn chico contorno" onClick={() => agregar()}>+ Agregar línea</button>}</td>
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
                    <span>Suma de Sebaz</span>
                    <b>{ch.sist === null ? "—" : ch.f(ch.sist)}</b>
                    <small>{sin ? "Escriba el total del original" : ok ? "✓ Cuadra" : `Diferencia ${fmt(Math.abs(ch.sist! - ch.pdf!))}`}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {activas.length > 0 && (
          <div className="cj-siguiente">
            <button type="button" className="btn primario" onClick={() => setPaso("enlazar")}>Continuar: enlazar los movimientos →</button>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- PASO 2 */}
      <div hidden={paso !== "enlazar"} className="cj-paso">
        {activas.length === 0 ? (
          <div className="cj-vacio">
            <b>Primero copie el estado de cuenta</b>
            <span>Cuando tenga las líneas copiadas, aquí podrá enlazar cada cheque con su comprobante de pago, las transferencias y los depósitos.</span>
            <button type="button" className="btn primario" onClick={() => setPaso("copiar")}>← Ir a copiar</button>
          </div>
        ) : (
          <>
            <div className="cj-herr">
              {puede && <button type="button" className="btn primario" onClick={enlazarAutomatico}>✨ Enlazar automático</button>}
              <div className="cj-filtro" role="group" aria-label="Mostrar">
                <button type="button" className={!soloPendientes ? "activo" : ""} onClick={() => setSoloPendientes(false)}>Todos ({activas.length})</button>
                <button type="button" className={soloPendientes ? "activo" : ""} onClick={() => setSoloPendientes(true)}>Pendientes ({activas.length - enlazadas})</button>
              </div>
            </div>
            <p className="cj-guia">El cheque se busca por su número en los comprobantes de pago; la transferencia, por su monto; el ITF y el mantenimiento se marcan como gasto del banco. Revise cada uno y cambie lo que haga falta.</p>

            <ul className="cj-movs">
              {activas
                .filter((x) => !soloPendientes || !x.l.enlace)
                .map(({ l, i, tipo }) => {
                  const cargo = aNum(l.cargo);
                  const abono = aNum(l.abono);
                  const sug = !l.enlace ? sugerir(l, candidatos, usados) : null;
                  const cp = l.enlace?.tipo === "cp" && l.enlace.id ? infoCp.get(l.enlace.id) : null;
                  const dif = cp && cargo !== null && !igual(cp.monto, cargo) ? cp.monto : null;
                  return (
                    <li key={i} className={`cj-mov${l.enlace ? " listo" : ""}`}>
                      <div className="cj-mov-fecha"><b>{diaCorto(l.dia)}</b><small>#{i + 1}</small></div>
                      <div className="cj-mov-dato">
                        <b>{l.codigo || "—"}</b>
                        <span>{ETIQUETA_TIPO[tipo]}</span>
                      </div>
                      <div className={`cj-mov-monto ${abono !== null ? "mas" : ""}`}>{abono !== null ? `+ ${fmt(abono)}` : cargo !== null ? `− ${fmt(cargo)}` : "—"}</div>
                      <div className="cj-mov-enlace">
                        {l.enlace ? (
                          <>
                            <span className={`cj-pill ${l.enlace.tipo}`}>{l.enlace.tipo === "banco" ? "Banco" : l.enlace.tipo === "cp" ? "Comprobante" : l.enlace.tipo === "transferencia" ? "Transferencia" : l.enlace.tipo === "ingresos" ? "Ingresos propios" : "Otro"}</span>
                            <b className="cj-etq">{l.enlace.etiqueta}</b>
                            {dif !== null && <small className="cj-alerta">El comprobante es por S/ {fmt(dif)}</small>}
                          </>
                        ) : sug ? (
                          <>
                            <small className="cj-sug">Sugerido: <b>{sug.enlace.etiqueta}</b></small>
                          </>
                        ) : (
                          <small className="cj-pend">Sin enlazar</small>
                        )}
                      </div>
                      <div className="cj-mov-acc">
                        {puede && sug && !l.enlace && <button type="button" className="btn chico primario" onClick={() => ponEnlace(i, sug.enlace)}>Aceptar</button>}
                        {puede && <button type="button" className="btn chico contorno" onClick={() => setEligiendo(i)}>{l.enlace ? "Cambiar" : "Elegir…"}</button>}
                        {puede && l.enlace && <button type="button" className="te-quitar" onClick={() => ponEnlace(i, null)} aria-label="Quitar el enlace">×</button>}
                      </div>
                    </li>
                  );
                })}
              {soloPendientes && activas.every((x) => x.l.enlace) && <li className="cj-todo">✓ Todos los movimientos están enlazados</li>}
            </ul>
          </>
        )}
      </div>

      {puede && (
        <div className="cj-pie">
          <span>Al guardar, los cheques enlazados quedan marcados como cobrados en la conciliación.</span>
          <BotonConfirmar className="btn primario grande" pregunta="¿Guardar el estado de cuenta?" detalle="Se guardan las líneas, los totales y los enlaces. Los cheques enlazados con fecha se marcan como cobrados." textoConfirmar="Sí, guardar">
            Guardar
          </BotonConfirmar>
        </div>
      )}

      <Elegir
        abierta={eligiendo !== null}
        indice={eligiendo ?? 0}
        linea={lineaElegida}
        lineas={lineas}
        cands={candidatos}
        onCerrar={() => setEligiendo(null)}
        onElegir={(e) => {
          if (eligiendo !== null) ponEnlace(eligiendo, e);
          setEligiendo(null);
        }}
      />
    </form>
  );
}
