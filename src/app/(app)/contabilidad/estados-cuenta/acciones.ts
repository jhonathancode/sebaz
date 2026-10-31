"use server";

import { revalidatePath } from "next/cache";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { contextoMcp, tiene } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";

const RUTA = "/contabilidad/estados-cuenta";
const TIPOS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAXIMO = 4 * 1024 * 1024;

/** Guarda el estado de cuenta del banco (foto o PDF) que subió la tesorera. */
export async function subirEstadoCuenta(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(RUTA, "error", "No tiene permiso para subir estados de cuenta.");
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo") ?? "";
  if (!/^\d{4}-\d{2}$/.test(periodo)) volver(RUTA, "error", "Elija el mes del estado de cuenta.");
  const destino = `${RUTA}?anio=${periodo.slice(0, 4)}`;
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) volver(destino, "error", "Elija la foto o el PDF del estado de cuenta.");
  const ext = TIPOS[archivo.type];
  if (!ext) volver(destino, "error", "El archivo debe ser PDF o una foto (JPG, PNG o WEBP).");
  if (archivo.size > MAXIMO) volver(destino, "error", "El archivo pesa más de 4 MB. Si es una foto, tómela con menos calidad; si es PDF, descárguelo de nuevo del banco.");

  const ruta = `${ctx.mcp.id}/estados-cuenta/${periodo}-${Date.now()}.${ext}`;
  const { error: eSubida } = await supabase.storage.from("sustentos").upload(ruta, archivo, { contentType: archivo.type });
  if (eSubida) volver(destino, "error", mensajeError(eSubida));
  const { data: nuevo, error } = await supabase.from("estados_cuenta").insert({
    mcp_id: ctx.mcp.id,
    periodo,
    banco: ctx.mcp.banco_nombre ?? "Banco de la Nación",
    cuenta: ctx.mcp.banco_cuenta,
    archivo_path: ruta,
    archivo_nombre: archivo.name.slice(0, 160),
    archivo_tipo: archivo.type,
    archivo_tamano: archivo.size,
    nota: texto(fd, "nota"),
  }).select("id").single();
  if (error) {
    await supabase.storage.from("sustentos").remove([ruta]);
    volver(destino, "error", /estados_cuenta/i.test(error.message) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte." : mensajeError(error));
  }
  revalidatePath(RUTA);
  const [a, m] = periodo.split("-").map(Number);
  const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"][m - 1];
  volver(`${destino}&nuevo=${nuevo?.id ?? ""}`, "ok", `Listo: el estado de cuenta de ${MES} ${a} se subió correctamente (archivo «${archivo.name}»). Está resaltado en la lista; puede abrirlo con «Ver».`);
}

/** Un estado de cuenta subido por error no se borra: se anula con motivo y queda en el historial. */
export async function anularEstadoCuenta(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(RUTA, "error", "No tiene permiso para anular.");
  const supabase = await supabaseServidor();
  const anio = texto(fd, "anio") ?? "";
  const { error } = await supabase.from("estados_cuenta").update({ anulado: true, anulado_motivo: texto(fd, "motivo") }).eq("id", texto(fd, "id") ?? "");
  const destino = `${RUTA}?anio=${anio}`;
  if (error) volver(destino, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(destino, "ok", "Estado de cuenta anulado. Queda en el historial.");
}
