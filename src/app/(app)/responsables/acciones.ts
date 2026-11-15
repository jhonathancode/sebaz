"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

const RUTA = "/responsables";

export async function registrarDesignacion(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin")) volver(RUTA, "error", "Solo el administrador registra designaciones.");
  const supabase = await supabaseServidor();
  const cargo = texto(fd, "cargo")?.toUpperCase();
  const nombre = texto(fd, "nombre")?.toUpperCase();
  const resolucion = texto(fd, "resolucion")?.toUpperCase();
  const fres = texto(fd, "fecha_resolucion");
  const desde = texto(fd, "desde");
  const hasta = texto(fd, "hasta");
  if (!cargo || !nombre || !resolucion || !fres || !desde) volver(RUTA, "error", "Escriba el cargo, el nombre, la resolución, su fecha y desde cuándo rige.");
  if (hasta && hasta < desde) volver(RUTA, "error", "La fecha final no puede ser antes del inicio.");
  const { error } = await supabase.from("designaciones_responsables").insert({
    mcp_id: ctx.mcp.id, cargo, nombre, documento: texto(fd, "documento"), resolucion, fecha_resolucion: fres, desde, hasta,
    observacion: texto(fd, "observacion")?.toUpperCase() ?? null,
  });
  if (error) volver(RUTA, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(RUTA, "ok", "Designación registrada.");
}

export async function anularDesignacion(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin")) volver(RUTA, "error", "Solo el administrador anula designaciones.");
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("designaciones_responsables").update({ anulado: true, anulado_motivo: texto(fd, "motivo") }).eq("id", texto(fd, "id")!);
  if (error) volver(RUTA, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(RUTA, "ok", "Designación anulada. Queda en el historial.");
}
