"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

/** "Función|Categoría" del selector → columnas separadas. */
function funcionCategoria(fd: FormData) {
  const [funcion, categoria] = (texto(fd, "categoria_funcion") ?? "").split("|");
  return { funcion: funcion || null, categoria: categoria || null };
}

const ruta = (id: string, fase?: string) => `/expedientes/${id}${fase ? `?fase=${fase}` : ""}`;

export async function crearExpediente(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();

  const items: { item: number; cantidad: number; unidad: string; descripcion: string; precio_unitario: number }[] = [];
  for (let i = 1; i <= 10; i++) {
    const descripcion = texto(fd, `desc_${i}`);
    if (!descripcion) continue;
    const cantidad = numero(fd, `cant_${i}`) ?? 0;
    const precio = numero(fd, `precio_${i}`) ?? 0;
    if (cantidad <= 0) volver("/expedientes/nuevo", "error", `Ítem ${i}: la cantidad debe ser mayor que cero.`);
    items.push({ item: items.length + 1, cantidad, unidad: texto(fd, `und_${i}`) ?? "UND", descripcion, precio_unitario: precio });
  }
  if (items.length === 0) volver("/expedientes/nuevo", "error", "Agregue al menos un ítem al requerimiento.");

  const { data, error } = await supabase
    .from("expedientes")
    .insert({
      mcp_id: ctx.mcp.id,
      fecha: texto(fd, "fecha"),
      tipo: texto(fd, "tipo") ?? "servicio",
      descripcion: texto(fd, "descripcion"),
      area_usuaria: texto(fd, "area_usuaria"),
      fuente_id: texto(fd, "fuente_id"),
      meta: texto(fd, "meta"),
      clasificador: texto(fd, "clasificador"),
    })
    .select("id")
    .single();
  if (error || !data) volver("/expedientes/nuevo", "error", mensajeError(error));

  const { error: e2 } = await supabase
    .from("expediente_items")
    .insert(items.map((it) => ({ ...it, mcp_id: ctx.mcp.id, expediente_id: data.id })));
  if (e2) volver(ruta(data.id), "error", "Se creó el expediente pero no sus ítems: " + mensajeError(e2));

  revalidatePath("/expedientes");
  volver(ruta(data.id), "ok", "Requerimiento registrado. Envíelo al alcalde para su aprobación.");
}

export async function cambiarEstadoExpediente(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const accion = texto(fd, "accion");
  const cambios: Record<string, string | null> = {};
  if (accion === "aprobar") cambios.estado = "aprobado";
  else if (accion === "devolver") {
    cambios.estado = "borrador";
    cambios.motivo_devolucion = texto(fd, "motivo");
  } else if (accion === "anular") {
    cambios.estado = "anulado";
    cambios.anulado_motivo = texto(fd, "motivo");
  }
  const { error } = await supabase.from("expedientes").update(cambios).eq("id", id);
  if (error) volver(ruta(id), "error", mensajeError(error));
  revalidatePath("/expedientes");
  const msj = { aprobar: "Requerimiento aprobado.", devolver: "Devuelto a borrador.", anular: "Expediente anulado." };
  volver(ruta(id, accion === "aprobar" ? "cotizacion" : undefined), "ok", msj[accion as keyof typeof msj] ?? "Listo.");
}

/** Busca el proveedor por documento; si no existe, lo registra. */
async function proveedorPorDocumento(mcpId: string, fd: FormData, volverA: string): Promise<string> {
  const supabase = await supabaseServidor();
  const doc = (texto(fd, "num_doc") ?? "").replace(/\D/g, "");
  const tipo = doc.length === 8 ? "DNI" : "RUC";
  if (doc.length !== 8 && doc.length !== 11) volver(volverA, "error", "El RUC debe tener 11 dígitos (o el DNI 8).");
  const { data: existe } = await supabase.from("proveedores").select("id").eq("mcp_id", mcpId).eq("num_doc", doc).maybeSingle();
  if (existe) return existe.id;
  const razon = texto(fd, "razon_social");
  if (!razon) volver(volverA, "error", "Proveedor nuevo: escriba la razón social.");
  const { data, error } = await supabase
    .from("proveedores")
    .insert({ mcp_id: mcpId, tipo_doc: tipo, num_doc: doc, razon_social: razon, direccion: texto(fd, "direccion"), telefono: texto(fd, "telefono") })
    .select("id")
    .single();
  if (error || !data) volver(volverA, "error", mensajeError(error));
  return data.id;
}

export async function agregarCotizacion(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "expediente_id")!;
  const destino = ruta(id, "cotizacion");
  const proveedorId = await proveedorPorDocumento(ctx.mcp.id, fd, destino);
  const monto = numero(fd, "monto");
  if (monto === null || monto < 0) volver(destino, "error", "Escriba el monto de la cotización.");
  const { error } = await supabase
    .from("cotizaciones")
    .insert({ mcp_id: ctx.mcp.id, expediente_id: id, proveedor_id: proveedorId, monto, plazo: texto(fd, "plazo") });
  if (error) volver(destino, "error", mensajeError(error));
  await supabase.from("expedientes").update({ fase: "cotizacion" }).eq("id", id).eq("fase", "requerimiento");
  volver(destino, "ok", "Cotización agregada.");
}

