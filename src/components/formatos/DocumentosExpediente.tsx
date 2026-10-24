import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import FormatoComprobante from "@/components/formatos/FormatoComprobante";
import type { Mcp } from "@/lib/contexto";
import type { cargarExpediente, Proveedor } from "@/lib/documentos";
import { fecha, num3, soles } from "@/lib/formato";

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
      {mostrar("requerimiento") && <Requerimiento d={d} mcp={mcp} />}
      {mostrar("cotizaciones") && d.cotizaciones.length > 0 && <Cotizaciones d={d} mcp={mcp} />}
      {mostrar("orden") && d.orden && <Orden d={d} mcp={mcp} />}
      {mostrar("conformidad") && d.conformidad && <Memorando d={d} mcp={mcp} tesorero={tesorero} cargo={cargo} />}
      {mostrar("comprobante") && d.cp && (
        <FormatoComprobante c={{ ...d.cp, hecho_por: (d.cp.perfiles as { nombre: string } | null)?.nombre }} mcp={mcp} />
      )}
    </>
  );
}

function sufijo(mcp: Mcp) {
  return mcp.nombre.replace(/municipalidad( del)?( centro poblado)?/i, "").trim().toUpperCase();
}

export function Requerimiento({ d, mcp }: { d: Datos; mcp: Mcp }) {
  const e = d.e!;
  const total = d.items.reduce((s, i) => s + Number(i.total), 0);
  return (
    <div className="hoja">
      <Encabezado mcp={mcp} titulo={`CUADRO DE REQUERIMIENTO N° ${num3(e.numero)}-${e.anio}-MCP-${sufijo(mcp)}`} numero={`Fecha: ${fecha(e.fecha)}`} />
      <table className="formato">
        <tbody>
          <tr><th style={{ width: 220 }}>Unidad orgánica</th><td>{e.area_usuaria ?? ""}</td></tr>
          <tr><th>Proyecto / actividad</th><td>{e.meta ?? ""}</td></tr>
          <tr><th>Específica del gasto</th><td>{e.clasificador ?? ""}</td></tr>
        </tbody>
      </table>
      <table className="formato">
        <thead>
          <tr><th>IT</th><th>Cantidad</th><th>Unidad de medida</th><th>Descripción detallada</th><th className="num">Unitario</th><th className="num">Total</th></tr>
        </thead>
        <tbody>
          {d.items.map((i) => (
            <tr key={i.id}><td>{i.item}</td><td>{Number(i.cantidad)}</td><td>{i.unidad}</td><td>{i.descripcion}</td><td className="num">{soles(i.precio_unitario)}</td><td className="num">{soles(i.total)}</td></tr>
          ))}
          <tr><th colSpan={5}>TOTALES</th><th className="num">{soles(total)}</th></tr>
        </tbody>
      </table>
      <Firmas nombres={["GERENCIA DE ADMINISTRACIÓN", "GERENCIA MUNICIPAL"]} />
    </div>
  );
}

function Cotizaciones({ d, mcp }: { d: Datos; mcp: Mcp }) {
  const e = d.e!;
  return (
    <div className="hoja">
      <Encabezado mcp={mcp} titulo="CUADRO COMPARATIVO DE COTIZACIONES" numero={`Requerimiento N° ${num3(e.numero)}-${e.anio}`} />
      <p style={{ margin: "12px 0 0" }}>Objeto: {e.descripcion}</p>
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
    <div className="hoja" style={{ maxWidth: 760 }}>
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
