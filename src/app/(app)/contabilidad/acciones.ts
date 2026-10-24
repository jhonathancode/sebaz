"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

const ir = (ver: string, mes: string) => `/contabilidad?ver=${ver}&mes=${mes}`;

/** Saldo inicial del año (banco y caja). Se puede corregir; queda en la auditoría. */
export async function guardarSaldoInicial(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = texto(fd, "mes")!;
  const anio = Number(mes.slice(0, 4));
  const datos = { saldo_banco: numero(fd, "saldo_banco") ?? 0, saldo_caja: numero(fd, "saldo_caja") ?? 0, observacion: texto(fd, "observacion") };
  const { data: hay } = await supabase.from("saldos_iniciales").select("id").eq("mcp_id", ctx.mcp.id).eq("anio", anio).maybeSingle();
  const { error } = hay
    ? await supabase.from("saldos_iniciales").update(datos).eq("id", hay.id)
    : await supabase.from("saldos_iniciales").insert({ mcp_id: ctx.mcp.id, anio, ...datos });
  if (error) volver(ir("datos", mes), "error", mensajeError(error));
  revalidatePath("/contabilidad");
  volver(ir("datos", mes), "ok", `Saldo inicial ${anio} guardado.`);
}

/** Transferencia recibida en la cuenta (fecha real y N° de operación). */
export async function registrarTransferencia(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = texto(fd, "mes")!;
  const monto = numero(fd, "monto");
  if (!monto || monto <= 0) volver(ir("datos", mes), "error", "Escriba el monto recibido.");
  const { error } = await supabase.from("transferencias_recibidas").insert({
    mcp_id: ctx.mcp.id,
    fuente_id: texto(fd, "fuente_id"),
    periodo: texto(fd, "periodo"),
    fecha: texto(fd, "fecha"),
    monto,
    documento: texto(fd, "documento"),
  });
  if (error) volver(ir("datos", mes), "error", error.message.includes("transferencia_vigente_unica") ? "Esa transferencia ya está registrada para ese mes." : mensajeError(error));
  revalidatePath("/contabilidad");
  volver(ir("datos", mes), "ok", "Transferencia registrada.");
}

export async function anularTransferencia(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = texto(fd, "mes")!;
  const { error } = await supabase.from("transferencias_recibidas").update({ anulado: true, anulado_motivo: texto(fd, "motivo") }).eq("id", texto(fd, "id")!);
  if (error) volver(ir("datos", mes), "error", mensajeError(error));
  revalidatePath("/contabilidad");
  volver(ir("datos", mes), "ok", "Transferencia anulada.");
}

/** Saldo del extracto bancario al cierre del mes (para la conciliación). */
export async function guardarExtracto(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = texto(fd, "mes")!;
  const saldo = numero(fd, "saldo_extracto");
  if (saldo === null) volver(ir("conciliacion", mes), "error", "Escriba el saldo del extracto.");
  const datos = { saldo_extracto: saldo, observacion: texto(fd, "observacion") };
  const { data: hay } = await supabase.from("conciliaciones").select("id").eq("mcp_id", ctx.mcp.id).eq("periodo", mes).maybeSingle();
  const { error } = hay
    ? await supabase.from("conciliaciones").update(datos).eq("id", hay.id)
    : await supabase.from("conciliaciones").insert({ mcp_id: ctx.mcp.id, periodo: mes, ...datos });
  if (error) volver(ir("conciliacion", mes), "error", mensajeError(error));
  revalidatePath("/contabilidad");
  volver(ir("conciliacion", mes), "ok", "Saldo del extracto guardado.");
}

/** Marca los cheques que el banco ya cobró (según el extracto). */
export async function marcarCobrados(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = texto(fd, "mes")!;
  const ids = fd.getAll("cp").map(String);
  const fecha = texto(fd, "fecha_cobro");
  if (!ids.length) volver(ir("conciliacion", mes), "error", "Marque los cheques que ya cobró el banco.");
  if (!fecha) volver(ir("conciliacion", mes), "error", "Indique la fecha de cobro.");
  const { error } = await supabase.from("cheques_cobrados").insert(ids.map((id) => ({ mcp_id: ctx.mcp.id, comprobante_id: id, fecha_cobro: fecha })));
  if (error) volver(ir("conciliacion", mes), "error", mensajeError(error));
  revalidatePath("/contabilidad");
  volver(ir("conciliacion", mes), "ok", `${ids.length} cheque(s) marcados como cobrados.`);
}
