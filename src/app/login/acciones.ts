"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";

export async function ingresar(fd: FormData) {
  const correo = String(fd.get("correo") ?? "").trim();
  const clave = String(fd.get("clave") ?? "");
  const desde = String(fd.get("desde") ?? "/login");
  const volverA = /^\/login(\/\d{0,11})?$/.test(desde) ? desde : "/login";
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
  if (error) redirect(`${volverA}?error=` + encodeURIComponent("Correo o contraseña incorrectos."));
  await supabase.rpc("registrar_acceso");
  redirect("/");
}
