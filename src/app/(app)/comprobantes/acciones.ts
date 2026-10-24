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
/** N° de cheque escrito en un formulario (opcional): solo dígitos. */
export async function leerCheque(fd: FormData, volverA: string): Promise<string | null> {
  const cheque = (texto(fd, "cheque") ?? "").replace(/\s/g, "");
  if (!cheque) return null;
  if (!/^\d{4,12}$/.test(cheque)) volver(volverA, "error", "El número de cheque debe tener solo dígitos (de 4 a 12).");
  return cheque;
}

export async function crearComprobanteDirecto(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const importe = numero(fd, "importe");
  if (!importe || importe <= 0) volver("/comprobantes?nuevo=1", "error", "Escriba el importe.");
  const cheque = await leerCheque(fd, "/comprobantes?nuevo=1");
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
      cheque,
      ...funcionCategoria(fd),
    })
    .select("id")
    .single();
  if (error || !data) volver("/comprobantes?nuevo=1", "error", mensajeError(error));
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
  // Si viene del expediente, vuelve a él.
  const destino = texto(fd, "volver_a")?.startsWith("/expedientes/") ? texto(fd, "volver_a")! : `/comprobantes/${id}`;
  const cheque = (texto(fd, "cheque") ?? "").replace(/\s/g, "");
  if (!/^\d{4,12}$/.test(cheque)) volver(destino, "error", "El número de cheque debe tener solo dígitos (de 4 a 12).");
  const { error } = await supabase.from("comprobantes_pago").update({ cheque }).eq("id", id);
  if (error) volver(destino, "error", mensajeError(error));
  revalidatePath("/comprobantes");
  revalidatePath(destino);
  volver(destino, "ok", "Cheque registrado. Cuando el comprobante esté aprobado, ya puede entrar en la rendición.");
}
