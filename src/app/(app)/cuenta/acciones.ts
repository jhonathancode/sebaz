"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";
import { texto, volver } from "@/lib/acciones";
import { exigirPin, hashPin, pinValido } from "@/lib/pin";
import { supabaseServicio } from "@/lib/supabase/server";
import { VERSION_TERMINOS } from "@/lib/terminos";

/** Primer ingreso (o términos nuevos): acepta las condiciones y elige su PIN. */
export async function completarIngreso(fd: FormData) {
  const ctx = await obtenerContexto();
  const falta = ctx.ingresoPendiente;
  if (!falta) volver("/", "ok", "Todo listo.");
  const cambios: Record<string, string | number | null> = { user_id: ctx.userId };
  if (falta.terminos) {
    if (texto(fd, "acepto") !== "1") volver("/", "error", "Para continuar debe aceptar las condiciones de uso.");
    cambios.acepto_terminos_en = new Date().toISOString();
    cambios.acepto_version = VERSION_TERMINOS;
  }
  if (falta.pin) {
    const pin = texto(fd, "pin_nuevo") ?? "";
    const problema = pinValido(pin);
    if (problema) volver("/", "error", problema);
    if (pin !== texto(fd, "pin_repetir")) volver("/", "error", "Los dos PIN no coinciden.");
    cambios.pin_hash = hashPin(pin);
    cambios.pin_actualizado_en = new Date().toISOString();
    cambios.pin_intentos = 0;
    cambios.pin_bloqueado_hasta = null;
  }
  const { error } = await supabaseServicio().from("perfil_seguridad").upsert(cambios, { onConflict: "user_id" });
  if (error) volver("/", "error", "No se pudo guardar. Intente otra vez.");
  revalidatePath("/", "layout");
  volver("/", "ok", "Listo. Ya puede usar el sistema.");
}

/** Cambia el PIN pidiendo el actual. */
export async function cambiarPin(fd: FormData) {
  const ctx = await obtenerContexto();
  await exigirPin(ctx.userId, fd, "/cuenta");
  const nuevo = texto(fd, "pin_nuevo") ?? "";
  const problema = pinValido(nuevo);
  if (problema) volver("/cuenta", "error", problema);
  if (nuevo !== texto(fd, "pin_repetir")) volver("/cuenta", "error", "Los dos PIN no coinciden.");
  const { error } = await supabaseServicio()
    .from("perfil_seguridad")
    .update({ pin_hash: hashPin(nuevo), pin_actualizado_en: new Date().toISOString(), pin_intentos: 0, pin_bloqueado_hasta: null })
    .eq("user_id", ctx.userId);
  if (error) volver("/cuenta", "error", "No se pudo cambiar el PIN.");
  volver("/cuenta", "ok", "PIN cambiado.");
}
