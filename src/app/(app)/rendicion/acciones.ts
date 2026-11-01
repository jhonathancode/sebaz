"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { exigirPin } from "@/lib/pin";
import { supabaseServidor } from "@/lib/supabase/server";

export async function generarRendicion(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const destino = `/rendicion?mes=${periodo}&fuente=${fuente}`;
  await exigirPin(ctx.userId, fd, destino);
  const cps = fd.getAll("cp").map(String).filter(Boolean);
  if (cps.length === 0) volver(destino, "error", "Marque al menos un comprobante de pago.");
  const { data, error } = await supabase.rpc("generar_rendicion", {
    p_mcp: ctx.mcp.id,
    p_fuente: fuente,
    p_periodo: periodo,
    p_comprobantes: cps,
  });
  if (error) volver(destino, "error", mensajeError(error));
  revalidatePath("/rendicion");
  revalidatePath("/comprobantes");
  volver(`/rendicion/${data}`, "ok", "Rendición generada. Revise el informe e imprímalo.");
}

export async function anularRendicion(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const { error } = await supabase.rpc("anular_rendicion", { p_rendicion: id, p_motivo: texto(fd, "motivo") });
  if (error) volver(`/rendicion/${id}`, "error", mensajeError(error));
  revalidatePath("/rendicion");
  volver(`/rendicion/${id}`, "ok", "Rendición anulada. Los comprobantes quedaron libres para armarla de nuevo.");
}

export async function marcarEntregada(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const { error } = await supabase.from("rendiciones").update({ estado: "entregada" }).eq("id", id).eq("estado", "generada");
  if (error) volver(`/rendicion/${id}`, "error", mensajeError(error));
  volver(`/rendicion/${id}`, "ok", "Rendición marcada como entregada.");
}

export async function cambiarDestinoCP(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const actual = texto(fd, "fuente_actual")!;
  const nuevo = texto(fd, "fuente_nueva");
  const volverA = `/rendicion?mes=${periodo}&fuente=${actual}`;
  if (!nuevo) volver(volverA, "error", "Elija a qué municipalidad se rendirá.");
  const { error } = await supabase.rpc("cambiar_destino_cp", {
    p_cp: texto(fd, "cp")!,
    p_fuente: nuevo,
    p_motivo: texto(fd, "motivo") ?? "",
  });
  if (error) volver(volverA, "error", mensajeError(error));
  revalidatePath("/rendicion");
  volver(volverA, "ok", "Listo: el comprobante cambió de destino y quedó registrado en auditoría.");
}
