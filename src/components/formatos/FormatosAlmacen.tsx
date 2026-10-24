import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import type { Mcp } from "@/lib/contexto";
import { fecha, num3, soles } from "@/lib/formato";

export type ItemAlmacen = {
  codigo?: number | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
};

export type DatosNea = {
  numero: number | null;
  anio: number;
  fecha: string;
  origen: "compra" | "donacion" | "otro";
  proveedor: string | null;
  documento_ref: string | null;
  observacion: string | null;
  orden?: string | null;
  expediente?: string | null;
  anulado?: boolean;
  items: ItemAlmacen[];
};

export type DatosPecosa = {
  numero: number | null;
  anio: number;
  fecha: string;
  area_solicitante: string;
  solicitante: string | null;
  finalidad: string | null;
  anulado?: boolean;
  items: ItemAlmacen[];
};

const ORIGEN: Record<DatosNea["origen"], string> = { compra: "Compra", donacion: "Donación", otro: "Otro ingreso" };

const cant = (n: number) => Number(n).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const codigo = (c?: number | null) => (c ? String(c).padStart(5, "0") : "NUEVO");
const numeroDoc = (n: number | null, anio: number) => (n ? `${num3(n)}-${anio}` : "(se asigna al emitir)");

function Detalle({ items, costo }: { items: ItemAlmacen[]; costo: string }) {
  const total = items.reduce((s, i) => s + Math.round(i.cantidad * i.precio_unitario * 100) / 100, 0);
  return (
    <table className="formato">
      <thead>
        <tr>
          <th>Ítem</th>
          <th>Código</th>
          <th>Descripción del bien</th>
          <th>Unidad</th>
          <th className="num">Cantidad</th>
          <th className="num">{costo} S/</th>
          <th className="num">Total S/</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i, n) => (
          <tr key={n}>
            <td>{n + 1}</td>
            <td>{codigo(i.codigo)}</td>
            <td>{i.descripcion}</td>
            <td>{i.unidad}</td>
            <td className="num">{cant(i.cantidad)}</td>
            <td className="num">{soles(i.precio_unitario)}</td>
            <td className="num">{soles(i.cantidad * i.precio_unitario)}</td>
          </tr>
        ))}
        <tr>
          <th colSpan={6}>TOTAL S/</th>
          <th className="num">{soles(total)}</th>
        </tr>
      </tbody>
    </table>
  );
}

/** NEA: Nota de Entrada al Almacén. */
export function FormatoNea({ n, mcp }: { n: DatosNea; mcp: Mcp }) {
  return (
    <div className="hoja">
      {n.anulado && <div className="sello-anulado">ANULADO</div>}
      <Encabezado mcp={mcp} titulo={`NOTA DE ENTRADA AL ALMACÉN N° ${numeroDoc(n.numero, n.anio)}`} numero={`Fecha: ${fecha(n.fecha)}`} />
      <table className="formato">
        <tbody>
          <tr>
            <th style={{ width: "22%" }}>Tipo de ingreso</th>
            <td>{ORIGEN[n.origen]}</td>
            <th style={{ width: "22%" }}>Documento de sustento</th>
            <td>{n.documento_ref ?? ""}</td>
          </tr>
          <tr>
            <th>{n.origen === "compra" ? "Proveedor" : "Procedencia"}</th>
            <td>{n.proveedor ?? ""}</td>
            <th>Orden de compra / expediente</th>
            <td>{[n.orden, n.expediente].filter(Boolean).join(" · ")}</td>
          </tr>
        </tbody>
      </table>
      <Detalle items={n.items} costo="P. unitario" />
      {n.observacion && (
        <table className="formato">
          <tbody><tr><th style={{ width: "22%" }}>Observación</th><td>{n.observacion}</td></tr></tbody>
        </table>
      )}
      <Firmas nombres={["ENTREGUÉ CONFORME", "RESPONSABLE DE ALMACÉN", "V° B° TESORERÍA"]} />
    </div>
  );
}

/** PECOSA: Pedido Comprobante de Salida. */
export function FormatoPecosa({ p, mcp }: { p: DatosPecosa; mcp: Mcp }) {
  return (
    <div className="hoja">
      {p.anulado && <div className="sello-anulado">ANULADO</div>}
      <Encabezado mcp={mcp} titulo={`PEDIDO COMPROBANTE DE SALIDA (PECOSA) N° ${numeroDoc(p.numero, p.anio)}`} numero={`Fecha: ${fecha(p.fecha)}`} />
      <table className="formato">
        <tbody>
          <tr>
            <th style={{ width: "22%" }}>Área que solicita</th>
            <td>{p.area_solicitante}</td>
            <th style={{ width: "18%" }}>Solicitante</th>
            <td>{p.solicitante ?? ""}</td>
          </tr>
          <tr>
            <th>Para qué se usará</th>
            <td colSpan={3}>{p.finalidad ?? ""}</td>
          </tr>
        </tbody>
      </table>
      <Detalle items={p.items} costo="Costo unit." />
      <Firmas nombres={["SOLICITANTE", "RESPONSABLE DE ALMACÉN", "RECIBÍ CONFORME"]} />
    </div>
  );
}
