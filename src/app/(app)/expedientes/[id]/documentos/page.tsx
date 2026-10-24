import Link from "next/link";
import { notFound } from "next/navigation";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir, { ImprimirAlAbrir } from "@/components/BotonImprimir";
import Estado from "@/components/Estado";
import DocumentosExpediente from "@/components/formatos/DocumentosExpediente";
import { contextoMcp } from "@/lib/contexto";
import { cargarExpediente, listaDocumentos } from "@/lib/documentos";
import { num3 } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

/**
 * Todos los documentos de un expediente de gasto en un solo lugar: se ve uno
 * por uno o el expediente completo, en el orden del archivo físico.
 */
export default async function Documentos({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; imprimir?: string }>;
}) {
  const { id } = await params;
  const { doc = "todo", imprimir } = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const [d, { data: tesorero }] = await Promise.all([
    cargarExpediente(supabase, id),
    supabase.from("miembros").select("cargo, perfiles(nombre)").eq("mcp_id", ctx.mcp.id).eq("rol", "tesorero").eq("activo", true).maybeSingle(),
  ]);
  if (!d.e) notFound();
  const e = d.e;
  const lista = listaDocumentos(d);
  const nombreTesorero = (tesorero?.perfiles as unknown as { nombre: string } | null)?.nombre ?? "";
  const elegido = lista.find((x) => x.clave === doc);

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href={`/expedientes/${id}`}>← Volver al expediente</Link>
        <h1>
          Documentos · Expediente {num3(e.numero)}-{e.anio}
        </h1>
        <Estado valor={e.estado} />
        <span className="espacio" />
        <BotonPdf nombre={`Expediente ${num3(e.numero)}-${e.anio}${doc === "todo" ? "" : " " + doc}`} className="btn primario" />
        <BotonImprimir texto={doc === "todo" ? "Imprimir todo" : "Imprimir"} />
        {imprimir === "1" && <ImprimirAlAbrir />}
      </div>

      <div className="pestanas no-imprimir" role="tablist" aria-label="Documentos">
        <Link role="tab" aria-selected={doc === "todo"} className={doc === "todo" ? "activo" : undefined} href={`/expedientes/${id}/documentos?doc=todo`}>
          Expediente completo
        </Link>
        {lista.map((x) =>
          x.listo ? (
            <Link key={x.clave} role="tab" aria-selected={doc === x.clave} className={doc === x.clave ? "activo" : undefined} href={`/expedientes/${id}/documentos?doc=${x.clave}`}>
              {x.nombre}
            </Link>
          ) : (
            <span key={x.clave} className="tenue" title="Aún no existe" style={{ opacity: 0.55 }}>
              {x.nombre}
            </span>
          ),
        )}
      </div>

      {elegido && !elegido.listo && <div className="aviso info">Este documento todavía no existe en el expediente.</div>}
      {doc === "todo" && (
        <div className="aviso info no-imprimir">
          {lista.filter((x) => x.listo).length} de {lista.length} documentos listos. Se imprimen en este orden, cada uno en su hoja.
        </div>
      )}

      <div className="documentos mesa">
        <DocumentosExpediente d={d} mcp={ctx.mcp} clave={doc} tesorero={nombreTesorero} cargo={tesorero?.cargo ?? "Tesorero(a)"} />
      </div>
    </>
  );
}

