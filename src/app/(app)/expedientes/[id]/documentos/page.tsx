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
  // Documento anterior y siguiente (solo entre los que ya existen)
  const listos = lista.filter((x) => x.listo);
  const pos = listos.findIndex((x) => x.clave === doc);
  const vecinos = pos >= 0 ? { anterior: listos[pos - 1], siguiente: listos[pos + 1], posicion: pos + 1, total: listos.length } : null;

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

      <nav className="doc-nav no-imprimir" aria-label="Documentos del expediente">
        <Link className={`doc-tab todo${doc === "todo" ? " activo" : ""}`} aria-current={doc === "todo" ? "page" : undefined} href={`/expedientes/${id}/documentos?doc=todo`}>
          <span className="ic" aria-hidden="true">▤</span>Expediente completo
        </Link>
        <i className="doc-nav-sep" aria-hidden="true" />
        {lista.map((x, i) => (
          <span key={x.clave} className="doc-par">
            {i > 0 && <i className={`doc-sep${x.listo ? " ok" : ""}`} aria-hidden="true" />}
            {x.listo ? (
              <Link className={`doc-tab${doc === x.clave ? " activo" : ""}`} aria-current={doc === x.clave ? "page" : undefined} href={`/expedientes/${id}/documentos?doc=${x.clave}`}>
                <span className="ic" aria-hidden="true">✓</span>{x.nombre}
              </Link>
            ) : (
              <span className="doc-tab pendiente" title="Aún no existe">
                <span className="ic" aria-hidden="true" />{x.nombre}
              </span>
            )}
          </span>
        ))}
      </nav>

      {vecinos && (
        <div className="doc-pos no-imprimir">
          {vecinos.anterior ? <Link className="btn chico contorno" href={`/expedientes/${id}/documentos?doc=${vecinos.anterior.clave}`}>← {vecinos.anterior.nombre}</Link> : <span />}
          <span className="tenue pequeno">Documento {vecinos.posicion} de {vecinos.total}</span>
          {vecinos.siguiente ? <Link className="btn chico contorno" href={`/expedientes/${id}/documentos?doc=${vecinos.siguiente.clave}`}>{vecinos.siguiente.nombre} →</Link> : <span />}
        </div>
      )}

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

