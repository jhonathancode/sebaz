"use client";
import { useState } from "react";

type Tarifa = { id: string; destino: string; tipo: "taxi" | "urbano"; monto: number };
type Fila = { k: number; fecha: string; destino: string; tipo: "taxi" | "urbano"; monto: string };
const soles = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Filas de viajes de la planilla de movilidad; al elegir un destino del tarifario se completa el monto. */
export default function FormPlanilla({ tarifas, fechaInicial }: { tarifas: Tarifa[]; fechaInicial: string }) {
  const [filas, setFilas] = useState<Fila[]>([{ k: 0, fecha: fechaInicial, destino: "", tipo: "urbano", monto: "" }]);
  const [sig, setSig] = useState(1);
  const cambiar = (k: number, p: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.k === k ? { ...f, ...p } : f)));
  const elegir = (k: number, valor: string) => {
    const t = tarifas.find((x) => x.id === valor);
    if (t) cambiar(k, { destino: t.destino, tipo: t.tipo, monto: t.monto.toFixed(2) });
  };
  const total = filas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  return (
    <>
      <div style={{ display: "grid", gap: 8 }}>
        {filas.map((f, i) => (
          <div key={f.k} className="rejilla" style={{ alignItems: "end" }}>
            <input type="hidden" name="idx" value={f.k} />
            <label className="campo">Fecha<input name={`fecha_${f.k}`} type="date" required value={f.fecha} onChange={(e) => cambiar(f.k, { fecha: e.target.value })} /></label>
            {tarifas.length > 0 && (
              <label className="campo">Del tarifario
                <select value="" onChange={(e) => elegir(f.k, e.target.value)}>
                  <option value="">— elegir —</option>
                  {tarifas.map((t) => <option key={t.id} value={t.id}>{t.destino} · {t.tipo === "taxi" ? "Taxi" : "Urbano"} · S/ {soles(t.monto)}</option>)}
                </select>
              </label>
            )}
            <label className="campo">Destino<input name={`destino_${f.k}`} required value={f.destino} onChange={(e) => cambiar(f.k, { destino: e.target.value.toUpperCase() })} /></label>
            <label className="campo">Tipo
              <select name={`tipo_${f.k}`} value={f.tipo} onChange={(e) => cambiar(f.k, { tipo: e.target.value as "taxi" | "urbano" })}>
                <option value="urbano">Urbano</option>
                <option value="taxi">Taxi</option>
              </select>
            </label>
            <label className="campo">Monto S/<input name={`monto_${f.k}`} required inputMode="decimal" value={f.monto} onChange={(e) => cambiar(f.k, { monto: e.target.value })} /></label>
            {filas.length > 1 && <button type="button" className="btn chico contorno" onClick={() => setFilas((fs) => fs.filter((x) => x.k !== f.k))} aria-label={`Quitar viaje ${i + 1}`}>Quitar</button>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
        <button type="button" className="btn chico contorno" onClick={() => { setFilas((fs) => [...fs, { k: sig, fecha: fs.at(-1)?.fecha ?? fechaInicial, destino: "", tipo: "urbano", monto: "" }]); setSig(sig + 1); }}>+ Agregar viaje</button>
        <span className="espacio" />
        <b>Total: S/ {soles(total)}</b>
      </div>
    </>
  );
}
