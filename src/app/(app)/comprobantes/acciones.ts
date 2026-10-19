"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

function funcionCategoria(fd: FormData) {
  const [funcion, categoria] = (texto(fd, "categoria_funcion") ?? "").split("|");
  return { funcion: funcion || null, categoria: categoria || null };
}

/** Comprobante sin expediente: dietas, honorarios, remuneraciones, etc. */
export async function crearComprobanteDirecto(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const importe = numero(fd, "importe");
  if (!importe || importe <= 0) volver("/comprobantes/nuevo", "error", "Escriba el importe.");
  const { data, error } = await supabase
    .from("comprobantes_pago")
    .insert({
      mcp_id: ctx.mcp.id,
      fecha: texto(fd, "fecha"),
      origen: "directo",
      fuente_id: texto(fd, "fuente_id"),
      beneficiario: texto(fd, "beneficiario"),
      beneficiario_doc: texto(fd, "beneficiario_doc"),
      concepto: texto(fd, "concepto"),
      importe,
      deducciones: numero(fd, "deducciones") ?? 0,
      partida: texto(fd, "partida"),
      sustento_tipo: texto(fd, "sustento_tipo"),
      sustento_numero: texto(fd, "sustento_numero"),
      ...funcionCategoria(fd),
    })
    .select("id")
    .single();
  if (error || !data) volver("/comprobantes/nuevo", "error", mensajeError(error));
  revalidatePath("/comprobantes");
  volver(`/comprobantes/${data.id}`, "ok", "Comprobante de pago registrado en borrador.");
}

export async function editarComprobante(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const { error } = await supabase
    .from("comprobantes_pago")
    .update({
      fecha: texto(fd, "fecha"),
      concepto: texto(fd, "concepto"),
      partida: texto(fd, "partida"),
      funcional: texto(fd, "funcional"),
      deducciones: numero(fd, "deducciones") ?? 0,
      sustento_tipo: texto(fd, "sustento_tipo"),
      sustento_numero: texto(fd, "sustento_numero"),
      ...funcionCategoria(fd),
    })
    .eq("id", id);
  if (error) volver(`/comprobantes/${id}`, "error", mensajeError(error));
  volver(`/comprobantes/${id}`, "ok", "Cambios guardados.");
}

export async function cambiarEstadoComprobante(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const accion = texto(fd, "accion");
  const cambios: Record<string, string | null> = {};
  if (accion === "aprobar") cambios.estado = "aprobado";
  if (accion === "devolver") Object.assign(cambios, { estado: "borrador", motivo_devolucion: texto(fd, "motivo") });
  if (accion === "anular") Object.assign(cambios, { estado: "anulado", anulado_motivo: texto(fd, "motivo") });
  const { error } = await supabase.from("comprobantes_pago").update(cambios).eq("id", id);
  if (error) volver(`/comprobantes/${id}`, "error", mensajeError(error));
  revalidatePath("/comprobantes");
  volver(`/comprobantes/${id}`, "ok", accion === "aprobar" ? "Comprobante aprobado. Escriba el cheque al girar." : "Listo.");
}

export async function registrarCheque(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const cheque = (texto(fd, "cheque") ?? "").replace(/\s/g, "");
  if (!/^\d{4,12}$/.test(cheque)) volver(`/comprobantes/${id}`, "error", "El número de cheque debe tener solo dígitos.");
  const { error } = await supabase.from("comprobantes_pago").update({ cheque }).eq("id", id);
  if (error) volver(`/comprobantes/${id}`, "error", mensajeError(error));
  revalidatePath("/comprobantes");
  volver(`/comprobantes/${id}`, "ok", "Cheque registrado. El comprobante ya puede entrar en la rendición.");
}
