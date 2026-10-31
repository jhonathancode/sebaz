"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

const ruta = (periodo: string, fuente: string) => `/caja-chica?mes=${periodo}&fuente=${fuente}`;

export async function abrirCaja(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const monto = numero(fd, "monto_fondo");
  if (!monto || monto <= 0) volver(ruta(periodo, fuente), "error", "Escriba el monto del fondo.");
  const { error } = await supabase.from("cajas_chicas").insert({
    mcp_id: ctx.mcp.id,
    periodo,
    fuente_id: fuente,
    monto_fondo: monto,
    responsable_id: texto(fd, "responsable_id"),
    numero_cheque: texto(fd, "numero_cheque")?.toUpperCase() ?? null,
  });
  if (error) volver(ruta(periodo, fuente), "error", mensajeError(error));
  volver(ruta(periodo, fuente), "ok", "Fondo de caja chica abierto.");
}

export async function agregarGasto(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const monto = numero(fd, "monto");
  if (!monto || monto <= 0) volver(ruta(periodo, fuente), "error", "Escriba el monto del gasto.");
  const fechaGasto = texto(fd, "fecha") ?? "";
  if (!fechaGasto.startsWith(periodo)) volver(ruta(periodo, fuente), "error", "La fecha del gasto debe ser del mismo mes del fondo.");
  const tipo = texto(fd, "sustento_tipo") ?? "DJ";
  const { error } = await supabase.from("caja_chica_gastos").insert({
    mcp_id: ctx.mcp.id,
    caja_id: texto(fd, "caja_id"),
    fecha: fechaGasto,
    concepto: texto(fd, "concepto"),
    sustento_tipo: tipo,
    sustento_numero: tipo === "DJ" ? null : texto(fd, "sustento_numero"),
    razon_social: texto(fd, "razon_social"),
    monto,
  });
  if (error) volver(ruta(periodo, fuente), "error", mensajeError(error));
  revalidatePath("/caja-chica");
  volver(ruta(periodo, fuente), "ok", "Gasto registrado.");
}

export async function anularGasto(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const { error } = await supabase
    .from("caja_chica_gastos")
    .update({ anulado: true, anulado_motivo: texto(fd, "motivo") })
    .eq("id", texto(fd, "gasto_id")!);
  if (error) volver(ruta(periodo, fuente), "error", mensajeError(error));
  volver(ruta(periodo, fuente), "ok", "Gasto anulado. Queda en el historial.");
}

export async function liquidarCaja(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const { data, error } = await supabase.rpc("liquidar_caja_chica", { p_caja: texto(fd, "caja_id") });
  if (error) volver(ruta(periodo, fuente), "error", mensajeError(error));
  revalidatePath("/comprobantes");
  volver(`/comprobantes/${data}`, "ok", "Caja chica liquidada. Se generó su comprobante de pago en borrador.");
}

export async function cambiarCheque(fd: FormData) {
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const cheque = texto(fd, "numero_cheque")?.toUpperCase() ?? null;
  const { error } = await supabase.from("cajas_chicas").update({ numero_cheque: cheque }).eq("id", texto(fd, "caja_id") ?? "");
  if (error) volver(ruta(periodo, fuente), "error", mensajeError(error));
  volver(ruta(periodo, fuente), "ok", "Número de cheque guardado.");
}
