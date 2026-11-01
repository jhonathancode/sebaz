import type { SupabaseClient } from "@supabase/supabase-js";
import { diasHasta, fechaLarga, fechaLimite, nombrePeriodo, periodoActual, periodoAnterior, rangoPeriodo, soles } from "@/lib/formato";

export type Pendiente = {
  id: string;
  titulo: string;
  detalle: string;
  enlace: string;
  /** true si ya pasó la fecha límite */
  vencido: boolean;
};

/** «faltan 5 días», «vence hoy», «venció hace 3 días» */
export function cuentaRegresiva(dias: number) {
  if (dias > 1) return `faltan ${dias} días`;
  if (dias === 1) return "vence mañana";
  if (dias === 0) return "vence hoy";
  return `venció hace ${-dias} día${dias === -1 ? "" : "s"}`;
}

/** Rendiciones del mes pasado que aún no se arman (una por municipalidad). Salen en la campana. */
export async function rendicionesAtrasadas(
  supabase: SupabaseClient,
  mcpId: string,
  fuentes: { id: string; tipo: string; municipalidad: string; dia_limite?: number | null }[],
): Promise<Pendiente[]> {
  const anterior = periodoAnterior(periodoActual());
  const rango = rangoPeriodo(anterior);
  const [{ data: cps }, { data: rends }] = await Promise.all([
    supabase.from("comprobantes_pago").select("fuente_id, importe, estado").eq("mcp_id", mcpId).in("estado", ["borrador", "aprobado"]).gte("fecha", rango.desde).lte("fecha", rango.hasta),
    supabase.from("rendiciones").select("fuente_id").eq("mcp_id", mcpId).eq("periodo", anterior).neq("estado", "anulada"),
  ]);
  const mes = nombrePeriodo(anterior).split(" ")[0];
  return fuentes
    .filter((f) => f.tipo !== "propios")
    .map((f) => {
      const sin = (cps ?? []).filter((c) => c.fuente_id === f.id);
      const limite = fechaLimite(anterior, f.dia_limite);
      const dias = diasHasta(limite);
      return { f, n: sin.length, monto: sin.reduce((s, c) => s + Number(c.importe), 0), limite, dias };
    })
    .filter((a) => a.n > 0 && !(rends ?? []).some((r) => r.fuente_id === a.f.id))
    .map((a) => ({
      id: `rend-${a.f.id}`,
      titulo: `Falta la rendición de ${mes} a ${a.f.municipalidad}`,
      detalle: `${a.n} comprobante(s) por S/ ${soles(a.monto)} sin rendir · límite ${fechaLarga(a.limite)} (${cuentaRegresiva(a.dias)})`,
      enlace: `/rendicion?fuente=${a.f.id}&mes=${anterior}`,
      vencido: a.dias < 0,
    }));
}
