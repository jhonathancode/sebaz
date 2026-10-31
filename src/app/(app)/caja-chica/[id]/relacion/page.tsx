import Link from "next/link";
import { notFound } from "next/navigation";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import { contextoMcp } from "@/lib/contexto";
import { fecha, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

/** Relación de gastos de caja chica: va delante de los sustentos. */
export default async function Relacion({ params }: { params: Promise<{ id: string }> }) {
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
  const total = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0);

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href={`/caja-chica?mes=${caja.periodo}&fuente=${caja.fuente_id}`}>← Volver a la caja chica</Link>
        <span className="espacio" />
        <BotonPdf nombre="Relacion de gastos de caja chica" />
        <BotonImprimir />
      </div>
      <div className="hoja">
        <Encabezado mcp={ctx.mcp} titulo="RELACIÓN DE GASTOS DE CAJA CHICA" numero={nombrePeriodo(caja.periodo).toUpperCase()} />
        <table className="formato">
          <tbody>
            <tr><th style={{ width: 200 }}>Responsable del fondo</th><td>{(caja.perfiles as { nombre: string } | null)?.nombre}</td></tr>
            <tr><th>Fondo asignado</th><td>S/ {soles(caja.monto_fondo)}</td></tr>
            <tr><th>Cheque</th><td>{caja.numero_cheque ?? "—"}</td></tr>
          </tbody>
        </table>
        <table className="formato">
          <thead>
            <tr><th>N°</th><th>Fecha</th><th>CP</th><th>N° CP</th><th>Razón social</th><th>Concepto</th><th className="num">Monto</th></tr>
          </thead>
          <tbody>
            {(gastos ?? []).map((g, i) => (
              <tr key={g.id}>
                <td>{i + 1}</td><td>{fecha(g.fecha)}</td><td>{g.sustento_tipo}</td><td>{g.sustento_numero ?? "SN"}</td>
                <td>{g.razon_social}</td><td>{g.concepto}</td><td className="num">{soles(g.monto)}</td>
              </tr>
            ))}
            <tr><th colSpan={6}>TOTAL</th><th className="num">{soles(total)}</th></tr>
            <tr><td colSpan={6}>Saldo del fondo</td><td className="num">{soles(Number(caja.monto_fondo) - total)}</td></tr>
          </tbody>
        </table>
        <Firmas nombres={["RESPONSABLE DEL FONDO", "TESORERO", "ALCALDE"]} />
      </div>
    </>
  );
}
