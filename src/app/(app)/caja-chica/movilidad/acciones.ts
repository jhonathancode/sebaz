"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

const RUTA = "/caja-chica/movilidad";
const tipoOk = (t: string | null) => (t === "taxi" ? "taxi" : "urbano");

export async function guardarTarifa(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero")) volver(RUTA, "error", "Solo el tesorero o el administrador cambian el tarifario.");
  const supabase = await supabaseServidor();
  const monto = numero(fd, "monto");
  const destino = texto(fd, "destino")?.toUpperCase();
  if (!destino) volver(RUTA, "error", "Escriba el destino.");
  if (!monto || monto <= 0) volver(RUTA, "error", "Escriba el monto de la tarifa.");
  const id = texto(fd, "id");
  const datos = { destino, tipo: tipoOk(texto(fd, "tipo")), monto };
  const { error } = id
    ? await supabase.from("tarifas_movilidad").update(datos).eq("id", id)
    : await supabase.from("tarifas_movilidad").insert({ ...datos, mcp_id: ctx.mcp.id });
  if (error) volver(RUTA, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(RUTA, "ok", id ? "Tarifa corregida." : "Tarifa agregada al tarifario.");
}

export async function activarTarifa(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const activo = texto(fd, "activo") === "1";
  const { error } = await supabase.from("tarifas_movilidad").update({ activo }).eq("id", texto(fd, "id")!);
  if (error) volver(RUTA, "error", mensajeError(error));
  volver(RUTA, "ok", activo ? "Tarifa activada." : "Tarifa archivada. Las planillas ya hechas no cambian.");
}

export async function crearPlanilla(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero")) volver(RUTA, "error", "Solo el tesorero o el administrador registran planillas.");
  const supabase = await supabaseServidor();
  const comisionado = texto(fd, "comisionado")?.toUpperCase();
  const motivo = texto(fd, "motivo")?.toUpperCase();
  if (!comisionado || !motivo) volver(RUTA, "error", "Escriba el comisionado y el motivo de la movilidad.");
  const items = fd.getAll("idx").map((k) => ({
    fecha: String(fd.get(`fecha_${k}`) ?? ""),
    destino: String(fd.get(`destino_${k}`) ?? "").trim().toUpperCase(),
    tipo: tipoOk(String(fd.get(`tipo_${k}`) ?? "")),
    monto: Number(String(fd.get(`monto_${k}`) ?? "").replace(",", ".")),
  }));
  if (!items.length || items.some((i) => !i.fecha || !i.destino || !(i.monto > 0))) volver(RUTA, "error", "Cada viaje necesita fecha, destino y un monto mayor a cero.");
  const cajaId = texto(fd, "caja_id");
  if (cajaId) {
    const { data: caja } = await supabase.from("cajas_chicas").select("periodo, estado").eq("id", cajaId).single();
    if (!caja || caja.estado !== "abierta") volver(RUTA, "error", "La caja chica elegida no está abierta.");
    if (items.some((i) => !i.fecha.startsWith(caja.periodo))) volver(RUTA, "error", "Todas las fechas deben ser del mes de la caja chica elegida.");
  }
  const total = Math.round(items.reduce((s, i) => s + i.monto, 0) * 100) / 100;
  const anio = Number(items[0].fecha.slice(0, 4));
  const { data: ult } = await supabase.from("planillas_movilidad").select("numero").eq("mcp_id", ctx.mcp.id).eq("anio", anio).order("numero", { ascending: false }).limit(1);
  const nro = (ult?.[0]?.numero ?? 0) + 1;
  const { data: pl, error } = await supabase
    .from("planillas_movilidad")
    .insert({ mcp_id: ctx.mcp.id, numero: nro, anio, caja_id: cajaId, comisionado, documento: texto(fd, "documento"), cargo: texto(fd, "cargo")?.toUpperCase() ?? null, motivo, total })
    .select("id")
    .single();
  if (error || !pl) volver(RUTA, "error", mensajeError(error));
  const { error: eI } = await supabase.from("planilla_movilidad_items").insert(items.map((i) => ({ ...i, mcp_id: ctx.mcp.id, planilla_id: pl.id })));
  if (eI) volver(RUTA, "error", "Se creó la planilla pero no sus viajes: " + mensajeError(eI));
  revalidatePath(RUTA);
  volver(`${RUTA}/${pl.id}`, "ok", "Planilla de movilidad registrada.");
}

/** Pasa el total de la planilla a la caja chica como un gasto con sustento PM. */
export async function pasarACaja(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const aqui = `${RUTA}/${id}`;
  if (!tiene(ctx, "admin", "tesorero")) volver(aqui, "error", "Solo el tesorero o el administrador pasan la planilla a la caja.");
  const { data: pl } = await supabase.from("planillas_movilidad").select("*").eq("id", id).single();
  if (!pl || pl.anulado) volver(aqui, "error", "La planilla no está vigente.");
  if (pl.gasto_id) volver(aqui, "error", "Esta planilla ya está en la caja chica.");
  const cajaId = texto(fd, "caja_id") ?? pl.caja_id;
  if (!cajaId) volver(aqui, "error", "Elija la caja chica.");
  const { data: caja } = await supabase.from("cajas_chicas").select("periodo, estado").eq("id", cajaId).single();
  if (!caja || caja.estado !== "abierta") volver(aqui, "error", "La caja chica elegida no está abierta.");
  const { data: its } = await supabase.from("planilla_movilidad_items").select("fecha").eq("planilla_id", id).order("fecha", { ascending: false });
  const fecha = its?.[0]?.fecha;
  if (!fecha || (its ?? []).some((i) => !i.fecha.startsWith(caja.periodo))) volver(aqui, "error", "Las fechas de los viajes deben ser del mes de la caja chica.");
  const codigo = `${String(pl.numero).padStart(3, "0")}-${pl.anio}`;
  const { data: g, error } = await supabase
    .from("caja_chica_gastos")
    .insert({ mcp_id: ctx.mcp.id, caja_id: cajaId, fecha, concepto: `MOVILIDAD LOCAL SEGÚN PLANILLA ${codigo}: ${pl.motivo}`, sustento_tipo: "PM", sustento_numero: codigo, razon_doc: pl.documento, razon_social: pl.comisionado, monto: pl.total })
    .select("id")
    .single();
  if (error || !g) volver(aqui, "error", mensajeError(error));
  await supabase.from("planillas_movilidad").update({ gasto_id: g.id, caja_id: cajaId }).eq("id", id);
  revalidatePath("/caja-chica");
  volver(aqui, "ok", "Listo: la planilla quedó como gasto de la caja chica.");
}

export async function anularPlanilla(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const aqui = `${RUTA}/${id}`;
  const { data: pl } = await supabase.from("planillas_movilidad").select("gasto_id").eq("id", id).single();
  const motivo = texto(fd, "motivo");
  if (pl?.gasto_id) {
    const { error: eG } = await supabase.from("caja_chica_gastos").update({ anulado: true, anulado_motivo: `PLANILLA DE MOVILIDAD ANULADA: ${motivo}` }).eq("id", pl.gasto_id);
    if (eG) volver(aqui, "error", mensajeError(eG));
  }
  const { error } = await supabase.from("planillas_movilidad").update({ anulado: true, anulado_motivo: motivo }).eq("id", id);
  if (error) volver(aqui, "error", mensajeError(error));
  revalidatePath("/caja-chica");
  volver(aqui, "ok", "Planilla anulada. Queda en el historial.");
}
