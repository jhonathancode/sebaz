import { supabaseServicio } from "@/lib/supabase/server";

export type PagoPlantilla = {
  concepto: string;
  unidad: string;
  clasificador: string | null;
  documentos: string[];
  sustentos: string[];
  expediente_completo: boolean;
};

export type Plantilla = {
  sustentos_gasto: Record<string, string[]>;
  pagos: PagoPlantilla[];
  origen: string | null;
  actualizado_en: string;
};

export async function leerPlantilla(): Promise<Plantilla | null> {
  try {
    const { data, error } = await supabaseServicio().from("plantilla_config").select("*").eq("id", "general").maybeSingle();
    if (error || !data) return null;
    return { sustentos_gasto: (data.sustentos_gasto ?? {}) as Plantilla["sustentos_gasto"], pagos: (data.pagos ?? []) as PagoPlantilla[], origen: data.origen, actualizado_en: data.actualizado_en };
  } catch {
    return null;
  }
}

/** Copia la plantilla a una MCP: ajusta los pagos fijos que ya existen con el mismo concepto y crea los que faltan (sin activar: falta monto y beneficiario). */
export async function aplicarPlantilla(mcpId: string, opciones: { sobrescribirSustentos?: boolean } = {}): Promise<{ ajustados: number; creados: number; sustentos: boolean } | null> {
  const pl = await leerPlantilla();
  if (!pl) return null;
  const sb = supabaseServicio();
  let sustentos = false;
  if (Object.keys(pl.sustentos_gasto).length > 0) {
    const { data: m } = await sb.from("mcps").select("sustentos_gasto").eq("id", mcpId).single();
    const propios = Object.keys((m?.sustentos_gasto ?? {}) as object).length > 0;
    if (!propios || opciones.sobrescribirSustentos) {
      await sb.from("mcps").update({ sustentos_gasto: pl.sustentos_gasto }).eq("id", mcpId);
      sustentos = true;
    }
  }
  const { data: existentes } = await sb.from("pagos_fijos").select("id, concepto").eq("mcp_id", mcpId);
  const porConcepto = new Map((existentes ?? []).map((x) => [String(x.concepto).toUpperCase(), x.id as string]));
  let ajustados = 0;
  let creados = 0;
  for (const p of pl.pagos) {
    const campos = { unidad: p.unidad, clasificador: p.clasificador, documentos: p.documentos, sustentos: p.sustentos, expediente_completo: p.expediente_completo };
    const id = porConcepto.get(p.concepto.toUpperCase());
    if (id) {
      const { error } = await sb.from("pagos_fijos").update(campos).eq("id", id);
      if (!error) ajustados++;
    } else {
      const { error } = await sb.from("pagos_fijos").insert({ mcp_id: mcpId, concepto: p.concepto, monto: 0.01, activo: false, ...campos });
      if (!error) creados++;
    }
  }
  return { ajustados, creados, sustentos };
}
