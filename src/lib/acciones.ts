import { redirect } from "next/navigation";

/** Texto de un campo de formulario, recortado. Vacío → null. */
export function texto(fd: FormData, campo: string): string | null {
  const v = fd.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function numero(fd: FormData, campo: string): number | null {
  const t = texto(fd, campo);
  if (t === null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Mensaje de error de Postgres/Supabase en lenguaje de la app. */
export function mensajeError(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? "Error desconocido.";
  if (m.includes("row-level security")) return "No tiene permiso para esta acción.";
  if (m.includes("pago_fijo_mes_unico")) return "Ese pago fijo ya está registrado para ese mes. Elija otro mes o revise los expedientes.";
  if (m.includes("duplicate key")) return "Ya existe un registro con esos datos.";
  // Solo cuando de verdad falta una columna o tabla en la base (no por cualquier error que la mencione)
  if (/does not exist|schema cache|violates check constraint "(expedientes|fuentes)_tipo_check"/.test(m) && /(dia_limite|emitir_nea|emitir_pecosa|almacen|sin_almacen_motivo|pago_fijo|mes_pagado|tipo_check|logo)/.test(m))
    return "El sistema necesita una actualización (ACTUALIZAR_BASE.sql). Avise a soporte.";
  if (m.includes("violates check constraint")) return "Algún dato no tiene el formato correcto.";
  return m;
}

/** Vuelve a la ruta con un aviso (?ok=) o un error (?error=). */
export function volver(ruta: string, tipo: "ok" | "error", msg: string): never {
  const sep = ruta.includes("?") ? "&" : "?";
  redirect(`${ruta}${sep}${tipo}=${encodeURIComponent(msg)}`);
}
