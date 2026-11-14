"use server";

import { revalidatePath } from "next/cache";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { calcularBalance } from "@/lib/balanceAnual";
import { contextoMcp, tiene } from "@/lib/contexto";
import { HOJAS } from "@/lib/planCuentas";
import { supabaseServidor } from "@/lib/supabase/server";

const ir = (anio: number) => `/contabilidad/balance-anual?anio=${anio}&hoja=apertura`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saldo de una cuenta al 1 de enero. Se puede corregir; queda en la auditoría. */
export async function guardarApertura(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver("/contabilidad/balance-anual", "error", "No tiene permiso para anotar la apertura.");
  const supabase = await supabaseServidor();
  const anio = Number(texto(fd, "anio"));
  const cuenta = texto(fd, "cuenta") ?? "";
  if (!HOJAS.some((h) => h.codigo === cuenta) || cuenta.startsWith("3401")) volver(ir(anio), "error", "Elija una cuenta de la lista.");
  const debe = Math.max(0, numero(fd, "debe") ?? 0);
  const haber = Math.max(0, numero(fd, "haber") ?? 0);
  const { error } = await supabase.from("saldos_apertura").upsert({ mcp_id: ctx.mcp.id, anio, cuenta, debe, haber }, { onConflict: "mcp_id,anio,cuenta" });
  if (error) volver(ir(anio), "error", mensajeError(error));
  revalidatePath("/contabilidad/balance-anual");
  volver(ir(anio), "ok", "Apertura guardada.");
}

/** Toma el cierre del año anterior (saldos al 31 de diciembre) como apertura de este año. */
export async function copiarCierreAnterior(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver("/contabilidad/balance-anual", "error", "No tiene permiso para anotar la apertura.");
  const supabase = await supabaseServidor();
  const anio = Number(texto(fd, "anio"));
  const previo = await calcularBalance(ctx, supabase, anio - 1);
  const filas: { mcp_id: string; anio: number; cuenta: string; debe: number; haber: number }[] = [];
  HOJAS.forEach((h) => {
    // Solo activo, pasivo y hacienda; el banco y la caja salen de los saldos iniciales y los resultados acumulados se calculan solos
    if (!/^(1|2|3201)/.test(h.codigo) || h.codigo.startsWith("1101")) return;
    const a = previo.agregado(h.codigo);
    const neto = r2(a.apD - a.apH + a.q.reduce((s, x) => s + x[0] - x[1], 0));
    if (Math.abs(neto) < 0.005) return;
    filas.push({ mcp_id: ctx.mcp.id, anio, cuenta: h.codigo, debe: neto > 0 ? neto : 0, haber: neto < 0 ? -neto : 0 });
  });
  if (!filas.length) volver(ir(anio), "error", `No hay saldos en ${anio - 1} para copiar.`);
  const { error } = await supabase.from("saldos_apertura").upsert(filas, { onConflict: "mcp_id,anio,cuenta" });
  if (error) volver(ir(anio), "error", mensajeError(error));
  revalidatePath("/contabilidad/balance-anual");
  volver(ir(anio), "ok", `Se copió el cierre de ${anio - 1}: ${filas.length} cuentas.`);
}
