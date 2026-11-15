"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";
import { DENOMINACIONES, sumarConteo } from "@/lib/arqueo";

export async function registrarArqueo(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const cajaId = texto(fd, "caja_id")!;
  const volverA = texto(fd, "volver") ?? "/caja-chica";
  if (!tiene(ctx, "admin", "tesorero")) volver(volverA, "error", "Solo el tesorero o el administrador hacen el arqueo.");
  const { data: caja } = await supabase.from("cajas_chicas").select("id, monto_fondo").eq("id", cajaId).single();
  if (!caja) volver(volverA, "error", "No se encontró la caja chica.");
  const conteo: Record<string, number> = {};
  DENOMINACIONES.forEach((d) => {
    const n = Math.max(0, Math.floor(Number(fd.get(`d_${d}`)) || 0));
    if (n) conteo[d] = n;
  });
  const efectivo = sumarConteo(conteo);
  const { data: gastos } = await supabase.from("caja_chica_gastos").select("monto").eq("caja_id", cajaId).eq("anulado", false);
  const comprobantes = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0);
  const fondo = Number(caja.monto_fondo);
  const diferencia = Math.round((efectivo + comprobantes - fondo) * 100) / 100;
  const fecha = texto(fd, "fecha") ?? new Date().toISOString().slice(0, 10);
  const anio = Number(fecha.slice(0, 4));
  const { data: ult } = await supabase.from("arqueos_caja").select("numero").eq("mcp_id", ctx.mcp.id).eq("anio", anio).order("numero", { ascending: false }).limit(1);
  const numero = (ult?.[0]?.numero ?? 0) + 1;
  const { data, error } = await supabase
    .from("arqueos_caja")
    .insert({
      mcp_id: ctx.mcp.id, caja_id: cajaId, numero, anio, fecha,
      hora: texto(fd, "hora"), conteo, efectivo, comprobantes, fondo, diferencia,
      observaciones: texto(fd, "observaciones")?.toUpperCase() ?? null,
    })
    .select("id")
    .single();
  if (error || !data) volver(volverA, "error", mensajeError(error));
  revalidatePath("/caja-chica");
  volver(`/caja-chica/arqueo/${data.id}`, "ok", diferencia === 0 ? "Arqueo registrado: el fondo cuadra." : "Arqueo registrado con diferencia. Revise el acta.");
}

export async function anularArqueo(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const volverA = texto(fd, "volver") ?? "/caja-chica";
  const { error } = await supabase.from("arqueos_caja").update({ anulado: true, anulado_motivo: texto(fd, "motivo") }).eq("id", texto(fd, "id")!);
  if (error) volver(volverA, "error", mensajeError(error));
  revalidatePath("/caja-chica");
  volver(volverA, "ok", "Arqueo anulado. Queda en el historial.");
}
