"use client";

import { useEffect, useState } from "react";
import { sugerirItem, UNIDADES } from "@/lib/items";

type Fila = { cantidad: string; unidad: string; descripcion: string; precio: string };

const fmt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (t: string) => {
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const OTRA = "__otra";
const enLista = (u: string) => UNIDADES.some((x) => x.toLowerCase() === u.toLowerCase());
const nuevaFila = (): Fila => ({ cantidad: "1", unidad: "Unidad", descripcion: "", precio: "" });

/** Lista desplegable de unidades; «Otra…» deja escribir una propia. El valor que se envía va en un campo oculto. */
function Unidad({ nombre, valor, onChange }: { nombre: string; valor: string; onChange: (v: string) => void }) {
  const [otra, setOtra] = useState(valor !== "" && !enLista(valor));
  return (
    <label className="campo">
      Unidad
      <input type="hidden" name={nombre} value={valor} />
      <select
        value={otra ? OTRA : UNIDADES.find((u) => u.toLowerCase() === valor.toLowerCase()) ?? "Unidad"}
        onChange={(e) => {
          if (e.target.value === OTRA) {
            setOtra(true);
            onChange("");
          } else {
            setOtra(false);
            onChange(e.target.value);
          }
        }}
      >
        {UNIDADES.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
        <option value={OTRA}>Otra…</option>
      </select>
      {otra && <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Escriba la unidad" aria-label="Otra unidad" required />}
    </label>
  );
}

/**
 * Lo que se necesita, fila por fila, con el total calculado mientras se escribe.
 * Los nombres de los campos (cant_1, und_1, desc_1, precio_1...) los lee el servidor.
 */
export default function ItemsRequerimiento({ inicial }: { inicial?: { cantidad: number; unidad: string; descripcion: string; precio_unitario: number }[] }) {
  const [filas, setFilas] = useState<Fila[]>(
    inicial && inicial.length
      ? inicial.map((i) => ({ cantidad: String(i.cantidad), unidad: i.unidad, descripcion: i.descripcion, precio: String(i.precio_unitario) }))
      : [nuevaFila()],
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
      {filas.map((f, i) => {
        const sug = sugerirItem(f.descripcion);
        return (
          <div key={i} className="item-bloque">
            <div className="item-fila">
              <span className="item-num" aria-hidden="true">{i + 1}</span>
              <label className="campo item-desc">
                Qué se necesita
                <input name={`desc_${i + 1}`} value={f.descripcion} onChange={(e) => cambiar(i, "descripcion", e.target.value)} placeholder="Ej.: Papel bond A4, lapiceros azules, servicio de tesorería" required={i === 0} />
              </label>
              <label className="campo">
                Cantidad
                <input name={`cant_${i + 1}`} value={f.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} inputMode="decimal" />
              </label>
              <Unidad nombre={`und_${i + 1}`} valor={f.unidad} onChange={(v) => cambiar(i, "unidad", v)} />
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
            {sug && (
              <div className="sugerencia" aria-live="polite">
                {sug.nombre ? (
                  <>
                    <span className="s-et">Nombre sugerido</span>
                    <span className="s-txt">{sug.nombre}</span>
                    <button
                      type="button"
                      className="btn chico primario"
                      onClick={() => setFilas((x) => x.map((r, j) => (j === i ? { ...r, descripcion: sug.nombre!, unidad: sug.unidad && r.unidad === "Unidad" ? sug.unidad : r.unidad } : r)))}
                    >
                      Usar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="s-et">Consejo</span>
                    <span className="s-txt">{sug.consejo}</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div className="items-pie">
        <button type="button" className="btn contorno" onClick={() => setFilas((x) => [...x, nuevaFila()])}>
          + Agregar otra cosa
        </button>
        <div className="items-total">
          Total del requerimiento <b>S/ {fmt(total)}</b>
        </div>
      </div>
    </div>
  );
}
