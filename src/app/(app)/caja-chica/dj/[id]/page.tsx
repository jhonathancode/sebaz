import Link from "next/link";
import { notFound } from "next/navigation";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Firmas from "@/components/Firmas";
import { contextoMcp } from "@/lib/contexto";
import { fecha, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

/** Declaración jurada de gastos, con el formato que usan las MCP. */
export default async function DeclaracionJurada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: g } = await supabase.from("caja_chica_gastos").select("*, cajas_chicas(periodo, fuente_id)").eq("id", id).single();
  if (!g) notFound();
  const caja = g.cajas_chicas as { periodo: string; fuente_id: string } | null;
  const [a, m, d] = String(g.fecha).split("-");
  const lugar = ctx.mcp.nombre.replace(/municipalidad( del)?( centro poblado)?/i, "").trim().toUpperCase();

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href={`/caja-chica?mes=${caja?.periodo}&fuente=${caja?.fuente_id}`}>← Volver a la caja chica</Link>
        <span className="espacio" />
        <BotonPdf nombre="Declaracion jurada" />
        <BotonImprimir />
      </div>
      <div className="hoja">
        <div style={{ textAlign: "center", fontWeight: 600 }}>{ctx.mcp.nombre.toUpperCase()}</div>
        <div style={{ textAlign: "center", fontWeight: 600, fontSize: 16, marginTop: 6 }}>DECLARACIÓN JURADA DE GASTOS</div>
        <table className="formato" style={{ marginTop: 16 }}>
          <tbody>
            <tr><th style={{ width: 200 }}>Nombres y apellidos</th><td>{g.razon_social}</td></tr>
            <tr><th>Dependencia</th><td></td></tr>
            <tr><th>Motivo</th><td>{g.concepto}</td></tr>
          </tbody>
        </table>
        <p style={{ lineHeight: 1.6 }}>
          POR LA PRESENTE DECLARO BAJO JURAMENTO HABER REALIZADO GASTOS POR LOS CUALES NO ME HA SIDO POSIBLE OBTENER
          COMPROBANTE DE PAGO, DE ACUERDO CON LO ESTABLECIDO EN EL REGLAMENTO DE COMPROBANTES DE PAGO.
        </p>
        <div style={{ fontWeight: 600 }}>DETALLE DE GASTOS EFECTUADOS</div>
        <table className="formato">
          <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Importe</th></tr></thead>
          <tbody>
            <tr><td>{fecha(g.fecha)}</td><td>{g.concepto}</td><td className="num">{soles(g.monto)}</td></tr>
            <tr><th colSpan={2}>TOTAL</th><th className="num">{soles(g.monto)}</th></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 16 }}>EN FE DE LO CUAL FIRMO LA PRESENTE DECLARACIÓN.</p>
        <p>{lugar}, {Number(d)} DE {MESES[Number(m) - 1].toUpperCase()} DEL {a}</p>
        <Firmas nombres={["COMISIONADO", "TESORERO"]} />
      </div>
    </>
  );
}
