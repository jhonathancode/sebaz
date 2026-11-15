import DocumentosExpediente from "@/components/formatos/DocumentosExpediente";
import { cargarAnexos } from "@/lib/adjuntosVista";
import type { Contexto, Mcp } from "@/lib/contexto";
import { cargarExpediente } from "@/lib/documentos";
import { codigoCP, num3 } from "@/lib/formato";
import type { supabaseServidor } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;
export type CpPaquete = { expediente_id: string | null; numero: number; origen: string };

/**
 * Lo que va detrás del informe en el paquete completo: por cada comprobante de la rendición, los documentos de su
 * expediente (requerimiento, cotizaciones, orden, conformidad, comprobante…) y sus anexos (fotos y PDF).
 */
export default async function PaqueteRendicion({ supabase, ctx, cps }: { supabase: Cliente; ctx: Contexto & { mcp: Mcp }; cps: CpPaquete[] }) {
  const [{ data: tesorero }, { data: alcalde }] = await Promise.all([
    supabase.from("miembros").select("cargo, perfiles(nombre)").eq("mcp_id", ctx.mcp.id).eq("rol", "tesorero").eq("activo", true).maybeSingle(),
    supabase.from("miembros").select("perfiles(nombre)").eq("mcp_id", ctx.mcp.id).eq("rol", "alcalde").eq("activo", true).maybeSingle(),
  ]);
  const nombreTesorero = (tesorero?.perfiles as unknown as { nombre: string } | null)?.nombre ?? "";
  const nombreAlcalde = (alcalde?.perfiles as unknown as { nombre: string } | null)?.nombre ?? "";
  const bloques = [];
  for (const cp of cps) {
    if (!cp.expediente_id) continue;
    const d = await cargarExpediente(supabase, cp.expediente_id);
    if (!d.e) continue;
    const anexos = (await cargarAnexos(supabase, ctx.mcp.id, cp.expediente_id, (d.e as { pago_fijo_id?: string | null }).pago_fijo_id ?? null, (d.e as { tipo?: string | null }).tipo ?? null)).filter((x) => x.origen !== "pendiente");
    bloques.push(
      <section key={cp.expediente_id} className="paq-exp">
        <div className="aviso info no-imprimir">
          {codigoCP(cp.numero, cp.origen)} · Expediente {num3(d.e.numero)}-{d.e.anio}
          {anexos.length ? ` · ${anexos.length} anexo(s)` : ""}
        </div>
        <DocumentosExpediente d={d} mcp={ctx.mcp} clave="todo" tesorero={nombreTesorero} cargo={tesorero?.cargo ?? "Tesorero(a)"} alcalde={nombreAlcalde} />
        {anexos.map((x) =>
          x.mime === "application/pdf" ? (
            <div key={x.clave} className="anexo-hoja" data-anexo-pdf={x.url}>
              <div className="anexo-nota"><b>ANEXO · {x.nombre.toUpperCase()}</b><span>PDF adjunto: se incluye completo en el paquete.</span></div>
            </div>
          ) : (
            <div key={x.clave} className="anexo-hoja">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="anexo-img" src={x.url} alt={x.nombre} />
            </div>
          ),
        )}
      </section>,
    );
  }
  return <div className="documentos mesa">{bloques}</div>;
}
