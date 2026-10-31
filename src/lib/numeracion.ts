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

/** De dónde se lee el último número de cada tipo si la función de la base no responde. */
const ORIGEN: Record<string, { tabla: string; col: string; filtro?: [string, string] }> = {
  expedientes: { tabla: "expedientes", col: "numero" },
  orden_compra: { tabla: "ordenes", col: "numero", filtro: ["tipo", "compra"] },
  orden_servicio: { tabla: "ordenes", col: "numero", filtro: ["tipo", "servicio"] },
  memorando: { tabla: "conformidades", col: "memorando_numero" },
  comprobantes_pago: { tabla: "comprobantes_pago", col: "numero" },
  notas_entrada: { tabla: "notas_entrada", col: "numero" },
  pecosas: { tabla: "pecosas", col: "numero" },
};

/**
 * Número que le toca al próximo documento, para mostrarlo en la vista previa (null si no se pudo saber).
 * Primero se pregunta a la base; si esa función no está o no responde, se toma el último número emitido
 * del año más uno. El número real lo asigna siempre la base al emitir.
 */
export async function proximoNumero(supabase: Cliente, mcpId: string, tipo: string, anio: number): Promise<number | null> {
  const { data, error } = await supabase.rpc("proximo_numero", { p_mcp: mcpId, p_tipo: tipo, p_anio: anio });
  if (!error && typeof data === "number") return data;
  const o = ORIGEN[tipo];
  if (!o) return null;
  let q = supabase.from(o.tabla).select(o.col).eq("mcp_id", mcpId).eq("anio", anio);
  if (o.filtro) q = q.eq(o.filtro[0], o.filtro[1]);
  const { data: filas, error: e2 } = await q.not(o.col, "is", null).order(o.col, { ascending: false }).limit(1);
  if (e2) return null;
  const ultimo = Number((filas as unknown as Record<string, number>[] | null)?.[0]?.[o.col] ?? 0);
  return (Number.isFinite(ultimo) ? ultimo : 0) + 1;
}
