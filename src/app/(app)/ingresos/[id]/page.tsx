import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import FormatoRecibo from "@/components/formatos/FormatoRecibo";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import { contextoMcp, tiene } from "@/lib/contexto";
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
        <BotonPdf nombre="Recibo de ingreso" />
        <BotonImprimir />
        <Link className="btn" href={`/ingresos?mes=${String(r.fecha).slice(0, 7)}`}>Cerrar</Link>
      </div>
      <div className="no-imprimir"><Avisos ok={sp.ok} error={sp.error} /></div>
      {r.estado === "anulado" && <div className="aviso error">ANULADO · {r.anulado_motivo}</div>}
      <div className="documentos mesa">
        <FormatoRecibo mcp={ctx.mcp} r={{ numero: r.numero, anio: r.anio, fecha: r.fecha, pagador_nombre: r.pagador_nombre, pagador_doc: r.pagador_doc, concepto: r.concepto, monto: Number(r.monto) }} />
      </div>
    </>
  );
}
