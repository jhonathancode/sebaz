import type { supabaseServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

/** Tipos de correlativo del sistema (los mismos que usa la base al emitir). */
export const CORRELATIVO = {
  expediente: "expedientes",
  ordenCompra: "orden_compra",
  ordenServicio: "orden_servicio",
  memorando: "memorando",
  comprobante: "comprobantes_pago",
  nea: "notas_entrada",
  pecosa: "pecosas",
} as const;

/** Número que le toca al próximo documento, para mostrarlo en la vista previa (null si no se pudo saber). */
export async function proximoNumero(supabase: Cliente, mcpId: string, tipo: string, anio: number): Promise<number | null> {
  const { data, error } = await supabase.rpc("proximo_numero", { p_mcp: mcpId, p_tipo: tipo, p_anio: anio });
  if (error || typeof data !== "number") return null;
  return data;
}
