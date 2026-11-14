import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import EditorSecretaria from "@/components/secretaria/EditorSecretaria";
import { contextoMcp, tiene } from "@/lib/contexto";
import { tipoSec } from "@/lib/secretaria";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarBorrador } from "../../acciones";

export default async function EditarDocumento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: d } = await supabase.from("sec_documentos").select("*").eq("id", id).eq("mcp_id", ctx.mcp.id).maybeSingle();
  if (!d) notFound();
  if (d.estado !== "borrador" || !tiene(ctx, "admin", "tesorero", "contador", "alcalde")) redirect(`/secretaria/${id}`);

  return (
    <>
      <div className="titulo-ventana">
        <h1>{tipoSec(d.tipo).nombre} · borrador</h1>
        <span className="espacio" />
        <Link className="btn" href={`/secretaria/${id}`}>Ver documento</Link>
        <Link className="btn" href="/secretaria">Cerrar</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <EditorSecretaria
        accion={guardarBorrador}
        id={id}
        mcp={ctx.mcp}
        inicial={{
          tipo: d.tipo, numero: null, anio: d.anio, fecha: d.fecha, destinatario: d.destinatario, destinatario_cargo: d.destinatario_cargo,
          asunto: d.asunto, referencia: d.referencia, cuerpo: d.cuerpo, firmante: d.firmante, firmante_cargo: d.firmante_cargo, con_copia: d.con_copia,
        }}
      />
    </>
  );
}
