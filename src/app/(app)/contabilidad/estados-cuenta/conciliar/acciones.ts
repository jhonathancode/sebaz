"use server";

import { revalidatePath } from "next/cache";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { contextoMcp, tiene } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";

const RUTA = "/contabilidad/estados-cuenta/conciliar";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, "").replace(/\s/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

type EnlaceEntrada = { tipo?: string; id?: string; periodo?: string; etiqueta?: string; extra?: { id?: string; etiqueta?: string }[] } | null;
type LineaEntrada = { codigo?: string; cargo?: string; abono?: string; saldo?: string; dia?: string; enlace?: EnlaceEntrada };

const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
function limpiarEnlace(e: EnlaceEntrada | undefined) {
  if (!e || !["cp", "transferencia", "ingresos", "banco", "otro"].includes(e.tipo ?? "")) return null;
  return {
    tipo: e.tipo,
    ...(esUuid(e.id) ? { id: e.id } : {}),
    ...(typeof e.periodo === "string" && /^\d{4}-\d{2}$/.test(e.periodo) ? { periodo: e.periodo } : {}),
    etiqueta: String(e.etiqueta ?? "").slice(0, 160),
    ...(e.tipo === "cp" && Array.isArray(e.extra) ? { extra: e.extra.filter((x) => esUuid(x?.id)).slice(0, 20).map((x) => ({ id: x.id as string, etiqueta: String(x.etiqueta ?? "").slice(0, 160) })) } : {}),
  };
}

/** Guarda lo que la tesorera copió del estado de cuenta (cabecera, líneas y totales del PDF). */
export async function guardarTranscripcion(fd: FormData) {
  const ctx = await contextoMcp();
  const periodo = texto(fd, "periodo") ?? "";
  const destino = `${RUTA}?mes=${periodo}`;
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(destino, "error", "No tiene permiso para guardar.");
  if (!/^\d{4}-\d{2}$/.test(periodo)) volver(RUTA, "error", "Mes no válido.");
  let datos: { cab?: Record<string, string>; lineas?: LineaEntrada[] };
  try {
    datos = JSON.parse(texto(fd, "datos") ?? "{}");
  } catch {
    volver(destino, "error", "No se pudo leer lo escrito. Intente de nuevo.");
  }
  const cab = datos.cab ?? {};
  const lineas = (datos.lineas ?? []).slice(0, 600).map((l) => ({
    codigo: String(l.codigo ?? "").toUpperCase().slice(0, 40),
    cargo: num(l.cargo),
    abono: num(l.abono),
    saldo: num(l.saldo),
    dia: fechaIso(l.dia),
    enlace: limpiarEnlace(l.enlace),
  }));
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("extractos_transcritos").upsert(
    {
      mcp_id: ctx.mcp.id,
      periodo,
      fecha_corte: fechaIso(cab.fecha_corte),
      fecha_saldo_anterior: fechaIso(cab.fecha_saldo_anterior),
      saldo_anterior: num(cab.saldo_anterior),
      n_movimientos_pdf: num(cab.n_pdf) === null ? null : Math.round(num(cab.n_pdf)!),
      total_cargos_pdf: num(cab.cargos_pdf),
      total_abonos_pdf: num(cab.abonos_pdf),
      saldo_actual_pdf: num(cab.saldo_pdf),
      lineas,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "mcp_id,periodo" },
  );
  if (error) volver(destino, "error", /extractos_transcritos/i.test(error.message) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte." : mensajeError(error));
  // Los cheques enlazados con un comprobante quedan marcados como cobrados (con la fecha del banco)
  let marcados = 0;
  const cobros = lineas.filter((l) => l.enlace?.tipo === "cp" && l.enlace.id && l.dia).flatMap((l) => [l.enlace!.id as string, ...((l.enlace as { extra?: { id: string }[] }).extra ?? []).map((x) => x.id)].map((id) => ({ id, dia: l.dia as string })));
  if (cobros.length) {
    const { data: ya } = await supabase.from("cheques_cobrados").select("comprobante_id").eq("mcp_id", ctx.mcp.id).eq("anulado", false).in("comprobante_id", cobros.map((c) => c.id));
    const existentes = new Set((ya ?? []).map((x) => x.comprobante_id));
    const nuevos = cobros.filter((c) => !existentes.has(c.id)).map((c) => ({ mcp_id: ctx.mcp.id, comprobante_id: c.id, fecha_cobro: c.dia }));
    if (nuevos.length) {
      const { error: eCobro } = await supabase.from("cheques_cobrados").insert(nuevos);
      if (!eCobro) marcados = nuevos.length;
    }
  }
  const enlazadas = lineas.filter((l) => l.enlace).length;
  revalidatePath(RUTA);
  revalidatePath("/contabilidad");
  volver(destino, "ok", `Guardado: ${lineas.length} línea(s), ${enlazadas} enlazada(s)${marcados ? ` y ${marcados} cheque(s) marcados como cobrados` : ""}.`);
}
