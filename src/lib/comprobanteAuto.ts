import type { supabaseServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

/** Suma 1 a un número de cheque guardando los mismos dígitos ("000123" → "000124"). */
export function chequeMasUno(cheque: string): string {
  if (!cheque) return "";
  return String(BigInt(cheque) + BigInt(1)).padStart(cheque.length, "0");
}

/**
 * Pago fijo de la lista ya aprobado: genera solo su comprobante de pago (en
 * borrador) con el beneficiario de la lista y el cheque indicado. Devuelve el
 * cheque usado, o null si no correspondía (no es pago fijo de la lista, no hay
 * beneficiario o ya tiene comprobante).
 */
export async function comprobanteAutomatico(
  supabase: Cliente,
  mcpId: string,
  expedienteId: string,
  cheque: string,
  aprobar = false,
): Promise<string | null> {
  const { data: e } = await supabase
    .from("expedientes")
    .select("id, tipo, estado, fecha, descripcion, fuente_id, clasificador, pago_fijo_id, cheque_previsto, expediente_items(total, anulado)")
    .eq("id", expedienteId)
    .single();
  if (!e || e.tipo !== "pago_fijo" || e.estado !== "aprobado" || !e.pago_fijo_id || !e.fuente_id) return null;
  const { data: pf } = await supabase.from("pagos_fijos").select("beneficiario, beneficiario_doc").eq("id", e.pago_fijo_id).single();
  if (!pf?.beneficiario) return null;
  const { data: ya } = await supabase.from("comprobantes_pago").select("id").eq("expediente_id", e.id).neq("estado", "anulado").limit(1);
  if (ya && ya.length) return null;
  const importe = (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0);
  if (importe <= 0) return null;
  const numeroCheque = e.cheque_previsto || cheque;
  const { data: cp, error } = await supabase.from("comprobantes_pago").insert({
    mcp_id: mcpId,
    fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
    origen: "expediente",
    expediente_id: e.id,
    fuente_id: e.fuente_id,
    beneficiario: pf.beneficiario,
    beneficiario_doc: pf.beneficiario_doc,
    concepto: e.descripcion,
    importe,
    partida: e.clasificador,
    sustento_tipo: "REC",
    cheque: numeroCheque || null,
  }).select("id").single();
  if (error || !cp) return null;
  await supabase.from("expedientes").update({ fase: "comprobante" }).eq("id", e.id);
  // Quien aprobó el pago fijo aprueba también su comprobante (mismo monto, mismo beneficiario)
  if (aprobar) await supabase.from("comprobantes_pago").update({ estado: "aprobado" }).eq("id", cp.id);
  return numeroCheque || "";
}
