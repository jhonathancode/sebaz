"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

export async function emitirRecibo(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const monto = numero(fd, "monto");
  if (!monto || monto <= 0) volver("/ingresos?nuevo=1", "error", "Escriba el monto.");
  const doc = (texto(fd, "pagador_doc") ?? "").replace(/\D/g, "");
  if (doc && doc.length !== 8 && doc.length !== 11) volver("/ingresos?nuevo=1", "error", "El DNI tiene 8 dígitos y el RUC 11.");
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
  if (error || !data) volver("/ingresos?nuevo=1", "error", mensajeError(error));
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

// ---------------------------------------------------------------------
// Vouchers de depósito de los ingresos propios
// ---------------------------------------------------------------------
const TIPOS_VOUCHER: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function subirVoucher(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const fecha = texto(fd, "fecha") ?? "";
  const destino = `/ingresos?vista=mes&mes=${fecha.slice(0, 7) || ""}`;
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(destino, "error", "No tiene permiso para subir vouchers.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) volver(destino, "error", "Escriba la fecha del depósito.");
  const monto = numero(fd, "monto");
  if (!monto || monto <= 0) volver(destino, "error", "Escriba el monto depositado.");
  const desde = texto(fd, "desde");
  const hasta = texto(fd, "hasta");
  if (desde && hasta && hasta < desde) volver(destino, "error", "La fecha final del periodo que cubre no puede ser anterior a la inicial.");
  const archivos = fd.getAll("archivo").filter((x): x is File => x instanceof File && x.size > 0);
  if (archivos.length > 1) volver(destino, "error", "Suba un voucher a la vez (una foto o un PDF).");
  const archivo = archivos[0] ?? null;
  if (archivo && !TIPOS_VOUCHER[archivo.type]) volver(destino, "error", "El voucher debe ser PDF o foto (JPG, PNG o WEBP).");
  if (archivo && archivo.size > 4 * 1024 * 1024) volver(destino, "error", "El archivo pesa más de 4 MB. Use una foto con menos calidad.");

  let ruta: string | null = null;
  if (archivo) {
    ruta = `${ctx.mcp.id}/vouchers/${fecha}-${Date.now()}.${TIPOS_VOUCHER[archivo.type]}`;
    const { error: eSubida } = await supabase.storage.from("sustentos").upload(ruta, archivo, { contentType: archivo.type });
    if (eSubida) volver(destino, "error", mensajeError(eSubida));
  }
  const { error } = await supabase.from("depositos_ingresos").insert({
    mcp_id: ctx.mcp.id,
    fecha,
    monto,
    numero_operacion: texto(fd, "numero_operacion"),
    desde: desde || null,
    hasta: hasta || null,
    nota: texto(fd, "nota"),
    archivo_path: ruta,
    archivo_nombre: archivo ? archivo.name.slice(0, 160) : null,
    archivo_tipo: archivo?.type ?? null,
    archivo_tamano: archivo?.size ?? null,
  });
  if (error) {
    if (ruta) await supabase.storage.from("sustentos").remove([ruta]);
    volver(destino, "error", /depositos_ingresos/i.test(error.message) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte." : mensajeError(error));
  }
  revalidatePath("/ingresos");
  volver(destino, "ok", "Voucher guardado. Ya cuenta en la suma de depósitos.");
}

/** Un voucher subido por error no se borra: se anula con motivo y queda en el historial. */
export async function anularVoucher(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = texto(fd, "mes") ?? "";
  const destino = `/ingresos?vista=mes&mes=${mes}`;
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(destino, "error", "No tiene permiso para anular vouchers.");
  const { error } = await supabase.from("depositos_ingresos").update({ anulado: true, anulado_motivo: texto(fd, "motivo") }).eq("id", texto(fd, "id") ?? "").eq("mcp_id", ctx.mcp.id);
  if (error) volver(destino, "error", mensajeError(error));
  revalidatePath("/ingresos");
  volver(destino, "ok", "Voucher anulado. Queda en el historial.");
}
