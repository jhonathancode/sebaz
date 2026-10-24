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
