import Encabezado from "@/components/Encabezado";
import MarcaAnulado, { MarcaAnuladaPagina } from "@/components/MarcaAnulado";
import Firmas from "@/components/Firmas";
import { extraDe } from "@/lib/datosCP";
import FormatoComprobante from "@/components/formatos/FormatoComprobante";
import type { Mcp } from "@/lib/contexto";
import type { cargarExpediente, Proveedor } from "@/lib/documentos";
import LogoSebaz from "@/components/LogoSebaz";
import { enLetras, fecha, logoMcp, num3, soles } from "@/lib/formato";
import { conceptoSinSeRequiere } from "@/lib/requerimiento";

export type DatosExpediente = Awaited<ReturnType<typeof cargarExpediente>>;
type Datos = DatosExpediente;

/** Dibuja un documento del expediente (o todos, con clave "todo") tal como se imprime. */
export default function DocumentosExpediente({
  d,
  mcp,
  clave,
  tesorero,
  cargo,
}: {
  d: Datos;
  mcp: Mcp;
  clave: string;
  tesorero: string;
  cargo: string;
}) {
  const mostrar = (c: string) => clave === "todo" || clave === c;
  return (
    <>
      {d.anulado && <MarcaAnuladaPagina />}
      {mostrar("requerimiento") && <Requerimiento d={d} mcp={mcp} />}
      {mostrar("cotizaciones") && d.cotizaciones.length > 0 && <Cotizaciones d={d} mcp={mcp} />}
      {mostrar("orden") && d.orden && <Orden d={d} mcp={mcp} />}
      {mostrar("conformidad") && d.conformidad && <Memorando d={d} mcp={mcp} tesorero={tesorero} cargo={cargo} />}
      {mostrar("comprobante") && d.cp && (
        <FormatoComprobante c={{ ...d.cp, hecho_por: (d.cp.perfiles as { nombre: string } | null)?.nombre }} mcp={mcp} extra={extraDe(d.cp, d.e, d.orden)} anulado={d.anulado ?? (d.cp.estado === "anulado" ? { motivo: d.cp.anulado_motivo, en: d.cp.anulado_en } : null)} />
      )}
    </>
  );
}

function sufijo(mcp: Mcp) {
  return mcp.nombre.replace(/municipalidad( del)?( centro poblado)?/i, "").trim().toUpperCase();
}

const ahora = () => {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour12: false }),
  };
};

/**
 * Cuadro de requerimiento con el formato de los centros poblados y la misma letra, líneas y encabezado del
 * comprobante de pago: línea del sistema, título con recuadro de fecha, «SON …» en letras, detalle con precio
 * de referencia, firmas de control posterior y el sello de ZEBAZ. Una sola hoja A4, blanco y negro, con margen
 * izquierdo para perforar.
 */
