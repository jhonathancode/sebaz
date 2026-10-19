import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Estado from "@/components/Estado";
import Firmas from "@/components/Firmas";
import Motivo from "@/components/Motivo";
import { contextoMcp, tiene } from "@/lib/contexto";
import { enLetras, fecha, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularRecibo } from "../acciones";

export default async function Recibo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: r } = await supabase.from("ingresos").select("*").eq("id", id).single();
  if (!r) notFound();

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <h1>Recibo de ingreso {String(r.numero).padStart(4, "0")}</h1>
        <Estado valor={r.estado} />
        <span className="espacio" />
        {r.estado === "emitido" && tiene(ctx, "admin", "tesorero", "contador") && (
          <Motivo accion={anularRecibo} boton="Anular" ayuda="Motivo de la anulación" campos={{ id }} />
        )}
        <BotonImprimir />
        <Link className="btn" href={`/ingresos?mes=${String(r.fecha).slice(0, 7)}`}>Cerrar</Link>
      </div>
      <div className="no-imprimir"><Avisos ok={sp.ok} error={sp.error} /></div>
      {r.estado === "anulado" && <div className="aviso error">ANULADO · {r.anulado_motivo}</div>}
      <div className="hoja" style={{ maxWidth: 720 }}>
        <Encabezado mcp={ctx.mcp} titulo="RECIBO DE INGRESO" numero={`N° ${String(r.numero).padStart(4, "0")}-${r.anio}`} />
        <table className="formato" style={{ marginTop: 14 }}>
          <tbody>
            <tr><th style={{ width: 160 }}>Fecha</th><td>{fecha(r.fecha)}</td></tr>
            <tr><th>Recibí de</th><td>{r.pagador_nombre}{r.pagador_doc && ` · ${r.pagador_doc}`}</td></tr>
            <tr><th>La suma de</th><td>{enLetras(r.monto)}</td></tr>
            <tr><th>Por concepto de</th><td>{r.concepto}</td></tr>
            <tr><th>Importe</th><td><b>S/ {soles(r.monto)}</b></td></tr>
          </tbody>
        </table>
        <Firmas nombres={["TESORERO", "RECIBÍ CONFORME"]} />
      </div>
    </>
  );
}
