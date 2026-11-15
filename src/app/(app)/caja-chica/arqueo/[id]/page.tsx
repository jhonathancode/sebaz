import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import { contextoMcp } from "@/lib/contexto";
import { BILLETES, MONEDAS } from "@/lib/arqueo";
import { fecha, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

/** Acta de arqueo de caja chica: efectivo contado + comprobantes frente al fondo asignado. */
export default async function ActaArqueo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: a } = await supabase.from("arqueos_caja").select("*").eq("id", id).single();
  if (!a) notFound();
  const { data: caja } = await supabase.from("cajas_chicas").select("*, perfiles(nombre)").eq("id", a.caja_id).single();
  if (!caja) notFound();
  const conteo = (a.conteo ?? {}) as Record<string, number>;
  const fila = (d: string) => {
    const n = Number(conteo[d] ?? 0);
    return (
      <tr key={d}>
        <td>S/ {d}</td><td className="num">{n}</td><td className="num">{soles(n * Number(d))}</td>
      </tr>
    );
  };
  const dif = Number(a.diferencia);
  const codigo = `${String(a.numero).padStart(3, "0")}-${a.anio}`;
  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href={`/caja-chica?mes=${caja.periodo}&fuente=${caja.fuente_id}&caja=${caja.id}`}>← Volver a la caja chica</Link>
        <span className="espacio" />
        <BotonPdf nombre={`Arqueo de caja chica ${codigo}`} />
        <BotonImprimir />
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="hoja">
        <Encabezado mcp={ctx.mcp} titulo="ACTA DE ARQUEO DE CAJA CHICA" numero={`N° ${codigo}`} />
        {a.anulado && <p style={{ color: "#a33", fontWeight: 600 }}>ARQUEO ANULADO: {a.anulado_motivo}</p>}
        <table className="formato">
          <tbody>
            <tr><th style={{ width: 200 }}>Fecha y hora</th><td>{fecha(a.fecha)}{a.hora ? ` · ${a.hora}` : ""}</td></tr>
            <tr><th>Caja chica de</th><td>{nombrePeriodo(caja.periodo).toUpperCase()}{caja.numero_cheque ? ` · CHEQUE ${caja.numero_cheque}` : ""}</td></tr>
            <tr><th>Responsable del fondo</th><td>{(caja.perfiles as { nombre: string } | null)?.nombre}</td></tr>
          </tbody>
        </table>
        <p className="pequeno" style={{ margin: "10px 0 4px" }}><b>I. Efectivo contado</b></p>
        <table className="formato">
          <thead><tr><th>Denominación</th><th className="num">Cantidad</th><th className="num">Importe S/</th></tr></thead>
          <tbody>
            {BILLETES.map(fila)}
            {MONEDAS.map(fila)}
            <tr><th colSpan={2}>TOTAL EFECTIVO</th><th className="num">{soles(a.efectivo)}</th></tr>
          </tbody>
        </table>
        <p className="pequeno" style={{ margin: "10px 0 4px" }}><b>II. Cuadre del fondo</b></p>
        <table className="formato">
          <tbody>
            <tr><td>Efectivo contado</td><td className="num">{soles(a.efectivo)}</td></tr>
            <tr><td>Comprobantes de gasto (boletas, facturas, declaraciones juradas, planillas)</td><td className="num">{soles(a.comprobantes)}</td></tr>
            <tr><th>TOTAL ARQUEADO</th><th className="num">{soles(Number(a.efectivo) + Number(a.comprobantes))}</th></tr>
            <tr><td>Fondo asignado</td><td className="num">{soles(a.fondo)}</td></tr>
            <tr><th>{dif === 0 ? "RESULTADO: EL FONDO CUADRA" : dif > 0 ? "SOBRANTE" : "FALTANTE"}</th><th className="num">{soles(Math.abs(dif))}</th></tr>
          </tbody>
        </table>
        {a.observaciones && <p className="pequeno" style={{ marginTop: 10 }}><b>Observaciones:</b> {a.observaciones}</p>}
        <Firmas nombres={["RESPONSABLE DEL FONDO", "TESORERO", "ALCALDE"]} />
      </div>
    </>
  );
}
