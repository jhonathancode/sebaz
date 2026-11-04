import MarcaAnulado, { MarcaAnuladaPagina } from "@/components/MarcaAnulado";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import type { Mcp } from "@/lib/contexto";
import LogoSebaz from "@/components/LogoSebaz";
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
  /** Para qué es el ingreso (el motivo del requerimiento), el área responsable y la específica del gasto. */
  motivo?: string | null;
  responsable?: string | null;
  especifica?: string | null;
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

const ahora = () => {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour12: false }),
  };
};

/**
 * NEA: Nota de Entrada de Almacén, con la disposición del modelo que usan las municipalidades: hoja A4 horizontal,
 * membrete con «ALMACÉN» y el título, cuadro de datos (motivo, responsable, destino, encargado, fecha) y la tabla de
 * ítems con específica del gasto, unidad, cantidad, número de orden de compra, PECOSA y observación.
 */
export function FormatoNea({ n, mcp }: { n: DatosNea; mcp: Mcp }) {
  const imp = ahora();
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();
  return (
    <div className="hoja rq nea horizontal">
      {n.anulado && <><MarcaAnulado /><MarcaAnuladaPagina /></>}

      <div className="sf-sis">
        <div>
          <div>ZEBAZ - Módulo de Almacén</div>
          <div>{(mcp.nombre ?? "").toUpperCase()}{lugar ? ` · ${lugar}` : ""}{mcp.ruc ? ` · RUC ${mcp.ruc}` : ""}</div>
        </div>
        <div className="sf-sis-der" suppressHydrationWarning>
          <div>Fecha : {imp.fecha}</div>
          <div>Hora : {imp.hora}</div>
          <div>Pag. : 1 de 1</div>
        </div>
      </div>

      <div className="nh-cab">
        <div className="nh-ent">
          <div className="nh-mun">{(mcp.nombre ?? "").toUpperCase()}</div>
          <div className="nh-alm">ALMACÉN</div>
          <div className="nh-tit">NOTA DE ENTRADA DE ALMACÉN - NEA</div>
        </div>
        <div className="nh-num">N° <span className="og-caja">{numeroDoc(n.numero, n.anio)}</span></div>
      </div>

      <table className="nh-info">
        <tbody>
          <tr><th>MOTIVO</th><td>{n.motivo ?? ""}</td></tr>
          <tr><th>RESPONSABLE DE LA ACTIVIDAD</th><td>{n.responsable ?? ""}</td></tr>
          {n.proveedor && <tr><th>{n.origen === "compra" ? "PROVEEDOR" : "PROCEDENCIA"}</th><td>{n.proveedor}{n.documento_ref ? ` · ${n.documento_ref}` : ""}</td></tr>}
          <tr><th>DESTINO</th><td /></tr>
          <tr><th>ENCARGADO DE ALMACÉN</th><td /></tr>
          <tr><th>FECHA</th><td>{fecha(n.fecha)}</td></tr>
        </tbody>
      </table>

      <div className="rq-marco">
        <div className="rq-cuerpo">
          <table className="rq-items nh-items">
            <colgroup><col style={{ width: "6%" }} /><col /><col style={{ width: "14%" }} /><col style={{ width: "9%" }} /><col style={{ width: "7%" }} /><col style={{ width: "11%" }} /><col style={{ width: "9%" }} /><col style={{ width: "17%" }} /></colgroup>
            <thead>
              <tr><th>ÍTEM</th><th>DESCRIPCIÓN</th><th>ESPECÍFICA DE GASTO</th><th>UNID. DE MEDIDA</th><th>CANT.</th><th>N° ORDEN DE COMPRA</th><th>N° PECOSA</th><th>OBSERVACIÓN</th></tr>
            </thead>
            <tbody>
              {n.items.map((i, k) => (
                <tr key={k}>
                  <td>{String(k + 1).padStart(2, "0")}</td><td>{i.descripcion}</td><td>{n.especifica ?? ""}</td><td>{i.unidad}</td>
                  <td>{cant(i.cantidad)}</td><td>{(n.orden ?? "").replace(/^O\/[CS]\s*/, "")}</td><td /><td>{k === 0 ? n.observacion ?? "" : ""}</td>
                </tr>
              ))}
              <tr className="rq-relleno"><td /><td /><td /><td /><td /><td /><td /><td /></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rq-firmas">
        <div><b>ENTREGUÉ CONFORME</b><span /></div>
        <div><b>ENCARGADO DE ALMACÉN</b><span /></div>
        <div><b>V°B° TESORERÍA</b><span /></div>
      </div>

      <div className="rq-pie">
        <span />
        <span className="rq-sello"><LogoSebaz tamano={24} claro={false} /></span>
      </div>
    </div>
  );
}

/** PECOSA: Pedido Comprobante de Salida. */
export function FormatoPecosa({ p, mcp }: { p: DatosPecosa; mcp: Mcp }) {
  return (
    <div className="hoja">
      {p.anulado && <><MarcaAnulado /><MarcaAnuladaPagina /></>}
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
