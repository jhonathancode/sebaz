"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";
import { MESES, periodoActual } from "@/lib/formato";
import { cargarCatalogoPagosFijos, estadoPagosFijos, pasarAlMes, siguienteCheque } from "@/lib/pagosFijos";
import { comprobanteAutomatico } from "@/lib/comprobanteAuto";
import { leerCheque } from "../comprobantes/acciones";

/** "Función|Categoría" del selector → columnas separadas. */
function funcionCategoria(fd: FormData) {
  const [funcion, categoria] = (texto(fd, "categoria_funcion") ?? "").split("|");
  return { funcion: funcion || null, categoria: categoria || null };
}

const ruta = (id: string, fase?: string) => `/expedientes/${id}${fase ? `?fase=${fase}` : ""}`;

/** Lee las filas de ítems del formulario (las vacías se ignoran). */
function leerItems(fd: FormData, volverA: string) {
  const items: { item: number; cantidad: number; unidad: string; descripcion: string; precio_unitario: number }[] = [];
  for (let i = 1; i <= 30; i++) {
    const descripcion = texto(fd, `desc_${i}`);
    if (!descripcion) continue;
    const cantidad = numero(fd, `cant_${i}`) ?? 0;
    const precio = numero(fd, `precio_${i}`) ?? 0;
    if (cantidad <= 0) volver(volverA, "error", `Ítem ${i}: la cantidad debe ser mayor que cero.`);
    items.push({ item: items.length + 1, cantidad, unidad: texto(fd, `und_${i}`) ?? "UND", descripcion, precio_unitario: precio });
  }
  if (items.length === 0) volver(volverA, "error", "Agregue al menos un ítem al requerimiento.");
  return items;
}

function leerCabecera(fd: FormData) {
  return {
    fecha: texto(fd, "fecha"),
    tipo: texto(fd, "tipo") ?? "compra",
    descripcion: texto(fd, "descripcion"),
    area_usuaria: texto(fd, "area_usuaria"),
    fuente_id: texto(fd, "fuente_id"),
    meta: texto(fd, "meta"),
    clasificador: texto(fd, "clasificador"),
  };
}

export async function crearExpediente(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const items = leerItems(fd, "/expedientes?nuevo=1");
  const cabecera = leerCabecera(fd);
  // Pago fijo de la lista: qué pago y de qué mes (para no pagarlo dos veces)
  const pagoFijo = cabecera.tipo === "pago_fijo" ? texto(fd, "pago_fijo_id") : null;
  const mesPagado = pagoFijo ? texto(fd, "mes_pagado") : null;
  const chequePrevisto = cabecera.tipo === "pago_fijo" ? (texto(fd, "cheque_previsto") ?? "").replace(/\D/g, "") || null : null;
  if (chequePrevisto && !/^\d{4,12}$/.test(chequePrevisto)) volver("/expedientes?nuevo=1", "error", "El número de cheque debe tener de 4 a 12 dígitos.");
  const { data, error } = await supabase
    .from("expedientes")
    .insert({ mcp_id: ctx.mcp.id, ...cabecera, ...(pagoFijo ? { pago_fijo_id: pagoFijo, mes_pagado: mesPagado } : {}), ...(chequePrevisto ? { cheque_previsto: chequePrevisto } : {}) })
    .select("id")
    .single();
  if (error || !data) volver("/expedientes?nuevo=1", "error", mensajeError(error));

  const { error: e2 } = await supabase
    .from("expediente_items")
    .insert(items.map((it) => ({ ...it, mcp_id: ctx.mcp.id, expediente_id: data.id })));
  if (e2) volver(ruta(data.id), "error", "Se creó el expediente pero no sus ítems: " + mensajeError(e2));

  revalidatePath("/expedientes");
  // Pago fijo de la lista con cheque: si quien registra puede aprobar, todo queda listo de una vez.
  if (pagoFijo && tiene(ctx, "alcalde", "admin")) {
    const { error: eA } = await supabase.from("expedientes").update({ estado: "aprobado" }).eq("id", data.id);
    if (!eA) {
      const usado = await comprobanteAutomatico(supabase, ctx.mcp.id, data.id, chequePrevisto ?? (await siguienteCheque(supabase, ctx.mcp.id)), true);
      if (usado !== null) {
        revalidatePath("/comprobantes");
        volver(ruta(data.id), "ok", `Listo: pago fijo aprobado y comprobante de pago generado${usado ? ` con el cheque N° ${usado}` : ""}. Ya puede entrar en la rendición.`);
      }
    }
  }
  volver(
    ruta(data.id),
    "ok",
    pagoFijo
      ? "Pago fijo registrado. Cuando el alcalde lo apruebe (en «Por aprobar»), su comprobante de pago se genera y aprueba solo, con el cheque anotado."
      : "Requerimiento registrado. Envíelo al alcalde para su aprobación.",
  );
}

