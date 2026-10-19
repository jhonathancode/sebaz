import Link from "next/link";
import { notFound } from "next/navigation";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import { contextoMcp } from "@/lib/contexto";
import { fecha, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

type P = Promise<{ id: string }>;
type B = Promise<{ doc?: string }>;

export default async function Imprimir({ params, searchParams }: { params: P; searchParams: B }) {
  const { id } = await params;
  const { doc = "requerimiento" } = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: e } = await supabase.from("expedientes").select("*").eq("id", id).single();
  if (!e) notFound();

  const { data: items } = await supabase.from("expediente_items").select("*").eq("expediente_id", id).eq("anulado", false).order("item");
  const { data: orden } = await supabase
    .from("ordenes")
    .select("*, proveedores(razon_social, num_doc, direccion, telefono)")
    .eq("expediente_id", id)
    .eq("anulado", false)
    .maybeSingle();
  const { data: conf } = await supabase.from("conformidades").select("*").eq("expediente_id", id).eq("anulado", false).maybeSingle();
  const { data: tesorero } = await supabase
    .from("miembros")
    .select("perfiles(nombre)")
    .eq("mcp_id", ctx.mcp.id)
    .eq("rol", "tesorero")
    .eq("activo", true)
    .maybeSingle();

  const total = (items ?? []).reduce((s, i) => s + Number(i.total), 0);
  const p = orden?.proveedores as { razon_social: string; num_doc: string; direccion: string | null; telefono: string | null } | undefined;
  const sufijo = ctx.mcp.nombre.replace(/municipalidad( del)?( centro poblado)?/i, "").trim().toUpperCase();

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href={`/expedientes/${id}`}>← Volver al expediente</Link>
        <span className="espacio" />
        <BotonImprimir />
      </div>

      {doc === "requerimiento" && (
        <div className="hoja">
          <Encabezado mcp={ctx.mcp} titulo={`CUADRO DE REQUERIMIENTO N° ${num3(e.numero)}-${e.anio}-MCP-${sufijo}`} numero={`Fecha: ${fecha(e.fecha)}`} />
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
              {(items ?? []).map((i) => (
                <tr key={i.id}><td>{i.item}</td><td>{Number(i.cantidad)}</td><td>{i.unidad}</td><td>{i.descripcion}</td><td className="num">{soles(i.precio_unitario)}</td><td className="num">{soles(i.total)}</td></tr>
              ))}
              <tr><th colSpan={5}>TOTALES</th><th className="num">{soles(total)}</th></tr>
            </tbody>
          </table>
          <Firmas nombres={["GERENCIA DE ADMINISTRACIÓN", "GERENCIA MUNICIPAL"]} />
        </div>
      )}

      {doc === "orden" && orden && (
        <div className="hoja">
          <Encabezado
            mcp={ctx.mcp}
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
              {(items ?? []).map((i) => (
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
              <tr><td>Comprobante a nombre de: <b>{ctx.mcp.nombre.toUpperCase()}</b> · RUC: {ctx.mcp.ruc ?? "________"}</td></tr>
              <tr><td>Dirección: {ctx.mcp.direccion ?? ""}</td></tr>
            </tbody>
          </table>
          <Firmas nombres={["ELABORADO POR", "ORDENACIÓN DEL SERVICIO · ALCALDE", "CONFORMIDAD DEL SERVICIO"]} />
          <p className="pequeno">
            NOTA IMPORTANTE: el proveedor debe adjuntar a su comprobante copia de esta orden. Esta orden es nula sin las firmas y sellos reglamentarios.
          </p>
        </div>
      )}

      {doc === "memorando" && conf && (
        <div className="hoja" style={{ maxWidth: 720 }}>
          <div style={{ fontWeight: 600, textAlign: "center", fontSize: 15 }}>
            MEMORANDO N° {num3(conf.memorando_numero)}-{conf.anio}-MCP-{sufijo}/ALC
          </div>
          <table className="formato" style={{ marginTop: 16 }}>
            <tbody>
              <tr><th style={{ width: 120 }}>A</th><td>{(tesorero?.perfiles as unknown as { nombre: string } | null)?.nombre ?? ""}<br />Tesorero(a) de la {ctx.mcp.nombre}</td></tr>
              <tr><th>Asunto</th><td>CONFORMIDAD DE {orden?.tipo === "compra" ? "BIENES" : "SERVICIO"}</td></tr>
              <tr><th>Fecha</th><td>{fecha(conf.fecha)}</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 18, lineHeight: 1.6 }}>{conf.texto}</p>
          <p>Atentamente,</p>
          <Firmas nombres={["ALCALDE"]} />
        </div>
      )}

      {((doc === "orden" && !orden) || (doc === "memorando" && !conf)) && (
        <div className="aviso info">Este documento todavía no existe en el expediente.</div>
      )}
    </>
  );
}