export function Requerimiento({ d, mcp }: { d: Datos; mcp: Mcp }) {
  const e = d.e!;
  const total = d.items.reduce((s, i) => s + Number(i.total), 0);
  const logo = logoMcp(mcp);
  const imp = ahora();
  const [anio, mes, dia] = (e.fecha || "").slice(0, 10).split("-");
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();
  return (
    <div className="hoja rq">
      {d.anulado && <MarcaAnulado {...d.anulado} />}

      {/* Línea del sistema, como en el comprobante */}
      <div className="sf-sis">
        <div>
          <div>ZEBAZ - Módulo de Tesorería</div>
          <div>{(mcp.nombre ?? "").toUpperCase()}{lugar ? ` · ${lugar}` : ""}{mcp.ruc ? ` · RUC ${mcp.ruc}` : ""}</div>
        </div>
        <div className="sf-sis-der" suppressHydrationWarning>
          <div>Fecha : {imp.fecha}</div>
          <div>Hora : {imp.hora}</div>
          <div>Pag. : 1 de 1</div>
        </div>
      </div>

      <div className="sf-tit-fila">
        <div className="rq-tit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" />}
          <div>
            <div className="sf-titulo">CUADRO DE REQUERIMIENTO</div>
            <div className="sf-registro">
              <span>N°</span> <b>{num3(e.numero)}-{e.anio}-MCP-{sufijo(mcp)}</b>
            </div>
          </div>
        </div>
        <table className="sf-num">
          <thead>
            <tr><th>N°</th><th>DIA</th><th>MES</th><th>AÑO</th></tr>
          </thead>
          <tbody>
            <tr><td>{e.numero ? String(e.numero).padStart(4, "0") : "—"}</td><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sf-linea"><span className="sf-et">UNIDAD ORGÁNICA</span><span className="sf-val">{e.area_usuaria ?? ""}</span></div>
      <div className="sf-linea"><span className="sf-et">PROYECTO / ACTIVIDAD</span><span className="sf-val">{e.meta ?? ""}</span></div>
      <div className="sf-linea"><span className="sf-et">ESPECÍFICA DEL GASTO</span><span className="sf-val">{e.clasificador ?? ""}</span></div>
      <div className="sf-linea"><span className="sf-et">SON</span><span className="sf-val">{enLetras(total).replace(/ SOLES$/, " NUEVOS SOLES")}</span></div>

      <div className="rq-marco">
        <div className="sf-cab">DETALLE DEL REQUERIMIENTO</div>
        <div className="rq-cuerpo">
          <table className="rq-items">
            <colgroup><col style={{ width: "6%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /><col /><col style={{ width: "14%" }} /><col style={{ width: "14%" }} /></colgroup>
            <thead>
              <tr><th rowSpan={2}>IT</th><th rowSpan={2}>CANTIDAD</th><th rowSpan={2}>UNIDAD DE MEDIDA</th><th rowSpan={2}>DESCRIPCIÓN DETALLADA</th><th colSpan={2}>PRECIO REFERENCIA (*)</th></tr>
              <tr><th>UNITARIO</th><th>TOTALES</th></tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.item}</td><td>{Number(i.cantidad)}</td><td>{i.unidad}</td><td>{i.descripcion}</td>
                  <td>S/ {soles(i.precio_unitario)}</td><td>S/ {soles(i.total)}</td>
                </tr>
              ))}
              <tr className="rq-relleno"><td /><td /><td /><td /><td /><td /></tr>
            </tbody>
            <tfoot>
              <tr><th colSpan={5} className="rq-tot-et">TOTALES</th><th>S/ {soles(total)}</th></tr>
            </tfoot>
          </table>
        </div>
        <div className="rq-entregar"><b>ENTREGAR EN:</b></div>
      </div>

      <div className="rq-control">CONTROL POSTERIOR</div>
      <div className="rq-firmas">
        <div><b>GERENCIA DE ADMINISTRACIÓN</b><span /></div>
        <div><b>GERENCIA MUNICIPAL</b><span /></div>
      </div>

      <div className="rq-pie">
        <span>(*) Precios de referencia; el monto final se define con la cotización elegida.</span>
        <span className="rq-sello"><LogoSebaz tamano={26} claro={false} /></span>
      </div>
    </div>
  );
}

