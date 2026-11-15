"use server";

import { revalidatePath } from "next/cache";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { contextoMcp, tiene } from "@/lib/contexto";
import { hashToken, nuevoToken } from "@/lib/enlaceLectura";
import { supabaseServidor } from "@/lib/supabase/server";

const DESTINO = "/configuracion?seccion=seguridad";

export async function crearEnlaceLectura(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin")) volver(DESTINO, "error", "Solo el administrador crea enlaces de lectura.");
  const nombre = (texto(fd, "nombre") ?? "").toUpperCase();
  if (nombre.length < 3) volver(DESTINO, "error", "Escriba para quién es el enlace (por ejemplo, REGIDOR JUAN PÉREZ).");
  const token = nuevoToken();
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("enlaces_lectura").insert({ mcp_id: ctx.mcp.id, nombre, token_hash: hashToken(token) });
  if (error) volver(DESTINO, "error", mensajeError(error));
  revalidatePath("/configuracion");
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  volver(DESTINO, "ok", `Enlace creado para ${nombre}. Cópielo ahora, no se volverá a mostrar: ${base}/ver/${token}`);
}

export async function revocarEnlaceLectura(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin")) volver(DESTINO, "error", "Solo el administrador revoca enlaces.");
  const motivo = (texto(fd, "motivo") ?? "").trim();
  if (motivo.length < 10) volver(DESTINO, "error", "Escriba el motivo (mínimo 10 letras).");
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("enlaces_lectura").update({ activo: false, revocado_motivo: motivo }).eq("id", String(fd.get("id"))).eq("mcp_id", ctx.mcp.id);
  if (error) volver(DESTINO, "error", mensajeError(error));
  revalidatePath("/configuracion");
  volver(DESTINO, "ok", "Enlace revocado: ya no abre.");
}
