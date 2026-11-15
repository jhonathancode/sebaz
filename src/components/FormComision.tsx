"use client";
import { useState } from "react";
import { CONCEPTOS_VIAJE, cantidadSugerida, nombreConcepto } from "@/lib/viaticos";

type Tarifa = { id: string; destino: string; concepto: string; detalle: string | null; unidad: string; monto: number };
type Fila = { k: number; concepto: string; detalle: string; cantidad: string; precio: string };
const soles = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoy = () => new Date().toISOString().slice(0, 10);

/** Comisión de servicio: elige el destino, las fechas, y el tarifario completa pasajes, hospedaje y alimentación. */
export default function FormComision({ tarifas, destinoInicial = "" }: { tarifas: Tarifa[]; destinoInicial?: string }) {
  const destinos = [...new Set(tarifas.map((t) => t.destino))].sort();
  const [destino, setDestino] = useState(destinoInicial);
  const [salida, setSalida] = useState(hoy());
  const [retorno, setRetorno] = useState(hoy());
  const [filas, setFilas] = useState<Fila[]>(() =>
    tarifas.filter((t) => t.destino === destinoInicial).map((t, i) => ({ k: i + 1, concepto: t.concepto, detalle: t.detalle ?? "", cantidad: String(cantidadSugerida(t.unidad, hoy(), hoy())), precio: t.monto.toFixed(2) })),
  );
  const [sig, setSig] = useState(100);
  const cambiar = (k: number, p: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.k === k ? { ...f, ...p } : f)));
  const cargar = (d: string, s: string, r: string) => {
    const delDestino = tarifas.filter((t) => t.destino === d);
    setFilas(delDestino.map((t, i) => ({ k: sig + i, concepto: t.concepto, detalle: t.detalle ?? "", cantidad: String(cantidadSugerida(t.unidad, s, r)), precio: t.monto.toFixed(2) })));
    setSig(sig + delDestino.length + 1);
  };
  const total = filas.reduce((s, f) => s + (Number(f.cantidad) || 0) * (Number(f.precio) || 0), 0);
  return (
    <>
      <div className="rejilla-2">
        <label className="campo">Destino
          <input name="destino" required list="destinos-viaje" value={destino} readOnly={!!destinoInicial} style={{ textTransform: "uppercase" }} placeholder="HUANCAYO, LIMA…"
            onChange={(e) => { const v = e.target.value.toUpperCase(); setDestino(v); if (destinos.includes(v)) cargar(v, salida, retorno); }} />
          <datalist id="destinos-viaje">{destinos.map((d) => <option key={d} value={d} />)}</datalist>
        </label>
        <label className="campo">Fecha de salida<input name="fecha_salida" type="date" required value={salida} onChange={(e) => { setSalida(e.target.value); if (destinos.includes(destino)) cargar(destino, e.target.value, retorno); }} /></label>
        <label className="campo">Fecha de retorno<input name="fecha_retorno" type="date" required min={salida} value={retorno} onChange={(e) => { setRetorno(e.target.value); if (destinos.includes(destino)) cargar(destino, salida, e.target.value); }} /></label>
      </div>
      {destinos.length > 0 && <p className="pequeno tenue" style={{ margin: "4px 0 8px" }}>Al elegir un destino del tarifario, las filas se completan solas según los días del viaje. Puede cambiar cantidades y precios.</p>}
      <div style={{ display: "grid", gap: 8 }}>
        {filas.map((f) => (
          <div key={f.k} className="rejilla" style={{ alignItems: "end" }}>
            <input type="hidden" name="idx" value={f.k} />
            <label className="campo">Concepto
              <select name={`concepto_${f.k}`} value={f.concepto} onChange={(e) => cambiar(f.k, { concepto: e.target.value })}>
                {CONCEPTOS_VIAJE.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
              </select>
            </label>
            <label className="campo">Detalle<input name={`detalle_${f.k}`} value={f.detalle} onChange={(e) => cambiar(f.k, { detalle: e.target.value.toUpperCase() })} placeholder={nombreConcepto(f.concepto)} /></label>
            <label className="campo">Cantidad<input name={`cantidad_${f.k}`} required inputMode="decimal" value={f.cantidad} onChange={(e) => cambiar(f.k, { cantidad: e.target.value })} /></label>
            <label className="campo">Precio S/<input name={`precio_${f.k}`} required inputMode="decimal" value={f.precio} onChange={(e) => cambiar(f.k, { precio: e.target.value })} /></label>
            <button type="button" className="btn chico contorno" onClick={() => setFilas((fs) => fs.filter((x) => x.k !== f.k))}>Quitar</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
        <button type="button" className="btn chico contorno" onClick={() => { setFilas((fs) => [...fs, { k: sig, concepto: "pasaje", detalle: "", cantidad: "1", precio: "" }]); setSig(sig + 1); }}>+ Agregar gasto</button>
        <span className="espacio" />
        <b>Total estimado: S/ {soles(total)}</b>
      </div>
    </>
  );
}
