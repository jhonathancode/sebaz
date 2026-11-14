import { nombreAdjunto, TIPOS_ADJUNTO } from "@/lib/adjuntosExpediente";
import { cargarArchivosPagoFijo } from "@/lib/pagosFijos";
import type { supabaseServidor } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

export type AnexoVista = { clave: string; nombre: string; tipo: string; mime: string | null; url: string; permanente: boolean };

/** Archivos que acompañan al expediente (subidos en él + permanentes del pago fijo), en el orden de la lista de documentos, con enlace para verlos. */
export async function cargarAnexos(supabase: Cliente, mcpId: string, expedienteId: string, pagoFijoId: string | null): Promise<AnexoVista[]> {
  const [{ data: subidos }, permanentes] = await Promise.all([
    supabase.from("expediente_adjuntos").select("id, tipo, archivo_path, archivo_tipo, creado_en").eq("expediente_id", expedienteId).eq("anulado", false).order("creado_en"),
    pagoFijoId ? cargarArchivosPagoFijo(supabase, mcpId) : Promise.resolve(new Map()),
  ]);
  const crudos: { clave: string; tipo: string; path: string; mime: string | null; permanente: boolean }[] = [];
  for (const a of subidos ?? []) crudos.push({ clave: `adj-${a.id}`, tipo: a.tipo, path: a.archivo_path, mime: a.archivo_tipo, permanente: false });
  for (const [k, v] of permanentes) {
    const [pf, tipo] = k.split("|");
    if (pf === pagoFijoId) crudos.push({ clave: `perm-${tipo}`, tipo, path: v.path, mime: v.mime, permanente: true });
  }
  if (crudos.length === 0) return [];
  const { data: firmadas } = await supabase.storage.from("sustentos").createSignedUrls(crudos.map((c) => c.path), 3600);
  const orden = (t: string) => TIPOS_ADJUNTO.findIndex((x) => x.clave === t);
  const lista = crudos
    .map((c) => ({ ...c, url: firmadas?.find((f) => f.path === c.path)?.signedUrl ?? "" }))
    .filter((c) => c.url)
    .sort((a, b) => orden(a.tipo) - orden(b.tipo));
  const veces = new Map<string, number>();
  return lista.map((c) => {
    const n = (veces.get(c.tipo) ?? 0) + 1;
    veces.set(c.tipo, n);
    return { clave: c.clave, nombre: nombreAdjunto(c.tipo) + (n > 1 ? ` ${n}` : ""), tipo: c.tipo, mime: c.mime, url: c.url, permanente: c.permanente };
  });
}

/** Muestra un archivo adjunto: foto o PDF. */
export const esPdf = (mime: string | null) => mime === "application/pdf";
