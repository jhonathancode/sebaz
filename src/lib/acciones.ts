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
  if (m.includes("duplicate key")) return "Ya existe un registro con esos datos.";
  if (m.includes("expedientes_tipo_check") || m.includes("fuentes_tipo_check"))
    return "El sistema necesita una actualización para registrar este tipo de gasto. Avise a soporte.";
  if (m.includes("violates check constraint")) return "Algún dato no tiene el formato correcto.";
  return m;
}

/** Vuelve a la ruta con un aviso (?ok=) o un error (?error=). */
export function volver(ruta: string, tipo: "ok" | "error", msg: string): never {
  const sep = ruta.includes("?") ? "&" : "?";
  redirect(`${ruta}${sep}${tipo}=${encodeURIComponent(msg)}`);
}