/** Corrige un requerimiento en borrador: los ítems anteriores quedan anulados en el historial. */
export async function editarRequerimiento(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const destino = `/expedientes/${id}?editar=1`;
  const items = leerItems(fd, destino);
  const { error } = await supabase.from("expedientes").update(leerCabecera(fd)).eq("id", id);
  if (error) volver(destino, "error", mensajeError(error));
  const { error: e1 } = await supabase.from("expediente_items").update({ anulado: true }).eq("expediente_id", id).eq("anulado", false);
  if (e1) volver(destino, "error", mensajeError(e1));
  const { error: e2 } = await supabase
    .from("expediente_items")
    .insert(items.map((it) => ({ ...it, mcp_id: ctx.mcp.id, expediente_id: id })));
  if (e2) volver(destino, "error", mensajeError(e2));
  revalidatePath("/expedientes");
  volver(ruta(id), "ok", "Requerimiento corregido. Queda pendiente de aprobación del alcalde.");
}

/** Crea un expediente nuevo con los mismos datos (por ejemplo, después de anular uno con error). */
export async function copiarExpediente(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const { data: e } = await supabase
    .from("expedientes")
    .select("tipo, descripcion, area_usuaria, fuente_id, meta, clasificador, expediente_items(item, cantidad, unidad, descripcion, precio_unitario, anulado)")
    .eq("id", id)
    .single();
  if (!e) volver(ruta(id), "error", "Expediente no encontrado.");
  const { data: nuevo, error } = await supabase
    .from("expedientes")
    .insert({
      mcp_id: ctx.mcp.id,
      tipo: e.tipo,
      descripcion: e.descripcion,
      area_usuaria: e.area_usuaria,
      fuente_id: e.fuente_id,
      meta: e.meta,
      clasificador: e.clasificador,
    })
    .select("id")
    .single();
  if (error || !nuevo) volver(ruta(id), "error", mensajeError(error));
  const items = (e.expediente_items as { item: number; cantidad: number; unidad: string; descripcion: string; precio_unitario: number; anulado: boolean }[])
    .filter((i) => !i.anulado)
    .sort((a, b) => a.item - b.item)
    .map((i, n) => ({ item: n + 1, cantidad: i.cantidad, unidad: i.unidad, descripcion: i.descripcion, precio_unitario: i.precio_unitario }));
  if (items.length) {
    await supabase.from("expediente_items").insert(items.map((it) => ({ ...it, mcp_id: ctx.mcp.id, expediente_id: nuevo.id })));
  }
  revalidatePath("/expedientes");
  volver(`/expedientes/${nuevo.id}?editar=1`, "ok", "Se creó un expediente nuevo con los mismos datos. Corrija lo necesario y guarde.");
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
  if (accion === "aprobar") {
    // Pago fijo de la lista: el comprobante de pago se genera solo, con el cheque siguiente.
    const ctx = await contextoMcp();
    const usado = await comprobanteAutomatico(supabase, ctx.mcp.id, id, await siguienteCheque(supabase, ctx.mcp.id), true);
    if (usado !== null) {
      revalidatePath("/comprobantes");
      volver(ruta(id), "ok", `Pago fijo aprobado: su comprobante de pago se generó y aprobó${usado ? ` con el cheque N° ${usado}` : ""}. Ya puede entrar en la rendición.`);
    }
  }
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

/** Un solo proveedor, sin cotizar: queda registrado y elegido de una vez. */
export async function proveedorUnico(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const id = texto(fd, "expediente_id")!;
  const destino = ruta(id, "cotizacion");
  const proveedorId = await proveedorPorDocumento(ctx.mcp.id, fd, destino);
  const monto = numero(fd, "monto");
  if (monto === null || monto <= 0) volver(destino, "error", "Escriba el monto que cobra el proveedor.");
  await supabase.from("cotizaciones").update({ elegida: false }).eq("expediente_id", id).eq("elegida", true);
  const { error } = await supabase
    .from("cotizaciones")
    .insert({ mcp_id: ctx.mcp.id, expediente_id: id, proveedor_id: proveedorId, monto, plazo: texto(fd, "plazo"), elegida: true });
  if (error) volver(destino, "error", mensajeError(error));
  await supabase.from("expedientes").update({ fase: "cotizacion" }).eq("id", id).eq("fase", "requerimiento");
  volver(ruta(id), "ok", "Proveedor registrado y elegido. Ya puede emitir la orden.");
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
  // Si ya se recibió conforme, también el memorando de conformidad en el mismo paso.
  if (texto(fd, "con_conformidad") === "1") {
    const { error: e2 } = await supabase.from("conformidades").insert({
      mcp_id: ctx.mcp.id,
      expediente_id: id,
      fecha: texto(fd, "fecha"),
      texto: texto(fd, "texto_conformidad"),
    });
    if (e2) volver(ruta(id), "error", `La orden se emitió, pero no la conformidad: ${mensajeError(e2)}`);
    await supabase.from("expedientes").update({ fase: "conformidad" }).eq("id", id);
    volver(ruta(id), "ok", `Orden de ${exp.tipo} y memorando de conformidad emitidos.`);
  }
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
    .select("tipo, fuente_id, descripcion, clasificador, expediente_items(total, anulado)")
    .eq("id", id)
    .single();
  if (!exp) volver(destino, "error", "Expediente no encontrado.");
  if (!exp.fuente_id) volver(destino, "error", "El expediente no indica con qué se paga.");

  let beneficiario: string | null;
  let beneficiarioDoc: string | null;
  let concepto: string;
  let importe: number;
  if (exp.tipo === "pago_fijo") {
    // Pago fijo: sin orden; el beneficiario se escribe aquí y el monto es el del requerimiento.
    beneficiario = texto(fd, "beneficiario");
    beneficiarioDoc = (texto(fd, "beneficiario_doc") ?? "").replace(/\D/g, "") || null;
    if (!beneficiario) volver(destino, "error", "Escriba a quién se paga.");
    concepto = exp.descripcion;
    importe = (exp.expediente_items as { total: number; anulado: boolean }[])
      .filter((i) => !i.anulado)
      .reduce((s, i) => s + Number(i.total), 0);
  } else {
    const { data: orden } = await supabase
      .from("ordenes")
      .select("monto, concepto, proveedores(razon_social, num_doc)")
      .eq("expediente_id", id)
      .eq("anulado", false)
      .maybeSingle();
    if (!orden) volver(destino, "error", "Falta la orden del expediente.");
    const prov = orden.proveedores as unknown as { razon_social: string; num_doc: string } | null;
    beneficiario = prov?.razon_social ?? "";
    beneficiarioDoc = prov?.num_doc ?? null;
    concepto = orden.concepto;
    importe = Number(orden.monto);
  }
  if (importe <= 0) volver(destino, "error", "El monto del requerimiento debe ser mayor que cero.");
  const cheque = await leerCheque(fd, destino);

  const { data, error } = await supabase
    .from("comprobantes_pago")
    .insert({
      mcp_id: ctx.mcp.id,
      fecha: texto(fd, "fecha"),
      origen: "expediente",
      expediente_id: id,
      fuente_id: exp.fuente_id,
      beneficiario,
      beneficiario_doc: beneficiarioDoc,
      concepto,
      importe,
      partida: exp.clasificador,
      sustento_tipo: texto(fd, "sustento_tipo"),
      sustento_numero: texto(fd, "sustento_numero"),
      cheque,
      ...funcionCategoria(fd),
    })
    .select("id")
    .single();
  if (error || !data) volver(destino, "error", mensajeError(error));
  await supabase.from("expedientes").update({ fase: "comprobante" }).eq("id", id);
  revalidatePath("/comprobantes");
  volver(`/comprobantes/${data.id}`, "ok", "Comprobante de pago generado en borrador.");
}

/** Copia en borrador los pagos fijos del mes anterior que faltan en este mes (dietas, personal). */
export async function copiarPagosFijos() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = periodoActual();

  // Con la lista de pagos fijos de la MCP: se registran los que faltan este mes.
  const catalogo = await cargarCatalogoPagosFijos(supabase, ctx.mcp.id);
  if (catalogo.length > 0) {
    const pendientes = catalogo.filter((p) => !p.pagados.includes(periodo));
    if (pendientes.length === 0) volver("/inicio", "ok", "Los pagos fijos de este mes ya están registrados.");
    const [a, m] = periodo.split("-").map(Number);
    const mesTexto = `${MESES[m - 1].toUpperCase()} ${a}`;
    let hechos = 0;
    for (const p of pendientes) {
      const texto = `${p.concepto} - ${mesTexto}`;
      const { data: nuevo, error } = await supabase
        .from("expedientes")
        .insert({ mcp_id: ctx.mcp.id, tipo: "pago_fijo", descripcion: texto, fuente_id: p.fuente_id, clasificador: p.clasificador, pago_fijo_id: p.id, mes_pagado: periodo })
        .select("id")
        .single();
      if (error || !nuevo) volver("/inicio", "error", `Se registraron ${hechos}. Falló «${p.concepto}»: ${mensajeError(error)}`);
      const { error: e2 } = await supabase.from("expediente_items").insert({
        mcp_id: ctx.mcp.id, expediente_id: nuevo.id, item: 1, cantidad: 1, unidad: p.unidad || "MES", descripcion: texto, precio_unitario: p.monto,
      });
      if (e2) volver("/inicio", "error", `Se registró «${p.concepto}» sin su monto: ${mensajeError(e2)}`);
      hechos++;
    }
    revalidatePath("/inicio");
    revalidatePath("/expedientes");
    volver("/expedientes?estado=borrador", "ok", `Se registraron ${hechos} pago(s) fijo(s) de ${mesTexto.toLowerCase()}, en borrador. Revíselos y envíelos al alcalde para su aprobación.`);
  }

  const { anterior, faltan } = await estadoPagosFijos(supabase, ctx.mcp.id, periodo);
  if (faltan.length === 0) volver("/inicio", "ok", "Los pagos fijos de este mes ya están registrados.");

  let copiados = 0;
  for (const p of faltan) {
    const { data: items } = await supabase
      .from("expediente_items")
      .select("item, cantidad, unidad, descripcion, precio_unitario")
      .eq("expediente_id", p.id)
      .eq("anulado", false)
      .order("item");
    const { data: nuevo, error } = await supabase
      .from("expedientes")
      .insert({
        mcp_id: ctx.mcp.id,
        tipo: "pago_fijo",
        descripcion: pasarAlMes(p.descripcion, anterior, periodo),
        area_usuaria: p.area_usuaria,
        fuente_id: p.fuente_id,
        meta: p.meta,
        clasificador: p.clasificador,
      })
      .select("id")
      .single();
    if (error || !nuevo) volver("/inicio", "error", `Se copiaron ${copiados}. Falló «${p.descripcion}»: ${mensajeError(error)}`);
    if (items?.length) {
      const { error: e2 } = await supabase.from("expediente_items").insert(
        items.map((it, n) => ({
          item: n + 1,
          cantidad: it.cantidad,
          unidad: it.unidad,
          descripcion: pasarAlMes(it.descripcion, anterior, periodo),
          precio_unitario: it.precio_unitario,
          mcp_id: ctx.mcp.id,
          expediente_id: nuevo.id,
        })),
      );
      if (e2) volver("/inicio", "error", `Se copió «${p.descripcion}» sin sus ítems: ${mensajeError(e2)}`);
    }
    copiados++;
  }
  revalidatePath("/inicio");
  revalidatePath("/expedientes");
  volver(
    "/expedientes?estado=borrador",
    "ok",
    `Se copiaron ${copiados} pago(s) fijo(s) del mes pasado, en borrador. Revise los montos y envíelos al alcalde para su aprobación.`,
  );
}
