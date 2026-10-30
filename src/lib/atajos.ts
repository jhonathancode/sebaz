import type { SupabaseClient } from "@supabase/supabase-js";

export type Plantilla = {
  tipo: "compra" | "servicio";
  fuente_id: string | null;
  descripcion: string;
  clasificador: string | null;
  items: { cantidad: string; unidad: string; descripcion: string; precio: string }[];
};
export type ItemHistorial = { descripcion: string; unidad: string; precio: number };

type Fila = {
  tipo: string;
  fuente_id: string | null;
  descripcion: string | null;
  clasificador: string | null;
  expediente_items: { cantidad: number; unidad: string; descripcion: string; precio_unitario: number; anulado: boolean; item: number }[];
};

/**
 * Atajos para registrar más rápido, sacados de los últimos requerimientos del propio MCP:
 * plantillas (compras y servicios repetidos), la fuente de dinero más usada y los ítems ya
 * comprados con su última unidad y precio. No guarda nada nuevo en la base.
 */
export async function cargarAtajos(supabase: SupabaseClient, mcpId: string) {
  const { data } = await supabase
    .from("expedientes")
    .select("tipo, fuente_id, descripcion, clasificador, expediente_items(cantidad, unidad, descripcion, precio_unitario, anulado, item)")
    .eq("mcp_id", mcpId)
    .neq("estado", "anulado")
    .neq("tipo", "pago_fijo")
    .order("fecha", { ascending: false })
    .order("numero", { ascending: false })
    .limit(60);
  const filas = (data ?? []) as unknown as Fila[];

  const plantillas: Plantilla[] = [];
  const vistas = new Set<string>();
  const usoFuente = new Map<string, number>();
  const historial: ItemHistorial[] = [];
  const itemsVistos = new Set<string>();

  for (const f of filas) {
    if (f.fuente_id) usoFuente.set(f.fuente_id, (usoFuente.get(f.fuente_id) ?? 0) + 1);
    const items = [...f.expediente_items].filter((i) => !i.anulado).sort((a, b) => a.item - b.item);
    for (const i of items) {
      const clave = i.descripcion.trim().toUpperCase();
      if (!itemsVistos.has(clave)) {
        itemsVistos.add(clave);
        historial.push({ descripcion: i.descripcion, unidad: i.unidad, precio: Number(i.precio_unitario) });
      }
    }
    const resumen = (f.descripcion ?? "").trim();
    if (!resumen || !items.length || vistas.has(resumen.toUpperCase()) || plantillas.length >= 6) continue;
    vistas.add(resumen.toUpperCase());
    plantillas.push({
      tipo: f.tipo === "servicio" ? "servicio" : "compra",
      fuente_id: f.fuente_id,
      descripcion: resumen,
      clasificador: f.clasificador,
      items: items.map((i) => ({ cantidad: String(i.cantidad), unidad: i.unidad, descripcion: i.descripcion, precio: String(i.precio_unitario) })),
    });
  }
  const fuenteFrecuente = [...usoFuente.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { plantillas, historial: historial.slice(0, 150), fuenteFrecuente };
}
