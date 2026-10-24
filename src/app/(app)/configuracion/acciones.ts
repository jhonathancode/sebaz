"use server";

import { revalidatePath } from "next/cache";
import { CAMPOS_CAPITULO1, CAMPOS_CAPITULO1_LARGOS } from "@/lib/catalogos";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

export async function guardarDatosMcp(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const ruc = (texto(fd, "ruc") ?? "").replace(/\D/g, "");
  if (ruc && ruc.length !== 11) volver("/configuracion", "error", "El RUC debe tener 11 dígitos.");
  const { error } = await supabase
    .from("mcps")
    .update({
      nombre: texto(fd, "nombre"),
      ruc: ruc || null,
      direccion: texto(fd, "direccion"),
      distrito: texto(fd, "distrito"),
      provincia: texto(fd, "provincia"),
      departamento: texto(fd, "departamento"),
      banco_cuenta: texto(fd, "banco_cuenta"),
    })
    .eq("id", ctx.mcp.id);
  if (error) volver("/configuracion", "error", mensajeError(error));
  revalidatePath("/", "layout");
  volver("/configuracion", "ok", "Datos de la MCP guardados.");
}

export async function guardarCapitulo1(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const capitulo1: Record<string, string> = {};
  [...CAMPOS_CAPITULO1, ...CAMPOS_CAPITULO1_LARGOS].forEach((c) => {
    capitulo1[c.clave] = texto(fd, c.clave) ?? "";
  });
  const { error } = await supabase.from("mcps").update({ capitulo1 }).eq("id", ctx.mcp.id);
  if (error) volver("/configuracion", "error", mensajeError(error));
  volver("/configuracion", "ok", "Capítulo I guardado. Se copiará en cada informe.");
}

export async function cerrarMes(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("cerrar_periodo", { p_mcp: ctx.mcp.id, p_periodo: texto(fd, "periodo") });
  if (error) volver("/configuracion", "error", mensajeError(error));
  volver("/configuracion", "ok", "Mes cerrado. Ya no admite cambios.");
}

export async function reabrirMes(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("reabrir_periodo", {
    p_mcp: ctx.mcp.id,
    p_periodo: texto(fd, "periodo"),
    p_motivo: texto(fd, "motivo"),
  });
  if (error) volver("/configuracion", "error", mensajeError(error));
  volver("/configuracion", "ok", "Mes reabierto. El motivo quedó registrado.");
}

/** Día del mes siguiente hasta el que se entrega la rendición a cada municipalidad. */
export async function guardarDiaLimite(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "fuente_id")!;
  const dia = numero(fd, "dia_limite");
  if (!dia || dia < 1 || dia > 28) volver("/configuracion", "error", "El día límite debe estar entre 1 y 28.");
  const { error } = await supabase.from("fuentes").update({ dia_limite: dia }).eq("id", id).eq("mcp_id", ctx.mcp.id);
  if (error) volver("/configuracion", "error", mensajeError(error));
  revalidatePath("/", "layout");
  volver("/configuracion", "ok", "Fecha límite guardada.");
}

const TIPOS_LOGO: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Sube o cambia el logo de la MCP. Queda en el menú y en todos los formatos. */
export async function subirLogo(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const archivo = fd.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) volver("/configuracion", "error", "Elija la imagen del logo.");
  const ext = TIPOS_LOGO[archivo.type];
  if (!ext) volver("/configuracion", "error", "El logo debe ser una imagen PNG, JPG o WEBP.");
  if (archivo.size > 900 * 1024) volver("/configuracion", "error", "El logo pesa mucho: máximo 900 KB.");
  // Nombre nuevo en cada cambio para que el navegador no muestre el logo anterior.
  const ruta = `${ctx.mcp.id}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("logos").upload(ruta, archivo, { contentType: archivo.type, upsert: true });
  if (error) volver("/configuracion", "error", /bucket/i.test(error.message) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte." : mensajeError(error));
  const { error: e2 } = await supabase.from("mcps").update({ logo_path: ruta }).eq("id", ctx.mcp.id);
  if (e2) volver("/configuracion", "error", mensajeError(e2));
  revalidatePath("/", "layout");
  volver("/configuracion", "ok", "Logo guardado. Ya aparece en el menú y en los formatos.");
}

/** Agrega o corrige un pago fijo de la lista (dietas, asesor, personal). */
export async function guardarPagoFijo(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id");
  const destino = "/configuracion#pagos-fijos";
  const monto = numero(fd, "monto");
  const concepto = (texto(fd, "concepto") ?? "").toUpperCase();
  if (!concepto) volver(destino, "error", "Escriba el concepto del pago fijo.");
  if (!monto || monto <= 0) volver(destino, "error", "Escriba el monto mensual.");
  const datos = {
    concepto,
    beneficiario: texto(fd, "beneficiario")?.toUpperCase() ?? null,
    beneficiario_doc: (texto(fd, "beneficiario_doc") ?? "").replace(/\D/g, "") || null,
    monto,
    unidad: (texto(fd, "unidad") ?? "MES").toUpperCase(),
    fuente_id: texto(fd, "fuente_id"),
    clasificador: texto(fd, "clasificador"),
  };
  const { error } = id
    ? await supabase.from("pagos_fijos").update(datos).eq("id", id)
    : await supabase.from("pagos_fijos").insert({ mcp_id: ctx.mcp.id, ...datos });
  if (error) volver(destino, "error", error.message.includes("duplicate") ? "Ya hay un pago fijo con ese concepto." : mensajeError(error));
  revalidatePath("/configuracion");
  revalidatePath("/expedientes");
  volver(destino, "ok", id ? "Pago fijo actualizado." : "Pago fijo agregado a la lista.");
}

/** Deja de mostrar (o vuelve a mostrar) un pago fijo; no se borra. */
export async function alternarPagoFijo(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const activo = texto(fd, "activo") === "1";
  const { error } = await supabase.from("pagos_fijos").update({ activo }).eq("id", id);
  if (error) volver("/configuracion#pagos-fijos", "error", mensajeError(error));
  revalidatePath("/configuracion");
  volver("/configuracion#pagos-fijos", "ok", activo ? "Pago fijo activado." : "Pago fijo desactivado: ya no saldrá en los requerimientos.");
}
