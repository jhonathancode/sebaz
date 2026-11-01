"use client";

import { useMemo, useRef, useState } from "react";
import BotonConfirmar from "@/components/BotonConfirmar";

export type LineaExtracto = { codigo: string; cargo: string; abono: string; saldo: string; dia: string };
export type CabeceraExtracto = {
  fecha_corte: string;
  fecha_saldo_anterior: string;
  saldo_anterior: string;
  n_pdf: string;
  cargos_pdf: string;
  abonos_pdf: string;
  saldo_pdf: string;
};

const aNum = (v: string) => {
  const t = v.replace(/,/g, "").replace(/\s/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Tabla para copiar a mano el estado de cuenta con las mismas columnas del banco
 * (codificación / N° de cheque, cargos, abonos, saldos y día). Va sumando para comprobar
 * que lo copiado cuadra con los totales y los saldos impresos en el PDF.
 */
export default function TranscribirExtracto({
  periodo,
  cabInicial,
  lineasInicial,
  puede,
  guardar,
}: {
  periodo: string;
  cabInicial: CabeceraExtracto;
  lineasInicial: LineaExtracto[];
  puede: boolean;
  guardar: (fd: FormData) => Promise<void>;
}) {
  const [cab, setCab] = useState<CabeceraExtracto>(cabInicial);
  const [lineas, setLineas] = useState<LineaExtracto[]>(lineasInicial.length ? lineasInicial : [{ codigo: "", cargo: "", abono: "", saldo: "", dia: "" }]);
  const cuerpo = useRef<HTMLTableSectionElement>(null);

  function ponCab(k: keyof CabeceraExtracto, v: string) {
    setCab((c) => ({ ...c, [k]: v }));
  }
  function ponLinea(i: number, k: keyof LineaExtracto, v: string) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: k === "codigo" ? v.toUpperCase() : v } : l)));
  }
  function agregar(despuesDe?: number) {
    setLineas((ls) => {
      const base = ls[despuesDe ?? ls.length - 1];
      const nueva = { codigo: "", cargo: "", abono: "", saldo: "", dia: base?.dia ?? "" };
      const copia = [...ls];
      copia.splice((despuesDe ?? ls.length - 1) + 1, 0, nueva);
      return copia;
    });
    setTimeout(() => {
      const filas = cuerpo.current?.querySelectorAll("tr");
      const destino = filas?.[(despuesDe ?? lineas.length - 1) + 1]?.querySelector<HTMLInputElement>("input");
      destino?.focus();
    }, 0);
  }
  function quitar(i: number) {
    setLineas((ls) => (ls.length === 1 ? [{ codigo: "", cargo: "", abono: "", saldo: "", dia: "" }] : ls.filter((_, j) => j !== i)));
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
      // El banco imprime el saldo solo en la última línea de cada día: se compara con lo que va la cuenta
      const estado: "ok" | "mal" | null = s === null || corrida === null ? null : igual(s, corrida) ? "ok" : "mal";
      return { corrida, estado, esperado: corrida };
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
  const malas = lineas.filter((_, i) => calculo.filas[i].estado === "mal").length;

  const datos = JSON.stringify({ cab, lineas });

  return (
    <form action={guardar} className="te">
      <input type="hidden" name="periodo" value={periodo} />
      <input type="hidden" name="datos" value={datos} />

      <div className={`te-estado ${todoCuadra && malas === 0 ? "ok" : ""}`}>
        {todoCuadra && malas === 0 ? (
          <b>✓ Cuadra con el estado de cuenta</b>
        ) : (
          <b>Aún no cuadra{malas ? ` · ${malas} saldo(s) del día no coinciden` : ""}</b>
        )}
        <span>
          Cargos S/ {fmt(calculo.totalCargos)} · Abonos S/ {fmt(calculo.totalAbonos)}
          {calculo.saldoFinal !== null && <> · Saldo calculado S/ {fmt(calculo.saldoFinal)}</>}
        </span>
      </div>

      <fieldset disabled={!puede} className="te-cab">
        <label className="campo">
          Estado de cuenta al
          <input type="date" value={cab.fecha_corte} onChange={(e) => ponCab("fecha_corte", e.target.value)} />
        </label>
        <label className="campo">
          Saldo anterior · fecha
          <input type="date" value={cab.fecha_saldo_anterior} onChange={(e) => ponCab("fecha_saldo_anterior", e.target.value)} />
        </label>
        <label className="campo">
          Saldo anterior S/
          <input inputMode="decimal" value={cab.saldo_anterior} onChange={(e) => ponCab("saldo_anterior", e.target.value)} placeholder="4,835.19" />
        </label>
      </fieldset>

      <div className="te-tabla-marco">
        <table className="te-tabla">
          <thead>
            <tr>
              <th>Codificación<br />N° cheque</th>
              <th>Cargos</th>
              <th>Abonos</th>
              <th>Saldos</th>
              <th>Día</th>
              <th aria-label="Comprobación" />
              <th aria-label="Quitar" />
            </tr>
          </thead>
          <tbody ref={cuerpo}>
            {lineas.map((l, i) => {
              const f = calculo.filas[i];
              return (
                <tr key={i}>
                  <td><input value={l.codigo} onChange={(e) => ponLinea(i, "codigo", e.target.value)} placeholder="86106449 · IMPT/ITF · TI 1721" disabled={!puede} aria-label={`Línea ${i + 1}: codificación`} /></td>
                  <td><input className="m" inputMode="decimal" value={l.cargo} onChange={(e) => ponLinea(i, "cargo", e.target.value)} disabled={!puede} aria-label={`Línea ${i + 1}: cargo`} /></td>
                  <td><input className="m" inputMode="decimal" value={l.abono} onChange={(e) => ponLinea(i, "abono", e.target.value)} disabled={!puede} aria-label={`Línea ${i + 1}: abono`} /></td>
                  <td><input className="m" inputMode="decimal" value={l.saldo} onChange={(e) => ponLinea(i, "saldo", e.target.value)} disabled={!puede} aria-label={`Línea ${i + 1}: saldo`} /></td>
                  <td>
                    <input
                      type="date"
                      value={l.dia}
                      onChange={(e) => ponLinea(i, "dia", e.target.value)}
                      disabled={!puede}
                      aria-label={`Línea ${i + 1}: día`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && i === lineas.length - 1) {
                          e.preventDefault();
                          agregar();
                        }
                      }}
                    />
                  </td>
                  <td className="te-chk">
                    {f.estado === "ok" && <span className="si" title="El saldo coincide con lo que va la cuenta">✓</span>}
                    {f.estado === "mal" && <span className="no" title={`Debería ser ${f.esperado !== null ? fmt(f.esperado) : "—"}`}>✗ {f.esperado !== null ? fmt(f.esperado) : ""}</span>}
                  </td>
                  <td>{puede && <button type="button" className="te-quitar" onClick={() => quitar(i)} aria-label={`Quitar la línea ${i + 1}`}>×</button>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>
                {puede && <button type="button" className="btn chico contorno" onClick={() => agregar()}>+ Agregar línea</button>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="te-totales" aria-label="Totales del estado de cuenta">
        <div className="te-totales-tit">Totales impresos en el PDF y lo que suma el sistema</div>
        <div className="te-totales-rejilla">
          <label className="campo">
            TOTAL movimientos
            <input inputMode="numeric" value={cab.n_pdf} onChange={(e) => ponCab("n_pdf", e.target.value)} disabled={!puede} placeholder="20" />
          </label>
          <label className="campo">
            TOTAL cargos S/
            <input inputMode="decimal" value={cab.cargos_pdf} onChange={(e) => ponCab("cargos_pdf", e.target.value)} disabled={!puede} placeholder="14,282.60" />
          </label>
          <label className="campo">
            TOTAL abonos S/
            <input inputMode="decimal" value={cab.abonos_pdf} onChange={(e) => ponCab("abonos_pdf", e.target.value)} disabled={!puede} placeholder="14,160.00" />
          </label>
          <label className="campo">
            SALDO actual S/
            <input inputMode="decimal" value={cab.saldo_pdf} onChange={(e) => ponCab("saldo_pdf", e.target.value)} disabled={!puede} placeholder="4,712.59" />
          </label>
          {checks.map((c) => {
            const ok = c.pdf !== null && c.sist !== null && igual(c.pdf, c.sist);
            const sin = c.pdf === null || c.sist === null;
            return (
              <div key={c.clave} className={`te-comp ${sin ? "" : ok ? "ok" : "mal"}`}>
                <span>Suma del sistema</span>
                <b>{c.sist === null ? "—" : c.f(c.sist)}</b>
                <small>{sin ? "Escriba el total del PDF" : ok ? "✓ Cuadra" : `Diferencia ${fmt(Math.abs(c.sist! - c.pdf!))}`}</small>
              </div>
            );
          })}
        </div>
      </section>

      {puede && (
        <div className="te-pie">
          <BotonConfirmar className="btn primario grande" pregunta="¿Guardar el estado de cuenta copiado?" detalle="Se guardan la cabecera, las líneas y los totales tal como están." textoConfirmar="Sí, guardar">
            Guardar estado de cuenta
          </BotonConfirmar>
        </div>
      )}
    </form>
  );
}
