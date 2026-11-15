"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";
import { CONCEPTOS_VIAJE } from "@/lib/viaticos";

const RUTA = "/caja-chica/viaticos";
const concepto = (v: string | null) => (CONCEPTOS_VIAJE.some((c) => c.v === v) ? (v as string) : "otro");

export async function guardarTarifaViaje(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero")) volver(RUTA, "error", "Solo el tesorero o el administrador cambian el tarifario.");
  const supabase = await supabaseServidor();
  const destino = texto(fd, "destino")?.toUpperCase();
  const monto = numero(fd, "monto");
  if (!destino) volver(RUTA, "error", "Escriba el destino.");
  if (!monto || monto <= 0) volver(RUTA, "error", "Escriba el monto de la tarifa.");
  const u = texto(fd, "unidad");
  const datos = { destino, concepto: concepto(texto(fd, "concepto")), detalle: texto(fd, "detalle")?.toUpperCase() ?? null, unidad: u === "noche" || u === "dia" ? u : "viaje", monto };
  const id = texto(fd, "id");
  const { error } = id ? await supabase.from("tarifas_viaje").update(datos).eq("id", id) : await supabase.from("tarifas_viaje").insert({ ...datos, mcp_id: ctx.mcp.id });
  if (error) volver(RUTA, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(RUTA, "ok", id ? "Tarifa corregida." : "Tarifa agregada.");
}

export async function activarTarifaViaje(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const activo = texto(fd, "activo") === "1";
  const { error } = await supabase.from("tarifas_viaje").update({ activo }).eq("id", texto(fd, "id")!);
  if (error) volver(RUTA, "error", mensajeError(error));
  volver(RUTA, "ok", activo ? "Tarifa activada." : "Tarifa archivada. Las comisiones ya hechas no cambian.");
}

export async function crearComision(fd: FormData) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero")) volver(RUTA, "error", "Solo el tesorero o el administrador registran comisiones.");
  const supabase = await supabaseServidor();
  const comisionado = texto(fd, "comisionado")?.toUpperCase();
  const destino = texto(fd, "destino")?.toUpperCase();
  const motivo = texto(fd, "motivo")?.toUpperCase();
  const salida = texto(fd, "fecha_salida") ?? "";
  const retorno = texto(fd, "fecha_retorno") ?? "";
  if (!comisionado || !destino || !motivo) volver(RUTA, "error", "Escriba el comisionado, el destino y el motivo.");
  if (!salida || !retorno || retorno < salida) volver(RUTA, "error", "Revise las fechas: el retorno no puede ser antes de la salida.");
  const items = fd.getAll("idx").map((k) => {
    const cantidad = Number(String(fd.get(`cantidad_${k}`) ?? "").replace(",", "."));
    const precio = Number(String(fd.get(`precio_${k}`) ?? "").replace(",", "."));
    return { concepto: concepto(String(fd.get(`concepto_${k}`) ?? "")), detalle: String(fd.get(`detalle_${k}`) ?? "").trim().toUpperCase() || null, cantidad, precio, subtotal: Math.round(cantidad * precio * 100) / 100 };
  });
  if (!items.length || items.some((i) => !(i.cantidad > 0) || !(i.precio > 0))) volver(RUTA, "error", "Agregue al menos un gasto, cada uno con cantidad y precio mayores a cero.");
  const cajaId = texto(fd, "caja_id");
  if (cajaId) {
    const { data: caja } = await supabase.from("cajas_chicas").select("periodo, estado").eq("id", cajaId).single();
    if (!caja || caja.estado !== "abierta") volver(RUTA, "error", "La caja chica elegida no está abierta.");
  }
  const total = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  const anio = Number(salida.slice(0, 4));
  const { data: ult } = await supabase.from("comisiones_viaje").select("numero").eq("mcp_id", ctx.mcp.id).eq("anio", anio).order("numero", { ascending: false }).limit(1);
  const { data: c, error } = await supabase
    .from("comisiones_viaje")
    .insert({ mcp_id: ctx.mcp.id, numero: (ult?.[0]?.numero ?? 0) + 1, anio, caja_id: cajaId, comisionado, documento: texto(fd, "documento"), cargo: texto(fd, "cargo")?.toUpperCase() ?? null, destino, motivo, fecha_salida: salida, fecha_retorno: retorno, total })
    .select("id")
    .single();
  if (error || !c) volver(RUTA, "error", mensajeError(error));
  const { error: eI } = await supabase.from("comision_viaje_items").insert(items.map((i) => ({ ...i, mcp_id: ctx.mcp.id, comision_id: c.id })));
  if (eI) volver(RUTA, "error", "Se creó la comisión pero no sus gastos: " + mensajeError(eI));
  revalidatePath(RUTA);
  volver(`${RUTA}/${c.id}`, "ok", "Comisión de servicio registrada.");
}

export async function pasarComisionACaja(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const aqui = `${RUTA}/${id}`;
  if (!tiene(ctx, "admin", "tesorero")) volver(aqui, "error", "Solo el tesorero o el administrador pasan la comisión a la caja.");
  const { data: c } = await supabase.from("comisiones_viaje").select("*").eq("id", id).single();
  if (!c || c.anulado) volver(aqui, "error", "La comisión no está vigente.");
  if (c.gasto_id) volver(aqui, "error", "Esta comisión ya está en la caja chica.");
  const cajaId = texto(fd, "caja_id") ?? c.caja_id;
  if (!cajaId) volver(aqui, "error", "Elija la caja chica.");
  const { data: caja } = await supabase.from("cajas_chicas").select("periodo, estado").eq("id", cajaId).single();
  if (!caja || caja.estado !== "abierta") volver(aqui, "error", "La caja chica elegida no está abierta.");
  if (!c.fecha_retorno.startsWith(caja.periodo)) volver(aqui, "error", "La fecha de retorno debe ser del mes de la caja chica.");
  const codigo = `V${String(c.numero).padStart(3, "0")}-${c.anio}`;
  const { data: g, error } = await supabase
    .from("caja_chica_gastos")
    .insert({ mcp_id: ctx.mcp.id, caja_id: cajaId, fecha: c.fecha_retorno, concepto: `COMISIÓN DE SERVICIO A ${c.destino} (${codigo}): ${c.motivo}`, sustento_tipo: "PM", sustento_numero: codigo, razon_doc: c.documento, razon_social: c.comisionado, monto: c.total })
    .select("id")
    .single();
  if (error || !g) volver(aqui, "error", mensajeError(error));
  await supabase.from("comisiones_viaje").update({ gasto_id: g.id, caja_id: cajaId }).eq("id", id);
  revalidatePath("/caja-chica");
  volver(aqui, "ok", "Listo: la comisión quedó como gasto de la caja chica.");
}

export async function anularComision(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const aqui = `${RUTA}/${id}`;
  const motivo = texto(fd, "motivo");
  const { data: c } = await supabase.from("comisiones_viaje").select("gasto_id").eq("id", id).single();
  if (c?.gasto_id) {
    const { error: eG } = await supabase.from("caja_chica_gastos").update({ anulado: true, anulado_motivo: `COMISIÓN DE SERVICIO ANULADA: ${motivo}` }).eq("id", c.gasto_id);
    if (eG) volver(aqui, "error", mensajeError(eG));
  }
  const { error } = await supabase.from("comisiones_viaje").update({ anulado: true, anulado_motivo: motivo }).eq("id", id);
  if (error) volver(aqui, "error", mensajeError(error));
  revalidatePath("/caja-chica");
  volver(aqui, "ok", "Comisión anulada. Queda en el historial.");
}
