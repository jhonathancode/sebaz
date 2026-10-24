"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, volver } from "@/lib/acciones";
import { chequeMasUno, comprobanteAutomatico } from "@/lib/comprobanteAuto";
import { siguienteCheque } from "@/lib/pagosFijos";
import { supabaseServidor } from "@/lib/supabase/server";

/** Aprueba de una vez los requerimientos y comprobantes marcados. */
export async function aprobarEnBloque(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "alcalde", "admin")) volver("/aprobaciones", "error", "Solo el alcalde o el administrador pueden aprobar.");
  const supabase = await supabaseServidor();
  const exps = fd.getAll("exp").map(String);
  const cps = fd.getAll("cp").map(String);
  if (exps.length + cps.length === 0) volver("/aprobaciones", "error", "Marque al menos un documento.");

  const errores: string[] = [];
  let aprobados = 0;
  let generados = 0;

  // Comprobantes primero: así los que se generen ahora quedan para la siguiente pasada.
  for (const id of cps) {
    const { error } = await supabase.from("comprobantes_pago").update({ estado: "aprobado" }).eq("id", id).eq("estado", "borrador");
    if (error) errores.push(mensajeError(error));
    else aprobados++;
  }

  let cheque = exps.length ? await siguienteCheque(supabase, ctx.mcp.id) : "";
  for (const id of exps) {
    const { error } = await supabase.from("expedientes").update({ estado: "aprobado" }).eq("id", id).eq("estado", "borrador");
    if (error) {
      errores.push(mensajeError(error));
      continue;
    }
    aprobados++;
    const usado = await comprobanteAutomatico(supabase, ctx.mcp.id, id, cheque, true);
    if (usado !== null) {
      generados++;
      if (usado && usado === cheque) cheque = chequeMasUno(usado);
    }
  }

  revalidatePath("/aprobaciones");
  revalidatePath("/expedientes");
  revalidatePath("/comprobantes");
  revalidatePath("/inicio");
  const partes = [`Se aprobaron ${aprobados} documento(s).`];
  if (generados) partes.push(`Se generaron y aprobaron ${generados} comprobante(s) de pago de pagos fijos: ya pueden entrar en la rendición.`);
  if (errores.length) partes.push(`No se pudieron aprobar ${errores.length}: ${errores[0]}`);
  volver("/aprobaciones", errores.length && !aprobados ? "error" : "ok", partes.join(" "));
}
