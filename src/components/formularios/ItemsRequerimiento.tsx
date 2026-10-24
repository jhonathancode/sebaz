"use client";

import { useEffect, useState } from "react";

type Fila = { cantidad: string; unidad: string; descripcion: string; precio: string };

const UNIDADES = ["Unidad", "Servicio", "Mes", "Dieta", "Galón", "Caja", "Millar", "Paquete", "Kilo", "Metro", "Bolsa", "Juego"];
const fmt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (t: string) => {
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Lo que se necesita, fila por fila, con el total calculado mientras se escribe.
 * Los nombres de los campos (cant_1, und_1, desc_1, precio_1...) los lee el servidor.
 */
export default function ItemsRequerimiento({ inicial }: { inicial?: { cantidad: number; unidad: string; descripcion: string; precio_unitario: number }[] }) {
  const [filas, setFilas] = useState<Fila[]>(
    inicial && inicial.length
      ? inicial.map((i) => ({ cantidad: String(i.cantidad), unidad: i.unidad, descripcion: i.descripcion, precio: String(i.precio_unitario) }))
      : [{ cantidad: "1", unidad: "Unidad", descripcion: "", precio: "" }],
  );

  // El selector de pagos fijos llena las filas solo.
  useEffect(() => {
    const llenar = (e: Event) => {
      const filasNuevas = (e as CustomEvent<Fila[]>).detail;
      if (Array.isArray(filasNuevas) && filasNuevas.length) setFilas(filasNuevas);
    };
    window.addEventListener("sebaz:llenar-items", llenar);
    return () => window.removeEventListener("sebaz:llenar-items", llenar);
  }, []);

  const cambiar = (i: number, campo: keyof Fila, valor: string) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
  const total = filas.reduce((s, f) => s + num(f.cantidad) * num(f.precio), 0);

  return (
    <div className="items">
      <datalist id="unidades">
        {UNIDADES.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      {filas.map((f, i) => (
        <div key={i} className="item-fila">
          <span className="item-num" aria-hidden="true">{i + 1}</span>
          <label className="campo item-desc">
            Qué se necesita
            <input name={`desc_${i + 1}`} value={f.descripcion} onChange={(e) => cambiar(i, "descripcion", e.target.value)} placeholder="Ej.: Papel bond A4, servicio de tesorería, dieta de regidor" required={i === 0} />
          </label>
          <label className="campo">
            Cantidad
            <input name={`cant_${i + 1}`} value={f.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} inputMode="decimal" />
          </label>
          <label className="campo">
            Unidad
            <input name={`und_${i + 1}`} value={f.unidad} onChange={(e) => cambiar(i, "unidad", e.target.value)} list="unidades" />
          </label>
          <label className="campo">
            Precio por unidad S/
            <input name={`precio_${i + 1}`} value={f.precio} onChange={(e) => cambiar(i, "precio", e.target.value)} inputMode="decimal" placeholder="0.00" />
          </label>
          <div className="item-total">
            <span className="etiqueta">Subtotal</span>
            <span>S/ {fmt(num(f.cantidad) * num(f.precio))}</span>
          </div>
          {filas.length > 1 && (
            <button type="button" className="item-quitar" aria-label={`Quitar fila ${i + 1}`} title="Quitar esta fila" onClick={() => setFilas((x) => x.filter((_, j) => j !== i))}>
              ×
            </button>
          )}
        </div>
      ))}
      <div className="items-pie">
        <button type="button" className="btn contorno" onClick={() => setFilas((x) => [...x, { cantidad: "1", unidad: "Unidad", descripcion: "", precio: "" }])}>
          + Agregar otra cosa
        </button>
        <div className="items-total">
          Total del requerimiento <b>S/ {fmt(total)}</b>
        </div>
      </div>
    </div>
  );
}
