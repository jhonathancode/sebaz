"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

export async function emitirRecibo(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const monto = numero(fd, "monto");
  if (!monto || monto <= 0) volver("/ingresos", "error", "Escriba el monto.");
  const doc = (texto(fd, "pagador_doc") ?? "").replace(/\D/g, "");
  if (doc && doc.length !== 8 && doc.length !== 11) volver("/ingresos", "error", "El DNI tiene 8 dígitos y el RUC 11.");
  const { data, error } = await supabase
    .from("ingresos")
    .insert({
      mcp_id: ctx.mcp.id,
      fecha: texto(fd, "fecha"),
      rubro: texto(fd, "rubro"),
      concepto: texto(fd, "concepto"),
      pagador_doc: doc || null,
      pagador_nombre: texto(fd, "pagador_nombre"),
      monto,
    })
    .select("id")
    .single();
  if (error || !data) volver("/ingresos", "error", mensajeError(error));
  revalidatePath("/ingresos");
  volver(`/ingresos/${data.id}`, "ok", "Recibo de ingreso emitido.");
}

export async function anularRecibo(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const { error } = await supabase
    .from("ingresos")
    .update({ estado: "anulado", anulado_motivo: texto(fd, "motivo") })
    .eq("id", id);
  if (error) volver(`/ingresos/${id}`, "error", mensajeError(error));
  revalidatePath("/ingresos");
  volver(`/ingresos/${id}`, "ok", "Recibo anulado. Queda en el registro con su motivo.");
}
