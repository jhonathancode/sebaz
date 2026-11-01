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
  declaracionJurada: "declaraciones_juradas",
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
  ingresos: { tabla: "ingresos", col: "numero" },
  rendiciones: { tabla: "rendiciones", col: "numero" },
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

/** Documentos cuyo número inicial puede cambiar la MCP (si ya avanzó con sus numeraciones). */
export const NUMERACIONES = [
  { tipo: "expedientes", nombre: "Requerimiento (expediente)", ejemplo: "N.º 004-2026" },
  { tipo: "orden_compra", nombre: "Orden de compra", ejemplo: "OC 004-2026" },
  { tipo: "orden_servicio", nombre: "Orden de servicio", ejemplo: "OS 003-2026" },
  { tipo: "memorando", nombre: "Memorando de conformidad", ejemplo: "MEMO 005-2026" },
  { tipo: "comprobantes_pago", nombre: "Comprobante de pago", ejemplo: "CP-0003" },
  { tipo: "ingresos", nombre: "Recibo de ingreso propio", ejemplo: "0001-2026" },
  { tipo: "rendiciones", nombre: "Rendición", ejemplo: "001-2026" },
  { tipo: "notas_entrada", nombre: "NEA (nota de entrada a almacén)", ejemplo: "NEA 001-2026" },
  { tipo: "pecosas", nombre: "PECOSA (salida de almacén)", ejemplo: "PECOSA 001-2026" },
  { tipo: "declaraciones_juradas", nombre: "Declaración jurada (caja chica)", ejemplo: "DJ 001-2026" },
] as const;

/** Último número ya emitido de ese tipo en el año (0 si ninguno). Cuenta también lo anulado. */
export async function ultimoEmitido(supabase: Cliente, mcpId: string, tipo: string, anio: number): Promise<number> {
  if (tipo === "declaraciones_juradas") {
    const { data } = await supabase.from("caja_chica_gastos").select("sustento_numero").eq("mcp_id", mcpId).eq("sustento_tipo", "DJ").like("sustento_numero", `%-${anio}`);
    return Math.max(0, ...((data ?? []) as { sustento_numero: string | null }[]).map((g) => parseInt(String(g.sustento_numero ?? "0"), 10) || 0));
  }
  const o = ORIGEN[tipo];
  if (!o) return 0;
  let q = supabase.from(o.tabla).select(o.col).eq("mcp_id", mcpId).eq("anio", anio);
  if (o.filtro) q = q.eq(o.filtro[0], o.filtro[1]);
  const { data } = await q.not(o.col, "is", null).order(o.col, { ascending: false }).limit(1);
  const n = Number((data as unknown as Record<string, number>[] | null)?.[0]?.[o.col] ?? 0);
  return Number.isFinite(n) ? n : 0;
}
