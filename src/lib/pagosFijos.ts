import { MESES, periodoAnterior, rangoPeriodo } from "./formato";
import type { supabaseServidor } from "./supabase/server";

const NOMBRES_MES = [...MESES, "septiembre"];
const RE_MES = new RegExp(`\\b(${NOMBRES_MES.join("|")})\\b`, "gi");

/** Clave para reconocer el mismo pago fijo en meses distintos (sin mes ni año). */
export function clavePagoFijo(descripcion: string): string {
  return descripcion
    .toLocaleUpperCase("es-PE")
    .replace(RE_MES, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/[^A-ZÁÉÍÓÚÑÜ0-9]+/g, " ")
    .trim();
}

/** Cambia el mes (y el año si cambió) dentro de un texto: "DIETA DE SETIEMBRE 2026" → "DIETA DE OCTUBRE 2026". */
export function pasarAlMes(texto: string, de: string, a: string): string {
  const [anioDe] = de.split("-");
  const [anioA, mesA] = a.split("-");
  let t = texto.replace(RE_MES, MESES[Number(mesA) - 1].toLocaleUpperCase("es-PE"));
  if (anioDe !== anioA) t = t.replace(new RegExp(`\\b${anioDe}\\b`, "g"), anioA);
  return t.toLocaleUpperCase("es-PE");
}

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

export type PagoFijo = {
  id: string;
  descripcion: string;
  fuente_id: string | null;
  area_usuaria: string | null;
  meta: string | null;
  clasificador: string | null;
  monto: number;
};

/** Pagos fijos del mes anterior y cuáles faltan registrar en este mes. */
export async function estadoPagosFijos(supabase: Cliente, mcpId: string, periodo: string) {
  const anterior = periodoAnterior(periodo);
  const ra = rangoPeriodo(anterior);
  const rb = rangoPeriodo(periodo);
  const consulta = (desde: string, hasta: string) =>
    supabase
      .from("expedientes")
      .select("id, descripcion, fuente_id, area_usuaria, meta, clasificador, expediente_items(total, anulado)")
      .eq("mcp_id", mcpId)
      .eq("tipo", "pago_fijo")
      .neq("estado", "anulado")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("numero");
  const [{ data: ant }, { data: act }] = await Promise.all([consulta(ra.desde, ra.hasta), consulta(rb.desde, rb.hasta)]);
  const aPago = (x: NonNullable<typeof ant>[number]): PagoFijo => ({
    id: x.id,
    descripcion: x.descripcion,
    fuente_id: x.fuente_id,
    area_usuaria: x.area_usuaria,
    meta: x.meta,
    clasificador: x.clasificador,
    monto: (x.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
  });
  const anteriores = (ant ?? []).map(aPago);
  const actuales = (act ?? []).map(aPago);
  const ya = new Set(actuales.map((p) => clavePagoFijo(p.descripcion)));
  const faltan = anteriores.filter((p) => !ya.has(clavePagoFijo(p.descripcion)));
  return { anterior, anteriores, actuales, faltan };
}

/** Un pago fijo de la lista de la MCP, con los meses que ya se pagaron ("2026-01", ...). */
export type PagoFijoCatalogo = {
  id: string;
  concepto: string;
  beneficiario: string | null;
  beneficiario_doc: string | null;
  monto: number;
  unidad: string;
  fuente_id: string | null;
  clasificador: string | null;
  activo: boolean;
  pagados: string[];
  /** Redacción de la última vez (ya aprobada o mejorada): se reutiliza cambiando solo el mes y el año. */
  descripcion_modelo: string | null;
  mes_modelo: string | null;
};

/** Lista de pagos fijos y meses pagados (vacía si la base aún no tiene la actualización). */
export async function cargarCatalogoPagosFijos(supabase: Cliente, mcpId: string, soloActivos = true): Promise<PagoFijoCatalogo[]> {
  let c = supabase.from("pagos_fijos").select("*").eq("mcp_id", mcpId).order("concepto");
  if (soloActivos) c = c.eq("activo", true);
  const [{ data: lista, error }, { data: hechos }] = await Promise.all([
    c,
    supabase.from("expedientes").select("pago_fijo_id, mes_pagado").eq("mcp_id", mcpId).not("pago_fijo_id", "is", null).neq("estado", "anulado"),
  ]);
  if (error || !lista) return [];
  const porPago = new Map<string, string[]>();
  (hechos ?? []).forEach((h) => {
    if (!h.pago_fijo_id || !h.mes_pagado) return;
    porPago.set(h.pago_fijo_id, [...(porPago.get(h.pago_fijo_id) ?? []), h.mes_pagado]);
  });
  return lista.map((p) => ({
    id: p.id,
    concepto: p.concepto,
    beneficiario: p.beneficiario,
    beneficiario_doc: p.beneficiario_doc,
    monto: Number(p.monto),
    unidad: p.unidad ?? "MES",
    fuente_id: p.fuente_id,
    clasificador: p.clasificador,
    activo: p.activo,
    pagados: (porPago.get(p.id) ?? []).sort(),
    descripcion_modelo: (p.descripcion_modelo as string | null | undefined) ?? null,
    mes_modelo: (p.mes_modelo as string | null | undefined) ?? null,
  }));
}

/** Primer mes del año sin pagar hasta el mes actual; si todos están pagados, el siguiente. */
export function mesPendiente(pagados: string[], periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  for (let m = 1; m <= mes; m++) {
    const p = `${anio}-${String(m).padStart(2, "0")}`;
    if (!pagados.includes(p)) return p;
  }
  for (let m = mes + 1; m <= 12; m++) {
    const p = `${anio}-${String(m).padStart(2, "0")}`;
    if (!pagados.includes(p)) return p;
  }
  return `${anio + 1}-01`;
}

/** Siguiente número de la chequera: el cheque más alto usado + 1 (con los mismos dígitos). */
export async function siguienteCheque(supabase: Cliente, mcpId: string): Promise<string> {
  const { data } = await supabase
    .from("comprobantes_pago")
    .select("cheque")
    .eq("mcp_id", mcpId)
    .not("cheque", "is", null)
    .order("creado_en", { ascending: false })
    .limit(200);
  const { data: previstos } = await supabase
    .from("expedientes")
    .select("cheque_previsto")
    .eq("mcp_id", mcpId)
    .not("cheque_previsto", "is", null)
    .neq("estado", "anulado")
    .order("creado_en", { ascending: false })
    .limit(100);
  let mayor = "";
  for (const c of [...(data ?? []), ...(previstos ?? []).map((p) => ({ cheque: p.cheque_previsto }))]) {
    const v = String(c.cheque ?? "").replace(/\D/g, "");
    if (v && (v.length > mayor.length || (v.length === mayor.length && v > mayor))) mayor = v;
  }
  if (!mayor) return "";
  const sig = String(BigInt(mayor) + BigInt(1));
  return sig.padStart(mayor.length, "0");
}