function Cotizaciones({ d, mcp }: { d: Datos; mcp: Mcp }) {
  const e = d.e!;
  return (
    <div className="hoja">
      {d.anulado && <MarcaAnulado {...d.anulado} />}
      <Encabezado mcp={mcp} titulo="CUADRO COMPARATIVO DE COTIZACIONES" numero={`Requerimiento N° ${num3(e.numero)}-${e.anio}`} />
      <p style={{ margin: "12px 0 0" }}>Objeto: {conceptoSinSeRequiere(e.descripcion)}</p>
      <table className="formato">
        <thead>
          <tr><th>N°</th><th>Proveedor</th><th>RUC / DNI</th><th>Plazo</th><th className="num">Monto S/</th><th>Resultado</th></tr>
        </thead>
        <tbody>
          {d.cotizaciones.map((c, i) => {
            const p = c.proveedores as unknown as { razon_social: string; num_doc: string } | null;
            return (
              <tr key={c.id}>
                <td>{i + 1}</td><td>{p?.razon_social}</td><td>{p?.num_doc}</td><td>{c.plazo ?? ""}</td>
                <td className="num">{soles(c.monto)}</td><td>{c.elegida ? "ELEGIDA" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Firmas nombres={["ELABORADO POR", "ALCALDE"]} />
    </div>
  );
}

export function Orden({ d, mcp }: { d: Datos; mcp: Mcp }) {
  const e = d.e!;
  const orden = d.orden!;
  const p = orden.proveedores as unknown as Proveedor | null;
  return (
    <div className="hoja">
      {d.anulado && <MarcaAnulado {...d.anulado} />}
      <Encabezado
        mcp={mcp}
        titulo={`ORDEN DE ${orden.tipo === "compra" ? "COMPRA" : "SERVICIO"} N° ${num3(orden.numero)}-${orden.anio}`}
        numero={`Fecha: ${fecha(orden.fecha)}`}
      />
      <table className="formato">
        <thead><tr><th>1. Datos del proveedor</th><th>2. Condiciones generales</th></tr></thead>
        <tbody>
          <tr>
            <td>
              Señor(es): {p?.razon_social}<br />
              Dirección: {p?.direccion ?? ""}<br />
              RUC: {p?.num_doc} · Teléfono: {p?.telefono ?? ""}
            </td>
            <td>
              Plazo de ejecución: {orden.plazo ?? ""}<br />
              Tipo de proceso: {orden.tipo_proceso}<br />
              Moneda: Nacional
            </td>
          </tr>
          <tr><td colSpan={2}>Concepto: {orden.concepto}</td></tr>
        </tbody>
      </table>
      <table className="formato">
        <thead><tr><th>Cant.</th><th>Unid. med.</th><th>Descripción</th><th className="num">Precio total S/</th></tr></thead>
        <tbody>
          {d.items.map((i) => (
            <tr key={i.id}><td>{Number(i.cantidad)}</td><td>{i.unidad}</td><td>{i.descripcion}</td><td className="num"></td></tr>
          ))}
          <tr><th colSpan={3}>TOTAL S/</th><th className="num">{soles(orden.monto)}</th></tr>
        </tbody>
      </table>
      <table className="formato">
        <thead><tr><th colSpan={4}>Afectación presupuestal</th></tr><tr><th>Meta</th><th>Fuente</th><th>Clasif. de gasto</th><th className="num">Monto S/</th></tr></thead>
        <tbody><tr><td>{e.meta ?? ""}</td><td>Transferencia</td><td>{e.clasificador ?? ""}</td><td className="num">{soles(orden.monto)}</td></tr></tbody>
      </table>
      <table className="formato">
        <tbody>
          <tr><td>Comprobante a nombre de: <b>{mcp.nombre.toUpperCase()}</b> · RUC: {mcp.ruc ?? "________"}</td></tr>
          <tr><td>Dirección: {mcp.direccion ?? ""}</td></tr>
        </tbody>
      </table>
      <Firmas nombres={["ELABORADO POR", "ORDENACIÓN DEL SERVICIO · ALCALDE", "CONFORMIDAD DEL SERVICIO"]} />
      <p className="pequeno">
        NOTA IMPORTANTE: el proveedor debe adjuntar a su comprobante copia de esta orden. Esta orden es nula sin las firmas y sellos reglamentarios.
      </p>
    </div>
  );
}

export function Memorando({ d, mcp, tesorero, cargo }: { d: Datos; mcp: Mcp; tesorero: string; cargo: string }) {
  const conf = d.conformidad!;
  return (
    <div className="hoja">
      {d.anulado && <MarcaAnulado {...d.anulado} />}
      <div style={{ fontWeight: 600, textAlign: "center", fontSize: 15 }}>
        MEMORANDO N° {num3(conf.memorando_numero)}-{conf.anio}-MCP-{sufijo(mcp)}/ALC
      </div>
      <table className="formato" style={{ marginTop: 16 }}>
        <tbody>
          <tr><th style={{ width: 120 }}>A</th><td>{tesorero}<br />{cargo} de la {mcp.nombre}</td></tr>
          <tr><th>Asunto</th><td>CONFORMIDAD DE {d.orden?.tipo === "compra" ? "BIENES" : "SERVICIO"}</td></tr>
          <tr><th>Fecha</th><td>{fecha(conf.fecha)}</td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 18, lineHeight: 1.6 }}>{conf.texto}</p>
      <p>Atentamente,</p>
      <Firmas nombres={["ALCALDE"]} />
    </div>
  );
}
