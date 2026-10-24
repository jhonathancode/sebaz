"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

function leerItems(fd: FormData): unknown[] {
  try {
    const v = JSON.parse(String(fd.get("items") ?? "[]"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Emite una NEA (entrada al almacén). Si viene de un expediente, vuelve a él. */
export async function emitirNea(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const expediente = texto(fd, "expediente_id");
  const desde = expediente ? `/almacen/nea/nueva?expediente=${expediente}` : "/almacen/nea/nueva";
  const items = leerItems(fd);
  if (items.length === 0) volver(desde, "error", "Agregue al menos un bien.");
  const { data, error } = await supabase.rpc("emitir_nea", {
    p_mcp: ctx.mcp.id,
    p_fecha: texto(fd, "fecha"),
    p_origen: expediente ? "compra" : texto(fd, "origen") ?? "compra",
    p_expediente: expediente,
    p_proveedor: texto(fd, "proveedor"),
    p_documento_ref: texto(fd, "documento_ref"),
    p_observacion: texto(fd, "observacion"),
    p_items: items,
  });
  if (error || !data) volver(desde, "error", mensajeError(error));
  revalidatePath("/almacen");
  if (expediente) {
    revalidatePath(`/expedientes/${expediente}`);
    volver(`/expedientes/${expediente}`, "ok", "Los bienes entraron al almacén (NEA emitida). Ahora genere el comprobante de pago.");
  }
  volver(`/almacen/nea/${data}`, "ok", "NEA emitida: los bienes ya están en el almacén.");
}

/** Emite una PECOSA (salida del almacén). */
export async function emitirPecosa(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const items = leerItems(fd);
  if (items.length === 0) volver("/almacen/pecosa/nueva", "error", "Agregue al menos un bien.");
  const { data, error } = await supabase.rpc("emitir_pecosa", {
    p_mcp: ctx.mcp.id,
    p_fecha: texto(fd, "fecha"),
    p_area: texto(fd, "area_solicitante"),
    p_solicitante: texto(fd, "solicitante"),
    p_finalidad: texto(fd, "finalidad"),
    p_items: items,
  });
  if (error || !data) volver("/almacen/pecosa/nueva", "error", mensajeError(error));
  revalidatePath("/almacen");
  volver(`/almacen/pecosa/${data}`, "ok", "PECOSA emitida: los bienes salieron del almacén.");
}

/** Anula una NEA o una PECOSA con motivo. */
export async function anularDocumentoAlmacen(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const tabla = texto(fd, "tabla");
  const id = texto(fd, "id")!;
  if (tabla !== "notas_entrada" && tabla !== "pecosas") volver("/almacen", "error", "Documento no válido.");
  const ruta = `/almacen/${tabla === "pecosas" ? "pecosa" : "nea"}/${id}`;
  const motivo = texto(fd, "motivo");
  if (!motivo || motivo.length < 10) volver(ruta, "error", "Para anular escriba un motivo de al menos 10 caracteres.");
  const { error } = await supabase.from(tabla).update({ anulado: true, anulado_motivo: motivo }).eq("id", id);
  if (error) volver(ruta, "error", mensajeError(error));
  revalidatePath("/almacen");
  volver(ruta, "ok", "Documento anulado. El stock se actualizó y queda en el historial.");
}

/** Cambia el stock mínimo de un bien (para que avise cuando queda poco). */
export async function guardarStockMinimo(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "bien_id")!;
  const minimo = numero(fd, "stock_minimo") ?? 0;
  const { error } = await supabase.from("almacen_bienes").update({ stock_minimo: Math.max(0, minimo) }).eq("id", id);
  if (error) volver(`/almacen/bien/${id}`, "error", mensajeError(error));
  revalidatePath("/almacen");
  volver(`/almacen/bien/${id}`, "ok", "Stock mínimo guardado.");
}

/** Una compra que no pasa por almacén (se consumió de inmediato), con motivo. */
export async function compraSinAlmacen(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const motivo = texto(fd, "motivo");
  if (!motivo || motivo.length < 10) volver(`/expedientes/${id}`, "error", "Explique en al menos 10 caracteres por qué no pasa por almacén.");
  const { error } = await supabase.from("expedientes").update({ sin_almacen_motivo: motivo }).eq("id", id);
  if (error) volver(`/expedientes/${id}`, "error", mensajeError(error));
  revalidatePath(`/expedientes/${id}`);
  volver(`/expedientes/${id}`, "ok", "Anotado: estos bienes no pasan por almacén. Ya puede generar el comprobante de pago.");
}