export async function elegirCotizacion(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "expediente_id")!;
  const cot = texto(fd, "cotizacion_id")!;
  const destino = ruta(id, "cotizacion");
  // Una sola elegida: primero se quita la anterior.
  const { error: e1 } = await supabase.from("cotizaciones").update({ elegida: false }).eq("expediente_id", id).eq("elegida", true);
  if (e1) volver(destino, "error", mensajeError(e1));
  const { error } = await supabase.from("cotizaciones").update({ elegida: true }).eq("id", cot);
  if (error) volver(destino, "error", mensajeError(error));
  volver(destino, "ok", "Proveedor elegido. Ya puede emitir la orden.");
}

export async function anularRegistro(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "expediente_id")!;
  const tabla = texto(fd, "tabla")!;
  const fase = texto(fd, "fase") ?? undefined;
  if (!["cotizaciones", "ordenes", "conformidades"].includes(tabla)) volver(ruta(id), "error", "Registro no válido.");
  const motivo = texto(fd, "motivo");
  if (!motivo || motivo.length < 10) volver(ruta(id, fase), "error", "Para anular escriba un motivo de al menos 10 caracteres.");
  const cambios: Record<string, unknown> = { anulado: true };
  if (tabla !== "cotizaciones") cambios.anulado_motivo = motivo;
  else cambios.elegida = false;
  const { error } = await supabase.from(tabla).update(cambios).eq("id", texto(fd, "registro_id")!);
  if (error) volver(ruta(id, fase), "error", mensajeError(error));
  volver(ruta(id, fase), "ok", "Registro anulado. Queda en el historial.");
}

export async function emitirOrden(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "expediente_id")!;
  const destino = ruta(id, "orden");
  const { data: exp } = await supabase.from("expedientes").select("tipo, estado, descripcion").eq("id", id).single();
  if (!exp || exp.estado !== "aprobado") volver(destino, "error", "El requerimiento debe estar aprobado por el alcalde.");
  const { data: elegida } = await supabase
    .from("cotizaciones")
    .select("proveedor_id, monto")
    .eq("expediente_id", id)
    .eq("elegida", true)
    .eq("anulado", false)
    .maybeSingle();
  if (!elegida) volver(destino, "error", "Primero elija la cotización ganadora.");
  const { error } = await supabase.from("ordenes").insert({
    mcp_id: ctx.mcp.id,
    expediente_id: id,
    tipo: exp.tipo,
    fecha: texto(fd, "fecha"),
    proveedor_id: elegida.proveedor_id,
    concepto: texto(fd, "concepto") ?? exp.descripcion,
    plazo: texto(fd, "plazo"),
    monto: elegida.monto,
  });
  if (error) volver(destino, "error", mensajeError(error));
  await supabase.from("expedientes").update({ fase: "orden" }).eq("id", id);
  volver(destino, "ok", `Orden de ${exp.tipo} emitida.`);
}

export async function emitirConformidad(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "expediente_id")!;
  const destino = ruta(id, "conformidad");
  const { data: orden } = await supabase.from("ordenes").select("id").eq("expediente_id", id).eq("anulado", false).maybeSingle();
  if (!orden) volver(destino, "error", "Primero emita la orden.");
  const { error } = await supabase.from("conformidades").insert({
    mcp_id: ctx.mcp.id,
    expediente_id: id,
    fecha: texto(fd, "fecha"),
    texto: texto(fd, "texto"),
  });
  if (error) volver(destino, "error", mensajeError(error));
  await supabase.from("expedientes").update({ fase: "conformidad" }).eq("id", id);
  volver(destino, "ok", "Memorando de conformidad emitido.");
}

export async function generarComprobante(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "expediente_id")!;
  const destino = ruta(id, "comprobante");
  const { data: exp } = await supabase
    .from("expedientes")
    .select("fuente_id, descripcion, clasificador")
    .eq("id", id)
    .single();
  const { data: orden } = await supabase
    .from("ordenes")
    .select("monto, concepto, proveedores(razon_social, num_doc)")
    .eq("expediente_id", id)
    .eq("anulado", false)
    .maybeSingle();
  if (!exp || !orden) volver(destino, "error", "Falta la orden del expediente.");
  if (!exp.fuente_id) volver(destino, "error", "El expediente no tiene municipalidad que transfiere (fuente).");
  const prov = orden.proveedores as unknown as { razon_social: string; num_doc: string } | null;
  const { data, error } = await supabase
    .from("comprobantes_pago")
    .insert({
      mcp_id: ctx.mcp.id,
      fecha: texto(fd, "fecha"),
      origen: "expediente",
      expediente_id: id,
      fuente_id: exp.fuente_id,
      beneficiario: prov?.razon_social ?? "",
      beneficiario_doc: prov?.num_doc,
      concepto: orden.concepto,
      importe: orden.monto,
      partida: exp.clasificador,
      ...funcionCategoria(fd),
      sustento_tipo: texto(fd, "sustento_tipo"),
      sustento_numero: texto(fd, "sustento_numero"),
    })
    .select("id")
    .single();
  if (error || !data) volver(destino, "error", mensajeError(error));
  await supabase.from("expedientes").update({ fase: "comprobante" }).eq("id", id);
  revalidatePath("/comprobantes");
  volver(`/comprobantes/${data.id}`, "ok", "Comprobante de pago generado en borrador.");
}
