import type { SupabaseClient } from "@supabase/supabase-js";
import { chequeMasUno, comprobanteAutomatico } from "@/lib/comprobanteAuto";
import { siguienteCheque } from "@/lib/pagosFijos";

type ConMcp = { mcp: { id: string; exigir_aprobacion?: boolean | null } };

/** Si la MCP no usa «Por aprobar», todo documento nuevo se aprueba solo. (Sin la columna se asume que sí se exige.) */
export function aprobacionAutomatica(ctx: ConMcp): boolean {
  return ctx.mcp.exigir_aprobacion === false;
}

/** Aprueba un comprobante de pago recién creado cuando la MCP no usa «Por aprobar». Devuelve true si lo aprobó. */
export async function aprobarComprobanteSiAuto(supabase: SupabaseClient, ctx: ConMcp, id: string): Promise<boolean> {
  if (!aprobacionAutomatica(ctx)) return false;
  const { error } = await supabase.from("comprobantes_pago").update({ estado: "aprobado" }).eq("id", id).eq("estado", "borrador");
  return !error;
}

/** Aprueba requerimientos recién creados (y genera el comprobante de los pagos fijos). Devuelve cuántos aprobó. */
export async function aprobarExpedientesSiAuto(supabase: SupabaseClient, ctx: ConMcp, ids: string[]): Promise<number> {
  if (!aprobacionAutomatica(ctx) || ids.length === 0) return 0;
  let cheque = await siguienteCheque(supabase, ctx.mcp.id);
  let n = 0;
  for (const id of ids) {
    const { error } = await supabase.from("expedientes").update({ estado: "aprobado" }).eq("id", id).eq("estado", "borrador");
    if (error) continue;
    n++;
    const usado = await comprobanteAutomatico(supabase, ctx.mcp.id, id, cheque, true);
    if (usado && usado === cheque) cheque = chequeMasUno(usado);
  }
  return n;
}
