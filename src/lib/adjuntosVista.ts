import { nombreAdjunto, TIPOS_ADJUNTO } from "@/lib/adjuntosExpediente";
import { cargarArchivosPagoFijo } from "@/lib/pagosFijos";
import type { supabaseServidor } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

/**
 * propio: subido en este expediente · permanente: subido en el pago fijo (Configuración)
 * heredado: subido en otro mes del mismo pago fijo · pendiente: se pide pero aún no hay archivo
 */
export type OrigenAnexo = "propio" | "permanente" | "heredado" | "pendiente";
export type AnexoVista = { clave: string; nombre: string; tipo: string; mime: string | null; url: string; origen: OrigenAnexo };

const orden = (t: string) => TIPOS_ADJUNTO.findIndex((x) => x.clave === t);

/**
 * Documentos que acompañan al expediente, en el orden de la lista. En un pago fijo (dieta, asesor…) lo que se pide
 * se completa solo: primero lo subido en este expediente, luego lo permanente del pago fijo y, si no, lo último
 * subido en otro mes del mismo pago. Lo que aún no tiene archivo sale como pendiente.
 */
export async function cargarAnexos(supabase: Cliente, mcpId: string, expedienteId: string, pagoFijoId: string | null): Promise<AnexoVista[]> {
  const [{ data: propios }, { data: pf }] = await Promise.all([
    supabase.from("expediente_adjuntos").select("id, tipo, archivo_path, archivo_tipo, creado_en").eq("expediente_id", expedienteId).eq("anulado", false).order("creado_en"),
    pagoFijoId ? supabase.from("pagos_fijos").select("documentos").eq("id", pagoFijoId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const requeridos = ((pf as { documentos?: string[] } | null)?.documentos ?? []) as string[];
  type Crudo = { clave: string; tipo: string; path: string | null; mime: string | null; origen: OrigenAnexo };
  const crudos: Crudo[] = (propios ?? []).map((a) => ({ clave: `adj-${a.id}`, tipo: a.tipo, path: a.archivo_path, mime: a.archivo_tipo, origen: "propio" as const }));

  if (pagoFijoId && requeridos.length) {
    const sinPropio = requeridos.filter((t) => !crudos.some((c) => c.tipo === t));
    if (sinPropio.length) {
      const [permanentes, { data: hermanos }] = await Promise.all([
        cargarArchivosPagoFijo(supabase, mcpId),
        supabase.from("expedientes").select("id").eq("mcp_id", mcpId).eq("pago_fijo_id", pagoFijoId).neq("estado", "anulado"),
      ]);
      const ids = (hermanos ?? []).map((h) => h.id).filter((i) => i !== expedienteId);
      const { data: deOtros } = ids.length
        ? await supabase.from("expediente_adjuntos").select("tipo, archivo_path, archivo_tipo, creado_en").in("expediente_id", ids).in("tipo", sinPropio).eq("anulado", false).order("creado_en", { ascending: false })
        : { data: [] as { tipo: string; archivo_path: string; archivo_tipo: string | null; creado_en: string }[] };
      for (const t of sinPropio) {
        const perm = permanentes.get(`${pagoFijoId}|${t}`);
        const otro = (deOtros ?? []).find((o) => o.tipo === t);
        if (perm) crudos.push({ clave: `perm-${t}`, tipo: t, path: perm.path, mime: perm.mime, origen: "permanente" });
        else if (otro) crudos.push({ clave: `her-${t}`, tipo: t, path: otro.archivo_path, mime: otro.archivo_tipo, origen: "heredado" });
        else crudos.push({ clave: `falta-${t}`, tipo: t, path: null, mime: null, origen: "pendiente" });
      }
    }
  }
  if (crudos.length === 0) return [];
  const rutas = crudos.map((c) => c.path).filter((p): p is string => !!p);
  const { data: firmadas } = rutas.length ? await supabase.storage.from("sustentos").createSignedUrls(rutas, 3600) : { data: [] as { path: string | null; signedUrl: string }[] };
  const lista = crudos
    .map((c) => ({ ...c, url: c.path ? firmadas?.find((f) => f.path === c.path)?.signedUrl ?? "" : "" }))
    .filter((c) => c.origen === "pendiente" || c.url)
    .sort((a, b) => orden(a.tipo) - orden(b.tipo));
  const veces = new Map<string, number>();
  return lista.map((c) => {
    const n = (veces.get(c.tipo) ?? 0) + 1;
    veces.set(c.tipo, n);
    return { clave: c.clave, nombre: nombreAdjunto(c.tipo) + (n > 1 ? ` ${n}` : ""), tipo: c.tipo, mime: c.mime, url: c.url, origen: c.origen };
  });
}
