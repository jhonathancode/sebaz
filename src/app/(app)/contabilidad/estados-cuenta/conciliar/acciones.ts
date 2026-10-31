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

type LineaEntrada = { codigo?: string; cargo?: string; abono?: string; saldo?: string; dia?: string };

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
  revalidatePath(RUTA);
  volver(destino, "ok", `Guardado: ${lineas.length} línea(s) del estado de cuenta.`);
}
