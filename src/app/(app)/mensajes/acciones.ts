"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { texto } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

/** Marca un aviso como leído y lleva a lo que avisa. */
export async function abrirAviso(fd: FormData) {
  await obtenerContexto();
  const id = texto(fd, "id");
  const supabase = await supabaseServidor();
  let enlace = "/mensajes";
  if (id) {
    const { data } = await supabase.from("notificaciones").update({ leida_en: new Date().toISOString() }).eq("id", id).select("enlace").maybeSingle();
    if (data?.enlace && data.enlace.startsWith("/") && !data.enlace.startsWith("//")) enlace = data.enlace;
  }
  revalidatePath("/", "layout");
  redirect(enlace);
}

export async function marcarTodasLeidas() {
  const ctx = await obtenerContexto();
  const supabase = await supabaseServidor();
  await supabase.from("notificaciones").update({ leida_en: new Date().toISOString() }).eq("user_id", ctx.userId).is("leida_en", null);
  revalidatePath("/", "layout");
  redirect("/mensajes");
}
