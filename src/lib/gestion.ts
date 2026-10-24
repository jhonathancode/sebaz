import type { SupabaseClient } from "@supabase/supabase-js";

export type Cierre = { hasta: string; bloqueo_desde: string; relevo_fecha: string };

/** Cambios de tesorería de la MCP (cada uno abre 30 días de gracia y luego bloquea lo anterior). */
export async function cargarCierres(supabase: SupabaseClient, mcpId: string): Promise<Cierre[]> {
  const { data, error } = await supabase.from("cierres_gestion").select("hasta, bloqueo_desde, relevo_fecha").eq("mcp_id", mcpId);
  return error ? [] : ((data ?? []) as Cierre[]);
}

export type EstadoGestion =
  | { estado: "bloqueado"; desde: string }
  | { estado: "gracia"; desde: string; relevo: string }
  | null;

/** ¿Un documento de esa fecha es de una gestión anterior? En gracia todavía se corrige; bloqueado ya no. */
export function estadoGestion(fecha: string, cierres: Cierre[], hoy: string): EstadoGestion {
  const aplican = cierres.filter((c) => fecha <= c.hasta);
  if (aplican.length === 0) return null;
  const bloqueado = aplican.find((c) => c.bloqueo_desde <= hoy);
  if (bloqueado) return { estado: "bloqueado", desde: bloqueado.bloqueo_desde };
  const proximo = aplican.sort((a, b) => a.bloqueo_desde.localeCompare(b.bloqueo_desde))[0];
  return { estado: "gracia", desde: proximo.bloqueo_desde, relevo: proximo.relevo_fecha };
}
