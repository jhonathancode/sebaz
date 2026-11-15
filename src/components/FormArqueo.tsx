"use client";
import { useState } from "react";
import { BILLETES, DENOMINACIONES, MONEDAS, sumarConteo } from "@/lib/arqueo";

const soles = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Campos del arqueo: cuenta billetes y monedas y muestra al instante si el fondo cuadra. */
export default function FormArqueo({ fondo, comprobantes }: { fondo: number; comprobantes: number }) {
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const efectivo = sumarConteo(conteo);
  const dif = Math.round((efectivo + comprobantes - fondo) * 100) / 100;
  const campo = (d: string) => (
    <label key={d} className="campo">
      S/ {d}
      <input name={`d_${d}`} type="number" min={0} step={1} inputMode="numeric" placeholder="0" onChange={(e) => setConteo((c) => ({ ...c, [d]: Number(e.target.value) || 0 }))} />
    </label>
  );
  return (
    <>
      <p className="pequeno tenue" style={{ margin: "0 0 10px" }}>Cuente el efectivo que hay en la caja y escriba cuántos billetes y monedas hay de cada valor.</p>
      <b className="pequeno">Billetes</b>
      <div className="rejilla">{BILLETES.map(campo)}</div>
      <b className="pequeno">Monedas</b>
      <div className="rejilla">{MONEDAS.map(campo)}</div>
      <div className="rejilla-2" style={{ marginTop: 10 }}>
        <label className="campo">Fecha del arqueo<input name="fecha" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label className="campo">Hora<input name="hora" type="time" defaultValue="" /></label>
        <label className="campo ancho">Observaciones<input name="observaciones" placeholder="Opcional" style={{ textTransform: "uppercase" }} /></label>
      </div>
      <div className="aviso info" style={{ marginTop: 10 }}>
        <div>Efectivo contado: <b>S/ {soles(efectivo)}</b></div>
        <div>Comprobantes de gasto: <b>S/ {soles(comprobantes)}</b></div>
        <div>Fondo asignado: <b>S/ {soles(fondo)}</b></div>
        <div style={{ marginTop: 4 }}>
          {dif === 0 ? <b>✓ El fondo cuadra.</b> : dif > 0 ? <b>Sobran S/ {soles(dif)}.</b> : <b>Faltan S/ {soles(-dif)}.</b>}
        </div>
      </div>
      <input type="hidden" name="_n" value={DENOMINACIONES.length} />
    </>
  );
}
