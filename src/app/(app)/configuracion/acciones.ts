"use server";

import { revalidatePath } from "next/cache";
import { CAMPOS_CAPITULO1, CAMPOS_CAPITULO1_LARGOS } from "@/lib/catalogos";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, texto, volver } from "@/lib/acciones";
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
