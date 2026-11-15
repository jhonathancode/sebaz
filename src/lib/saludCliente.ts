import type { SupabaseClient } from "@supabase/supabase-js";

export type Paso = { texto: string; ok: boolean; detalle?: string };
export type Senal = { texto: string; valor: string; nivel: "ok" | "alerta" | "mal" };

const dias = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

/** Qué le falta a un cliente nuevo para trabajar y cómo va su uso (para el superadmin). */
export async function saludCliente(supabase: SupabaseClient, mcp: { id: string; ruc: string | null; direccion: string | null; logo_path: string | null; banco_cuenta: string | null; exigir_pin: boolean | null }) {
  const id = mcp.id;
  const mes = new Date().toISOString().slice(0, 7);
  const [{ count: nFuentes }, { count: nCuentas }, { count: nPagos }, { data: miembros }, { data: ultimaAct }, { count: nExpMes }, { data: pendAprob }, { data: cps }, { data: cobrados }, { data: rends }] = await Promise.all([
    supabase.from("fuentes").select("id", { count: "exact", head: true }).eq("mcp_id", id).eq("activo", true),
    supabase.from("cuentas_bancarias").select("id", { count: "exact", head: true }).eq("mcp_id", id).eq("activo", true),
    supabase.from("pagos_fijos").select("id", { count: "exact", head: true }).eq("mcp_id", id).eq("activo", true),
    supabase.from("miembros").select("rol").eq("mcp_id", id).eq("activo", true),
    supabase.from("auditoria").select("en").eq("mcp_id", id).order("en", { ascending: false }).limit(1),
    supabase.from("expedientes").select("id", { count: "exact", head: true }).eq("mcp_id", id).gte("fecha", `${mes}-01`),
    supabase.from("expedientes").select("fecha").eq("mcp_id", id).eq("estado", "borrador").order("fecha").limit(1),
    supabase.from("comprobantes_pago").select("id, fecha").eq("mcp_id", id).eq("estado", "emitido"),
    supabase.from("cheques_cobrados").select("comprobante_id").eq("mcp_id", id).eq("anulado", false),
    supabase.from("rendiciones").select("periodo, estado").eq("mcp_id", id).neq("estado", "anulada").order("periodo", { ascending: false }).limit(1),
  ]);
  const roles = new Set((miembros ?? []).map((x) => x.rol));
  const pasos: Paso[] = [
    { texto: "Datos de la MCP (RUC y dirección)", ok: !!mcp.ruc && !!mcp.direccion, detalle: "Salen en el encabezado de todos los formatos." },
    { texto: "Logo cargado", ok: !!mcp.logo_path },
    { texto: "Fuente de ingresos (transferencias)", ok: (nFuentes ?? 0) > 0 },
    { texto: "Cuenta bancaria", ok: !!mcp.banco_cuenta || (nCuentas ?? 0) > 0 },
    { texto: "Alcalde y tesorero con usuario", ok: roles.has("alcalde") && roles.has("tesorero") },
    { texto: "Pagos fijos configurados (dietas, personal, servicios)", ok: (nPagos ?? 0) > 0 },
    { texto: "PIN personal activado", ok: !!mcp.exigir_pin },
  ];
  const ult = dias(ultimaAct?.[0]?.en);
  const cobradosSet = new Set((cobrados ?? []).map((c) => c.comprobante_id));
  const viejos = (cps ?? []).filter((c) => !cobradosSet.has(c.id) && (dias(c.fecha) ?? 0) > 60).length;
  const antiguo = dias(pendAprob?.[0]?.fecha);
  const ultRend = rends?.[0]?.periodo ?? null;
  const senales: Senal[] = [
    { texto: "Última actividad", valor: ult === null ? "Nunca" : ult === 0 ? "Hoy" : `Hace ${ult} día(s)`, nivel: ult === null || ult > 30 ? "mal" : ult > 10 ? "alerta" : "ok" },
    { texto: "Requerimientos del mes", valor: String(nExpMes ?? 0), nivel: (nExpMes ?? 0) > 0 ? "ok" : "alerta" },
    { texto: "Requerimiento más antiguo por aprobar", valor: antiguo === null ? "Ninguno" : `Hace ${antiguo} día(s)`, nivel: antiguo === null ? "ok" : antiguo > 15 ? "mal" : antiguo > 7 ? "alerta" : "ok" },
    { texto: "Cheques con más de 60 días sin cobrar", valor: String(viejos), nivel: viejos === 0 ? "ok" : "alerta" },
    { texto: "Última rendición", valor: ultRend ?? "Ninguna", nivel: !ultRend ? "alerta" : ultRend < new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 7) ? "alerta" : "ok" },
  ];
  return { pasos, senales };
}
