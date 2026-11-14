"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { TIPOS_ADJUNTO, TIPOS_ARCHIVO_ADJUNTO } from "@/lib/adjuntosExpediente";
import { supabaseServidor } from "@/lib/supabase/server";

const ruta = (id: string) => `/expedientes/${id}`;
const falta = (m: string) => (/expediente_adjuntos|schema cache/.test(m) ? "Falta la actualización de la base (ADJUNTOS_EXPEDIENTE.sql). Avise a soporte." : m);

async function permiso(destino: string) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(destino, "error", "Su rol no puede adjuntar documentos.");
  return ctx;
}

/** Adjunta uno o varios archivos (foto o PDF) a un expediente ya creado. */
export async function subirAdjunto(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const ctx = await permiso(ruta(id));
  const supabase = await supabaseServidor();
  const tipo = texto(fd, "tipo") ?? "";
  if (!TIPOS_ADJUNTO.some((t) => t.clave === tipo)) volver(ruta(id), "error", "Elija qué documento es.");
  const archivos = fd.getAll("archivo").filter((x): x is File => x instanceof File && x.size > 0);
  if (archivos.length === 0) volver(ruta(id), "error", "Elija el PDF o la foto del documento.");
  if (archivos.length > 10) volver(ruta(id), "error", "Suba como máximo 10 archivos a la vez.");
  for (const a of archivos) {
    if (!TIPOS_ARCHIVO_ADJUNTO[a.type]) volver(ruta(id), "error", "Cada archivo debe ser PDF o foto (JPG, PNG o WEBP).");
    if (a.size > 4 * 1024 * 1024) volver(ruta(id), "error", `«${a.name}» pesa más de 4 MB. Use una foto con menos calidad.`);
  }
  const { data: exp } = await supabase.from("expedientes").select("id, estado").eq("id", id).eq("mcp_id", ctx.mcp.id).maybeSingle();
  if (!exp) volver(ruta(id), "error", "No se encontró el expediente.");
  if (exp.estado === "anulado") volver(ruta(id), "error", "El expediente está anulado.");
  const descripcion = texto(fd, "descripcion")?.toUpperCase().slice(0, 160) ?? null;
  const subidos: string[] = [];
  let n = 0;
  for (const a of archivos) {
    const path = `${ctx.mcp.id}/expedientes/${id}/${Date.now()}-${n++}.${TIPOS_ARCHIVO_ADJUNTO[a.type]}`;
    const { error: eS } = await supabase.storage.from("sustentos").upload(path, a, { contentType: a.type });
    if (eS) {
      if (subidos.length) await supabase.storage.from("sustentos").remove(subidos);
      volver(ruta(id), "error", mensajeError(eS));
    }
    subidos.push(path);
    const { error } = await supabase.from("expediente_adjuntos").insert({
      mcp_id: ctx.mcp.id,
      expediente_id: id,
      tipo,
      descripcion,
      archivo_path: path,
      archivo_nombre: a.name.slice(0, 160),
      archivo_tipo: a.type,
      archivo_tamano: a.size,
    });
    if (error) {
      await supabase.storage.from("sustentos").remove(subidos);
      volver(ruta(id), "error", falta(mensajeError(error)));
    }
  }
  revalidatePath(ruta(id));
  volver(ruta(id), "ok", archivos.length > 1 ? `${archivos.length} documentos adjuntados.` : "Documento adjuntado al expediente.");
}

/** «Quita» un adjunto: nunca se borra; queda anulado con su motivo y su archivo se conserva. */
export async function anularAdjunto(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const ctx = await permiso(ruta(id));
  const supabase = await supabaseServidor();
  const motivo = texto(fd, "motivo");
  if (!motivo || motivo.length < 10) volver(ruta(id), "error", "Escriba el motivo (mínimo 10 letras).");
  const { error } = await supabase
    .from("expediente_adjuntos")
    .update({ anulado: true, anulado_motivo: motivo, anulado_por: ctx.userId, anulado_en: new Date().toISOString() })
    .eq("id", texto(fd, "adjunto_id") ?? "")
    .eq("expediente_id", id)
    .eq("mcp_id", ctx.mcp.id);
  if (error) volver(ruta(id), "error", falta(mensajeError(error)));
  revalidatePath(ruta(id));
  volver(ruta(id), "ok", "Adjunto anulado. Queda en el historial con su motivo.");
}
