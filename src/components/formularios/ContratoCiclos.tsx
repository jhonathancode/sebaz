"use client";

import { useEffect, useRef, useState } from "react";
import { ciclosDelContrato, PERIODICIDADES } from "@/lib/ciclosContrato";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Vigencia y periodicidad de un contrato de servicio, con la vista previa de sus ciclos. Sin fecha de inicio, el pago fijo sigue mes a mes. */
export function ContratoCiclos({ inicio, fin, meses }: { inicio?: string | null; fin?: string | null; meses?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const anio = new Date().getFullYear();
  const [i, setI] = useState(inicio ?? "");
  const [f, setF] = useState(fin ?? "");
  const [m, setM] = useState(meses ?? 1);
  const [monto, setMonto] = useState(0);

  useEffect(() => {
    const form = caja.current?.closest("form");
    const leer = () => setMonto(Number((form?.querySelector<HTMLInputElement>('input[name="monto"]')?.value ?? "").replace(/,/g, "")) || 0);
    leer();
    form?.addEventListener("input", leer);
    return () => form?.removeEventListener("input", leer);
  }, []);

  const ciclos = i && f ? ciclosDelContrato({ inicio: i, fin: f, meses: m, monto }) : [];
  const errorVigencia = i && f && (f < i ? "La fecha de fin debe ser posterior a la de inicio." : f.slice(0, 4) !== i.slice(0, 4) ? "El contrato vale un solo año: termina como máximo el 31 de diciembre. Al año siguiente se renueva." : "");
  const total = ciclos.reduce((s, c) => s + c.monto, 0);

  return (
    <div ref={caja}>
      <p className="pf-sec-ayuda">
        Para un contrato de servicio con fecha (contador, abogado…): el requerimiento se hace una sola vez y sirve para todo el año; cada ciclo tiene su orden (al inicio del ciclo) y su comprobante (al final). Déjelo vacío para pagos que simplemente se repiten cada mes.
      </p>
      <div className="rejilla-2">
        <label className="campo">Se paga cada
          <select name="periodicidad_meses" value={m} onChange={(e) => setM(Number(e.target.value))}>
            {PERIODICIDADES.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
          </select>
        </label>
        <span />
        <label className="campo">Contrato desde
          <input type="date" name="fecha_inicio" value={i} min={`${anio - 1}-01-01`} max={`${anio + 1}-12-31`} onChange={(e) => { setI(e.target.value); if (e.target.value && !f) setF(`${e.target.value.slice(0, 4)}-12-31`); }} />
        </label>
        <label className="campo">Hasta
          <input type="date" name="fecha_fin" value={f} onChange={(e) => setF(e.target.value)} />
        </label>
      </div>
      {errorVigencia && <div className="aviso alerta" role="alert" style={{ marginTop: 8 }}>{errorVigencia}</div>}
      {!errorVigencia && ciclos.length > 0 && (
        <div className="pfx-detalle" style={{ marginTop: 10 }}>
          <div className="pequeno tenue" style={{ marginBottom: 6 }}>{ciclos.length} ciclo(s) · total del contrato S/ {total.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div style={{ display: "grid", gap: 4, maxHeight: 180, overflowY: "auto" }}>
            {ciclos.map((c) => (
              <div key={c.n} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <span>{c.n}. Orden {dm(c.desde)} → comprobante {dm(c.hasta)}{c.completo ? "" : ` · ${c.dias} de ${c.diasCompleto} días`}</span>
                <b>S/ {c.monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
            ))}
          </div>
          {ciclos.some((c) => !c.completo) && <div className="pequeno tenue" style={{ marginTop: 6 }}>El último ciclo queda más corto porque el año cierra el 31 de diciembre: se paga por los días que corresponden.</div>}
        </div>
      )}
    </div>
  );
}
