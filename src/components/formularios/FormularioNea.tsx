"use client";

import { useRef, useState } from "react";
import VistaPrevia from "@/components/VistaPrevia";
import BotonConfirmar from "@/components/BotonConfirmar";
import { FormatoNea, type DatosNea } from "@/components/formatos/FormatosAlmacen";
import type { Mcp } from "@/lib/contexto";
import { hoyISO, soles } from "@/lib/formato";

type Fila = { descripcion: string; unidad: string; cantidad: string; precio: string };

const vacia = (): Fila => ({ descripcion: "", unidad: "UNIDAD", cantidad: "1", precio: "" });

/** Entrada al almacén: se llena, se ve la vista previa y recién se emite. */
export default function FormularioNea({
  mcp,
  accion,
  expedienteId,
  inicial,
  orden,
  expediente,
}: {
  mcp: Mcp;
  accion: (fd: FormData) => Promise<void>;
  expedienteId?: string;
  inicial?: { proveedor?: string; documento_ref?: string; items?: { descripcion: string; unidad: string; cantidad: number; precio_unitario: number }[] };
  orden?: string;
  expediente?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [origen, setOrigen] = useState<DatosNea["origen"]>("compra");
  const [filas, setFilas] = useState<Fila[]>(
    inicial?.items?.length
      ? inicial.items.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, cantidad: String(i.cantidad), precio: String(i.precio_unitario) }))
      : [vacia()],
  );
  const [vista, setVista] = useState<DatosNea | null>(null);

  const cambiar = (i: number, campo: keyof Fila, valor: string) =>
    setFilas((fs) => fs.map((f, n) => (n === i ? { ...f, [campo]: campo === "descripcion" || campo === "unidad" ? valor.toLocaleUpperCase("es-PE") : valor } : f)));

  const validas = filas.filter((f) => f.descripcion.trim() && Number(f.cantidad) > 0);
  const total = validas.reduce((s, f) => s + Number(f.cantidad) * (Number(f.precio) || 0), 0);

  function verVistaPrevia() {
    const f = form.current;
    if (!f) return;
    if (!f.checkValidity()) return f.reportValidity();
    const fd = new FormData(f);
    setVista({
      numero: null,
      anio: Number(String(fd.get("fecha")).slice(0, 4)),
      fecha: String(fd.get("fecha")),
      origen,
      proveedor: String(fd.get("proveedor") ?? "").toLocaleUpperCase("es-PE") || null,
      documento_ref: String(fd.get("documento_ref") ?? "").toLocaleUpperCase("es-PE") || null,
      observacion: String(fd.get("observacion") ?? "").toLocaleUpperCase("es-PE") || null,
      orden,
      expediente,
      items: validas.map((v) => ({ descripcion: v.descripcion.trim(), unidad: v.unidad.trim() || "UNIDAD", cantidad: Number(v.cantidad), precio_unitario: Number(v.precio) || 0 })),
    });
  }

  return (
    <form ref={form} action={accion} className="panel">
      <div className="panel-cab">Datos de la entrada</div>
      <div className="panel-cuerpo">
        {expedienteId && <input type="hidden" name="expediente_id" value={expedienteId} />}
        <input type="hidden" name="origen" value={origen} />
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(validas.map((v) => ({ descripcion: v.descripcion, unidad: v.unidad, cantidad: Number(v.cantidad), precio_unitario: Number(v.precio) || 0 })))}
        />

        {!expedienteId && (
          <fieldset className="pregunta">
            <legend>1. ¿De dónde vienen los bienes?</legend>
            <div className="opciones">
              {([
                ["compra", "Compra", "Compra sin expediente en el sistema"],
                ["donacion", "Donación", "Bienes donados por otra entidad o persona"],
                ["otro", "Otro ingreso", "Saldo inicial del almacén, devoluciones, etc."],
              ] as const).map(([v, t, d]) => (
                <label key={v} className="opcion">
                  <input type="radio" name="origen_radio" checked={origen === v} onChange={() => setOrigen(v)} />
                  <span className="opcion-titulo">{t}</span>
                  <span className="opcion-texto">{d}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="rejilla-2">
          <label className="campo">
            Fecha de entrada
            <input type="date" name="fecha" defaultValue={hoyISO()} required />
          </label>
          <label className="campo">
            {origen === "compra" ? "Proveedor" : "Procedencia (quién entrega)"}
            <input name="proveedor" defaultValue={inicial?.proveedor ?? ""} required={origen !== "otro"} />
          </label>
          <label className="campo">
            Documento de sustento
            <input name="documento_ref" defaultValue={inicial?.documento_ref ?? ""} placeholder="Ej.: Factura F001-45, Guía 001-120, Acta de donación" />
          </label>
          <label className="campo">
            Observación
            <input name="observacion" placeholder="Opcional" />
          </label>
        </div>

        <fieldset className="pregunta">
          <legend>{expedienteId ? "Bienes que entran (revise las cantidades recibidas)" : "2. ¿Qué bienes entran?"}</legend>
          {filas.map((f, i) => (
            <div key={i} className="item-fila">
              <span className="item-num" aria-hidden="true">{i + 1}</span>
              <label className="campo item-desc">
                Bien
                <input value={f.descripcion} onChange={(e) => cambiar(i, "descripcion", e.target.value)} placeholder="Ej.: PAPEL BOND A4" required={i === 0} />
              </label>
              <label className="campo">
                Unidad
                <input value={f.unidad} onChange={(e) => cambiar(i, "unidad", e.target.value)} placeholder="UNIDAD, PAQUETE, CAJA" />
              </label>
              <label className="campo">
                Cantidad
                <input type="number" min="0.001" step="0.001" value={f.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} />
              </label>
              <label className="campo">
                Precio unitario S/
                <input type="number" min="0" step="0.01" value={f.precio} onChange={(e) => cambiar(i, "precio", e.target.value)} placeholder="0.00" />
              </label>
              <div className="item-total">
                <span className="etiqueta">Subtotal</span>
                <b>S/ {soles((Number(f.cantidad) || 0) * (Number(f.precio) || 0))}</b>
              </div>
              {filas.length > 1 && (
                <button type="button" className="item-quitar" title="Quitar esta fila" aria-label={`Quitar fila ${i + 1}`} onClick={() => setFilas((fs) => fs.filter((_, n) => n !== i))}>
                  ×
                </button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className="btn contorno" onClick={() => setFilas((fs) => [...fs, vacia()])}>+ Agregar otro bien</button>
            <span>Total de la entrada <b style={{ fontSize: 18 }}>S/ {soles(total)}</b></span>
          </div>
        </fieldset>

        <div className="acciones-fila" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn contorno grande" onClick={verVistaPrevia} disabled={validas.length === 0}>
            Ver vista previa
          </button>
          <BotonConfirmar
            className="btn primario grande"
            disabled={validas.length === 0}
            pregunta="¿Emitir la NEA?"
            detalle="Los bienes entran al almacén y se suman al stock."
            textoConfirmar="Sí, emitir la NEA"
          >
            Emitir la NEA
          </BotonConfirmar>
        </div>
      </div>

      <VistaPrevia
        abierta={!!vista}
        titulo="Vista previa · Nota de Entrada al Almacén"
        onCerrar={() => setVista(null)}
        onEmitir={() => {
          setVista(null);
          form.current?.requestSubmit();
        }}
        textoEmitir="Sí, emitir la NEA"
      >
        {vista && <FormatoNea n={vista} mcp={mcp} />}
      </VistaPrevia>
    </form>
  );
}
