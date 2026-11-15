import type { SupabaseClient } from "@supabase/supabase-js";
import { fecha, hoyISO, nombrePeriodo, periodoActual, periodoAnterior, rangoPeriodo, soles } from "@/lib/formato";
import type { Pendiente } from "@/lib/pendientes";

const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Lunes y domingo de la última semana ya terminada. */
export function semanaCerrada(hoy = hoyISO()): { desde: string; hasta: string } {
  const dia = new Date(`${hoy}T00:00:00Z`).getUTCDay(); // 0 domingo
  const lunesActual = sumarDias(hoy, -((dia + 6) % 7));
  return { desde: sumarDias(lunesActual, -7), hasta: sumarDias(lunesActual, -1) };
}

type Cobertura = { fecha: string; monto: number; sinDepositar: number };

/**
 * Cruza lo recaudado (recibos emitidos) con lo depositado (vouchers vigentes): los depósitos cubren
 * primero los recibos más antiguos. Devuelve cuánto de cada recibo sigue sin depositar.
 */
export async function coberturaDepositos(supabase: SupabaseClient, mcpId: string): Promise<Cobertura[]> {
  const inicio = `${Number(hoyISO().slice(0, 4)) - 1}-01-01`;
  const [{ data: ing }, { data: dep }] = await Promise.all([
    supabase.from("ingresos").select("fecha, monto").eq("mcp_id", mcpId).eq("estado", "emitido").gte("fecha", inicio).order("fecha").order("creado_en"),
    supabase.from("depositos_ingresos").select("monto").eq("mcp_id", mcpId).eq("anulado", false).gte("fecha", inicio),
  ]);
  let depositado = Math.round((dep ?? []).reduce((s, d) => s + Number(d.monto), 0) * 100);
  return (ing ?? []).map((i) => {
    const m = Math.round(Number(i.monto) * 100);
    const cubre = Math.min(m, depositado);
    depositado -= cubre;
    return { fecha: i.fecha as string, monto: m / 100, sinDepositar: (m - cubre) / 100 };
  });
}

/** Alertas de depósito de lo recaudado: al cerrar la semana y al cerrar el mes (las MCP están lejos de la ciudad, no se exige a diario). */
export async function alertasDeposito(supabase: SupabaseClient, mcpId: string): Promise<Pendiente[]> {
  const filas = await coberturaDepositos(supabase, mcpId);
  const pendientes = filas.filter((f) => f.sinDepositar > 0);
  if (!pendientes.length) return [];
  const hoy = hoyISO();
  const total = (xs: Cobertura[]) => xs.reduce((s, x) => s + x.sinDepositar, 0);
  const out: Pendiente[] = [];

  const sem = semanaCerrada(hoy);
  const deSemana = pendientes.filter((f) => f.fecha >= sem.desde && f.fecha <= sem.hasta);
  if (deSemana.length) {
    out.push({
      id: "dep-semana",
      titulo: `Cierre de semana: faltó depositar S/ ${soles(total(deSemana))}`,
      detalle: `De lo recaudado del ${fecha(sem.desde)} al ${fecha(sem.hasta)} aún no hay voucher por ese monto.`,
      enlace: "/ingresos",
      vencido: true,
    });
  }
  const mesAnt = periodoAnterior(periodoActual());
  const r = rangoPeriodo(mesAnt);
  const deMes = pendientes.filter((f) => f.fecha >= r.desde && f.fecha <= r.hasta);
  if (deMes.length) {
    out.push({
      id: "dep-mes",
      titulo: `Cierre de ${nombrePeriodo(mesAnt).split(" ")[0]}: falta depositar S/ ${soles(total(deMes))}`,
      detalle: "El mes pasado cerró con recaudación sin depositar. Regularícelo antes de la rendición.",
      enlace: "/ingresos",
      vencido: true,
    });
  }
  return out;
}
