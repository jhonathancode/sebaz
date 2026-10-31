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
  const archivos = fd.getAll("archivo").filter((x): x is File => x instanceof File && x.size > 0);
  if (archivos.length === 0) volver(destino, "error", "Elija la foto o el PDF del estado de cuenta.");
  if (archivos.some((a) => !TIPOS[a.type])) volver(destino, "error", "Los archivos deben ser PDF o fotos (JPG, PNG o WEBP).");
  if (archivos.reduce((t, a) => t + a.size, 0) > MAXIMO) volver(destino, "error", "Los archivos pesan más de 4 MB en total. Súbalos en dos veces o use fotos con menos calidad.");

  const subidos: string[] = [];
  for (const [i, archivo] of archivos.entries()) {
    const ruta = `${ctx.mcp.id}/estados-cuenta/${periodo}-${Date.now()}-${i}.${TIPOS[archivo.type]}`;
    const { error: eSubida } = await supabase.storage.from("sustentos").upload(ruta, archivo, { contentType: archivo.type });
    if (eSubida) {
      if (subidos.length) await supabase.storage.from("sustentos").remove(subidos);
      volver(destino, "error", mensajeError(eSubida));
    }
    const { error } = await supabase.from("estados_cuenta").insert({
      mcp_id: ctx.mcp.id,
      periodo,
      banco: ctx.mcp.banco_nombre ?? "Banco de la Nación",
      cuenta: ctx.mcp.banco_cuenta,
      archivo_path: ruta,
      archivo_nombre: archivo.name.slice(0, 160),
      archivo_tipo: archivo.type,
      archivo_tamano: archivo.size,
      nota: texto(fd, "nota"),
    });
    if (error) {
      await supabase.storage.from("sustentos").remove([ruta]);
      volver(destino, "error", /estados_cuenta/i.test(error.message) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte." : mensajeError(error));
    }
    subidos.push(ruta);
  }
  revalidatePath(RUTA);
  const [a, m] = periodo.split("-").map(Number);
  const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"][m - 1];
  volver(`${destino}&mes=${periodo}`, "ok", `Listo: ${archivos.length === 1 ? "se subió 1 hoja" : `se subieron ${archivos.length} hojas`} del estado de cuenta de ${MES} ${a}. Ya aparece en su mes de la lista.`);
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
