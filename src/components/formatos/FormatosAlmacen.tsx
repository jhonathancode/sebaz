import MarcaAnulado, { MarcaAnuladaPagina } from "@/components/MarcaAnulado";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import type { Mcp } from "@/lib/contexto";
import LogoSebaz from "@/components/LogoSebaz";
import { enLetras, fecha, num3, soles } from "@/lib/formato";

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

const ahora = () => {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour12: false }),
  };
};

/**
 * NEA: Nota de Entrada al Almacén, con el mismo formato que la orden y el requerimiento: línea del sistema,
 * título centrado con el número en recuadro y la fecha, datos del ingreso, «SON» en letras, detalle, firmas y
 * sello de ZEBAZ. Una sola hoja A4.
 */
export function FormatoNea({ n, mcp }: { n: DatosNea; mcp: Mcp }) {
  const imp = ahora();
  const [anio, mes, dia] = (n.fecha || "").slice(0, 10).split("-");
  const total = n.items.reduce((s, i) => s + Math.round(i.cantidad * i.precio_unitario * 100) / 100, 0);
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();
  const origenOrden = [n.orden, n.expediente].filter(Boolean).join(" · ");
  return (
    <div className="hoja rq nea">
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

      <div className="og-cab">
        <div className="og-titulo">NOTA DE ENTRADA AL ALMACÉN N° <span className="og-caja">{numeroDoc(n.numero, n.anio)}</span></div>
        <div className="og-fila-exp">
          <table className="og-fecha">
            <thead><tr><th>Día</th><th>Mes</th><th>Año</th></tr></thead>
            <tbody><tr><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div className="sf-linea"><span className="sf-et">TIPO DE INGRESO</span><span className="sf-val">{ORIGEN[n.origen]}</span></div>
      <div className="sf-linea"><span className="sf-et">{n.origen === "compra" ? "PROVEEDOR" : "PROCEDENCIA"}</span><span className="sf-val">{n.proveedor ?? ""}</span></div>
      {n.documento_ref && <div className="sf-linea"><span className="sf-et">DOCUMENTO</span><span className="sf-val">{n.documento_ref}</span></div>}
      {origenOrden && <div className="sf-linea"><span className="sf-et">ORDEN / EXPEDIENTE</span><span className="sf-val">{origenOrden}</span></div>}
      <div className="sf-linea"><span className="sf-et">SON</span><span className="sf-val">{enLetras(total).replace(/ SOLES$/, " NUEVOS SOLES")}</span></div>

      <div className="rq-marco">
        <div className="sf-cab">DETALLE DEL INGRESO</div>
        <div className="rq-cuerpo">
          <table className="rq-items">
            <colgroup><col style={{ width: "6%" }} /><col style={{ width: "10%" }} /><col /><col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /></colgroup>
            <thead>
              <tr><th>IT</th><th>CÓDIGO</th><th>DESCRIPCIÓN DEL BIEN</th><th>UNIDAD</th><th>CANTIDAD</th><th>P. UNITARIO S/</th><th>TOTAL S/</th></tr>
            </thead>
            <tbody>
              {n.items.map((i, k) => (
                <tr key={k}>
                  <td>{k + 1}</td><td>{codigo(i.codigo)}</td><td>{i.descripcion}</td><td>{i.unidad}</td>
                  <td>{cant(i.cantidad)}</td><td>{soles(i.precio_unitario)}</td><td>{soles(i.cantidad * i.precio_unitario)}</td>
                </tr>
              ))}
              <tr className="rq-relleno"><td /><td /><td /><td /><td /><td /><td /></tr>
            </tbody>
            <tfoot>
              <tr><th colSpan={6} className="rq-tot-et">TOTAL S/</th><th>{soles(total)}</th></tr>
            </tfoot>
          </table>
        </div>
        {n.observacion && <div className="rq-entregar"><b>OBSERVACIÓN:</b> {n.observacion}</div>}
      </div>

      <div className="rq-firmas">
        <div><b>ENTREGUÉ CONFORME</b><span /></div>
        <div><b>RESPONSABLE DE ALMACÉN</b><span /></div>
        <div><b>V°B° TESORERÍA</b><span /></div>
      </div>

      <div className="rq-pie">
        <span />
        <span className="rq-sello"><LogoSebaz tamano={26} claro={false} /></span>
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
