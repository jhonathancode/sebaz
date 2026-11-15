import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyISO } from "@/lib/formato";
import type { Pendiente } from "@/lib/pendientes";

/** Única alerta de patrimonio: el inventario anual. Se avisa de noviembre a marzo, hasta el 1 de marzo. */
export async function alertasInventario(supabase: SupabaseClient, mcpId: string): Promise<Pendiente[]> {
  const hoy = hoyISO();
  const anioHoy = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  if (mes > 3 && mes < 11) return [];
  const anio = mes >= 11 ? anioHoy : anioHoy - 1;
  const { data } = await supabase.from("inventarios_patrimonio").select("estado").eq("mcp_id", mcpId).eq("anio", anio).neq("estado", "anulado").maybeSingle();
  if (data?.estado === "cerrado") return [];
  const limite = `${anio + 1}-03-01`;
  const vencido = hoy > limite;
  return [{
    id: `inv-${anio}`,
    titulo: `Inventario de bienes ${anio}`,
    detalle: data ? "El inventario está en curso: verifique los bienes y ciérrelo con su acta." : "Aún no se inicia. Cree el inventario, verifique los bienes y ciérrelo con su acta.",
    enlace: "/patrimonio?vista=inventario",
    vencido,
  }];
}
