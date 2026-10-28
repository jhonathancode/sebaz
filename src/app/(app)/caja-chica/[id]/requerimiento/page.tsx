import Link from "next/link";
import { notFound } from "next/navigation";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import { contextoMcp } from "@/lib/contexto";
import { fecha, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const NOMBRE_SUSTENTO: Record<string, string> = {
  DJ: "Declaración jurada",
  BV: "Boleta de venta",
  BVE: "Boleta de venta electrónica",
  FAC: "Factura",
  RH: "Recibo por honorarios",
  REC: "Recibo",
  PM: "Planilla de movilidad",
  TICKET: "Ticket",
};

/** Requerimiento de caja chica: resumen de todos los gastos y detalle de cada boleta, factura o declaración jurada. */
export default async function RequerimientoCajaChica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: caja } = await supabase.from("cajas_chicas").select("*, perfiles(nombre)").eq("id", id).single();
  if (!caja) notFound();
  const { data: gastos } = await supabase
    .from("caja_chica_gastos")
    .select("*")
    .eq("caja_id", id)
    .eq("anulado", false)
    .order("fecha")
    .order("creado_en");
  const lista = gastos ?? [];
  const total = lista.reduce((s, g) => s + Number(g.monto), 0);
  const fondo = Number(caja.monto_fondo);
  const fuente = ctx.fuentes.find((f) => f.id === caja.fuente_id)?.municipalidad ?? "";

  const resumen = new Map<string, { n: number; total: number }>();
  lista.forEach((g) => {
    const r = resumen.get(g.sustento_tipo) ?? { n: 0, total: 0 };
    resumen.set(g.sustento_tipo, { n: r.n + 1, total: r.total + Number(g.monto) });
  });

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href={`/caja-chica?mes=${caja.periodo}&fuente=${caja.fuente_id}`}>← Volver a la caja chica</Link>
        <span className="espacio" />
        <BotonPdf nombre="Requerimiento de caja chica" />
        <BotonImprimir />
      </div>
      <div className="hoja">
        <Encabezado mcp={ctx.mcp} titulo="CUADRO DE REQUERIMIENTO DE CAJA CHICA" numero={nombrePeriodo(caja.periodo).toUpperCase()} />
        <table className="formato">
          <tbody>
            <tr><th style={{ width: 220 }}>Responsable del fondo</th><td>{(caja.perfiles as { nombre: string } | null)?.nombre}</td></tr>
            <tr><th>Se paga con</th><td>{fuente}</td></tr>
            <tr><th>Específica del gasto</th><td>2.3 Bienes y servicios</td></tr>
            <tr><th>Fondo asignado</th><td>S/ {soles(fondo)}</td></tr>
          </tbody>
        </table>

        <p style={{ margin: "14px 0 4px", fontWeight: 700 }}>1. RESUMEN DE GASTOS</p>
        <table className="formato">
          <thead>
            <tr><th>Sustento</th><th>Cantidad</th><th className="num">Total S/</th></tr>
          </thead>
          <tbody>
            {[...resumen].map(([t, v]) => (
              <tr key={t}><td>{NOMBRE_SUSTENTO[t] ?? t}</td><td>{v.n}</td><td className="num">{soles(v.total)}</td></tr>
            ))}
            <tr><th>TOTAL GASTADO</th><th>{lista.length}</th><th className="num">{soles(total)}</th></tr>
            <tr><td colSpan={2}>Saldo del fondo</td><td className="num">{soles(fondo - total)}</td></tr>
          </tbody>
        </table>

        <p style={{ margin: "14px 0 4px", fontWeight: 700 }}>2. DETALLE: BOLETAS, FACTURAS Y DEMÁS SUSTENTOS</p>
        <table className="formato">
          <thead>
            <tr><th>IT</th><th>Fecha</th><th>Sustento</th><th>N°</th><th>Proveedor</th><th>Descripción</th><th className="num">Total S/</th></tr>
          </thead>
          <tbody>
            {lista.map((g, i) => (
              <tr key={g.id}>
                <td>{i + 1}</td><td>{fecha(g.fecha)}</td><td>{g.sustento_tipo}</td><td>{g.sustento_numero ?? "SN"}</td>
                <td>{g.razon_social}</td><td>{g.concepto}</td><td className="num">{soles(g.monto)}</td>
              </tr>
            ))}
            <tr><th colSpan={6}>TOTAL</th><th className="num">{soles(total)}</th></tr>
          </tbody>
        </table>
        <Firmas nombres={["RESPONSABLE DEL FONDO", "TESORERO", "ALCALDE"]} />
      </div>
    </>
  );
}
