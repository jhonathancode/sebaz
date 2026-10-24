"use client";

import { useRef, useState } from "react";
import VistaPrevia from "@/components/VistaPrevia";
import { FormatoPecosa, type DatosPecosa } from "@/components/formatos/FormatosAlmacen";
import type { Mcp } from "@/lib/contexto";
import { hoyISO, soles } from "@/lib/formato";

export type BienConStock = { id: string; codigo: number; descripcion: string; unidad: string; stock: number; costo: number };

type Fila = { bien: string; cantidad: string };

const cant = (n: number) => Number(n).toLocaleString("es-PE", { maximumFractionDigits: 3 });

/** Salida del almacén (PECOSA): se elige qué se entrega, se revisa y se emite. */
export default function FormularioPecosa({
  mcp,
  accion,
  bienes,
}: {
  mcp: Mcp;
  accion: (fd: FormData) => Promise<void>;
  bienes: BienConStock[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [filas, setFilas] = useState<Fila[]>([{ bien: "", cantidad: "1" }]);
  const [vista, setVista] = useState<DatosPecosa | null>(null);
  const porId = new Map(bienes.map((b) => [b.id, b]));

  // Lo pedido de cada bien (por si se repite en dos filas)
  const pedido = new Map<string, number>();
  filas.forEach((f) => f.bien && pedido.set(f.bien, (pedido.get(f.bien) ?? 0) + (Number(f.cantidad) || 0)));
  const excede = [...pedido].filter(([id, c]) => c > (porId.get(id)?.stock ?? 0));
  const validas = filas.filter((f) => f.bien && Number(f.cantidad) > 0);
  const total = validas.reduce((s, f) => s + Number(f.cantidad) * (porId.get(f.bien)?.costo ?? 0), 0);

  function verVistaPrevia() {
    const f = form.current;
    if (!f) return;
    if (!f.checkValidity()) return f.reportValidity();
    const fd = new FormData(f);
    const may = (k: string) => String(fd.get(k) ?? "").toLocaleUpperCase("es-PE").trim();
    setVista({
      numero: null,
      anio: Number(String(fd.get("fecha")).slice(0, 4)),
      fecha: String(fd.get("fecha")),
      area_solicitante: may("area_solicitante"),
      solicitante: may("solicitante") || null,
      finalidad: may("finalidad") || null,
      items: validas.map((v) => {
        const b = porId.get(v.bien)!;
        return { codigo: b.codigo, descripcion: b.descripcion, unidad: b.unidad, cantidad: Number(v.cantidad), precio_unitario: b.costo };
      }),
    });
  }

  if (bienes.length === 0) {
    return <div className="aviso info">No hay bienes con stock en el almacén. Primero registre una entrada (NEA).</div>;
  }

  return (
    <form ref={form} action={accion} className="panel">
      <div className="panel-cab">Datos de la entrega</div>
      <div className="panel-cuerpo">
        <input type="hidden" name="items" value={JSON.stringify(validas.map((v) => ({ bien_id: v.bien, cantidad: Number(v.cantidad) })))} />
        <div className="rejilla-2">
          <label className="campo">
            Fecha de entrega
            <input type="date" name="fecha" defaultValue={hoyISO()} required />
          </label>
          <label className="campo">
            Área que recibe
            <input name="area_solicitante" required placeholder="Ej.: Secretaría, Alcaldía, Limpieza pública" />
          </label>
          <label className="campo">
            Persona que recibe
            <input name="solicitante" placeholder="Nombre de quien se lleva los bienes" />
          </label>
          <label className="campo">
            Para qué se usará
            <input name="finalidad" placeholder="Ej.: Uso de oficina, faena comunal" />
          </label>
        </div>

        <fieldset className="pregunta">
          <legend>¿Qué bienes se entregan?</legend>
          {filas.map((f, i) => {
            const b = porId.get(f.bien);
            const pasa = b && (pedido.get(b.id) ?? 0) > b.stock;
            return (
              <div key={i} className="item-fila corta">
                <span className="item-num" aria-hidden="true">{i + 1}</span>
                <label className="campo item-desc">
                  Bien
                  <select value={f.bien} required={i === 0} onChange={(e) => setFilas((fs) => fs.map((x, n) => (n === i ? { ...x, bien: e.target.value } : x)))}>
                    <option value="">Elija un bien…</option>
                    {bienes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.descripcion} ({x.unidad}) · hay {cant(x.stock)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  Cantidad
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={f.cantidad}
                    onChange={(e) => setFilas((fs) => fs.map((x, n) => (n === i ? { ...x, cantidad: e.target.value } : x)))}
                  />
                </label>
                <div className="item-total">
                  <span className="etiqueta">En almacén</span>
                  <b className={pasa ? "falta" : undefined}>{b ? `${cant(b.stock)} ${b.unidad}` : "—"}</b>
                </div>
                {filas.length > 1 && (
                  <button type="button" className="item-quitar" title="Quitar esta fila" aria-label={`Quitar fila ${i + 1}`} onClick={() => setFilas((fs) => fs.filter((_, n) => n !== i))}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className="btn contorno" onClick={() => setFilas((fs) => [...fs, { bien: "", cantidad: "1" }])}>+ Agregar otro bien</button>
            <span>Valor de la entrega <b style={{ fontSize: 18 }}>S/ {soles(total)}</b></span>
          </div>
        </fieldset>

        {excede.length > 0 && (
          <div className="aviso error">
            No hay suficiente {excede.map(([id]) => porId.get(id)?.descripcion).join(", ")}. Baje la cantidad a lo que hay en almacén.
          </div>
        )}

        <div className="acciones-fila" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn primario grande" onClick={verVistaPrevia} disabled={validas.length === 0 || excede.length > 0}>
            Ver vista previa de la PECOSA
          </button>
        </div>
      </div>

      <VistaPrevia
        abierta={!!vista}
        titulo="Vista previa · PECOSA"
        onCerrar={() => setVista(null)}
        onEmitir={() => {
          setVista(null);
          form.current?.requestSubmit();
        }}
        textoEmitir="Sí, emitir la PECOSA"
      >
        {vista && <FormatoPecosa p={vista} mcp={mcp} />}
      </VistaPrevia>
    </form>
  );
}
