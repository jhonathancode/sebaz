"use server";

import { revalidatePath } from "next/cache";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { obtenerContexto } from "@/lib/contexto";
import { videoIncrustado } from "@/lib/tutorialesDb";
import { supabaseServidor } from "@/lib/supabase/server";

const DESTINO = "/superadmin/tutoriales";

/** Crea o corrige una guía. La ven todas las municipalidades. */
export async function guardarTutorial(fd: FormData) {
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) volver(DESTINO, "error", "Solo el superadmin administra los tutoriales.");
  const titulo = texto(fd, "titulo");
  const modulo = texto(fd, "modulo");
  const pasos = (texto(fd, "pasos") ?? "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  if (!titulo || !modulo) volver(DESTINO, "error", "Escriba el título y elija el módulo.");
  if (pasos.length === 0) volver(DESTINO, "error", "Escriba al menos un paso (uno por línea).");
  const video = texto(fd, "video_url");
  if (video && !videoIncrustado(video)) volver(DESTINO, "error", "El enlace del video no se reconoce. Use YouTube, Vimeo, Google Drive o un archivo .mp4.");
  const datos = {
    modulo,
    titulo,
    pasos,
    consejo: texto(fd, "consejo"),
    video_url: video,
    orden: numero(fd, "orden") ?? 99,
    publicado: fd.get("publicado") === "1",
    actualizado_en: new Date().toISOString(),
  };
  const supabase = await supabaseServidor();
  const id = texto(fd, "id");
  const { error } = id
    ? await supabase.from("tutoriales").update(datos).eq("id", id)
    : await supabase.from("tutoriales").insert({ ...datos, slug: `${modulo}-${Date.now().toString(36)}` });
  if (error) volver(DESTINO, "error", mensajeError(error));
  revalidatePath("/tutoriales");
  revalidatePath("/superadmin/tutoriales");
  volver(DESTINO, "ok", id ? "Guía actualizada: ya la ven todas las municipalidades." : "Guía creada: ya la ven todas las municipalidades.");
}
