import type { SupabaseClient } from "@supabase/supabase-js";
import { soles } from "@/lib/formato";

/** Un derecho de tramitación o costo de un procedimiento del TUPA (o de un servicio del TUSNE). */
export type DerechoTupa = { detalle?: string; pct?: string; monto?: number | null; texto?: string | null; gratuito?: boolean };

/** Lo que el recibo de ingreso necesita de un procedimiento (TUPA) o servicio no exclusivo (TUSNE). */
export type ProcTupa = {
  id: string;
  tipo: "tupa" | "tusne";
  area: string;
  numero: string;
  nombre: string;
  requisitos: string[];
  derechos: DerechoTupa[];
  unidad: string | null;
  plazo: string | null;
  calificacion: string | null;
  autoridad: string | null;
};

/** Quita tildes y pasa a minúsculas, para buscar sin fijarse en ellas. */
export const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El costo tal como se lee: «S/ 10.90», «GRATUITO», «S/ 11.00 - S/ 40.70»… */
export function textoCosto(d: DerechoTupa): string {
  if (d.gratuito) return "GRATUITO";
  if (d.monto != null) return `S/ ${soles(d.monto)}`;
  return d.texto || d.pct || "—";
}

/** Resumen corto del costo de un procedimiento, para la lista de resultados. */
export function resumenCosto(p: ProcTupa): string {
  const ds = p.derechos;
  if (!ds.length) return "—";
  const principal = ds.find((d) => !d.gratuito) ?? ds[0];
  return textoCosto(principal) + (ds.length > 1 ? ` +${ds.length - 1}` : "");
}

/**
 * El TUPA de la municipalidad: el propio si ya lo cargó; si no, el modelo. Si la tabla todavía no existe
 * (falta ejecutar la actualización de la base), devuelve una lista vacía y el recibo funciona como siempre.
 */
export async function cargarTupa(supabase: SupabaseClient, mcpId: string) {
  const { data, error } = await supabase
    .from("tupa_procedimientos")
    .select("id, mcp_id, tipo, area, numero, nombre, requisitos, derechos, unidad, plazo, calificacion, autoridad, fuente")
    .eq("activo", true)
    .order("orden");
  if (error || !data) return { procs: [] as ProcTupa[], modelo: false, fuente: null as string | null };
  const propios = data.filter((p) => p.mcp_id === mcpId);
  const filas = propios.length ? propios : data.filter((p) => p.mcp_id === null);
  const procs: ProcTupa[] = filas.map((p) => ({
    id: p.id, tipo: p.tipo, area: p.area, numero: p.numero, nombre: p.nombre, requisitos: p.requisitos ?? [], derechos: p.derechos ?? [],
    unidad: p.unidad, plazo: p.plazo, calificacion: p.calificacion, autoridad: p.autoridad,
  }));
  return { procs, modelo: !propios.length && procs.length > 0, fuente: (filas[0]?.fuente as string | null) ?? null };
}
