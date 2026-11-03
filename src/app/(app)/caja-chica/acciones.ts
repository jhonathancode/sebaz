"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { exigirPin } from "@/lib/pin";
import { nombrePeriodo } from "@/lib/formato";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

const ruta = (periodo: string, fuente: string, caja?: string | null) => `/caja-chica?mes=${periodo}&fuente=${fuente}${caja ? `&caja=${caja}` : ""}`;

/**
 * Pide el fondo de la caja chica: registra el requerimiento «Apertura de caja chica» (un expediente).
 * Si quien lo pide es el alcalde o el administrador, se aprueba de una vez y la caja se abre sola;
 * si no, queda por aprobar y la caja se abre cuando el alcalde lo apruebe.
 */
export async function solicitarFondo(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const monto = numero(fd, "monto_fondo");
  if (!monto || monto <= 0) volver(ruta(periodo, fuente), "error", "Escriba el monto del fondo.");
  const cheque = (texto(fd, "numero_cheque") ?? "").replace(/\s/g, "").toUpperCase();
  if (!cheque) volver(ruta(periodo, fuente), "error", "Escriba el número del cheque con el que se abre la caja chica.");
  const responsable = texto(fd, "responsable_id");
  if (!responsable) volver(ruta(periodo, fuente), "error", "Elija al responsable del fondo.");
  await exigirPin(ctx.userId, fd, ruta(periodo, fuente));

  const a = Number(periodo.slice(0, 4));
  const mes = nombrePeriodo(periodo).split(" ")[0].toUpperCase();
  const concepto = `SE REQUIERE LA APERTURA DE LA CAJA CHICA DEL MES DE ${mes} ${a}`;
  const { data: exp, error } = await supabase
    .from("expedientes")
    .insert({
      mcp_id: ctx.mcp.id,
      tipo: "caja_chica",
      descripcion: concepto,
      fuente_id: fuente,
      cheque_previsto: cheque.replace(/\D/g, "") || null,
      caja_periodo: periodo,
      caja_responsable_id: responsable,
    })
    .select("id")
    .single();
  if (error || !exp) volver(ruta(periodo, fuente), "error", mensajeError(error));
  const { error: eI } = await supabase.from("expediente_items").insert({
    mcp_id: ctx.mcp.id,
    expediente_id: exp.id,
    item: 1,
    cantidad: 1,
    unidad: "UND",
    descripcion: `FONDO DE CAJA CHICA DE ${mes} ${a}`,
    precio_unitario: monto,
  });
  if (eI) volver(`/expedientes/${exp.id}`, "error", "Se creó el requerimiento pero no su monto: " + mensajeError(eI));
  revalidatePath("/expedientes");
  revalidatePath("/caja-chica");
  // Alcalde o administrador: se aprueba al instante y la caja se abre sola
  if (tiene(ctx, "alcalde", "admin")) {
    const { error: eA } = await supabase.from("expedientes").update({ estado: "aprobado" }).eq("id", exp.id);
    if (!eA) {
      const { data: caja } = await supabase.from("cajas_chicas").select("id").eq("expediente_id", exp.id).maybeSingle();
      volver(ruta(periodo, fuente, caja?.id), "ok", "Requerimiento aprobado y fondo de caja chica abierto.");
    }
  }
  volver(`/expedientes/${exp.id}`, "ok", "Requerimiento de caja chica registrado. Cuando el alcalde lo apruebe, la caja chica se abre sola.");
}

/** Enlaza un expediente ya hecho (con comprobante y cheque) a la caja chica del mes. */
export async function enlazarExpediente(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const expediente = texto(fd, "expediente_id");
  const responsable = texto(fd, "responsable_id");
  if (!expediente) volver(ruta(periodo, fuente), "error", "Elija el expediente que abre esta caja chica.");
  if (!responsable) volver(ruta(periodo, fuente), "error", "Elija al responsable del fondo.");
  const { data, error } = await supabase.rpc("enlazar_caja_expediente", { p_expediente: expediente, p_periodo: periodo, p_responsable: responsable });
  if (error) volver(ruta(periodo, fuente), "error", mensajeError(error));
  revalidatePath("/caja-chica");
  revalidatePath("/expedientes");
  volver(ruta(periodo, fuente, data as string), "ok", "Listo: la caja chica quedó abierta con el monto y el cheque del expediente.");
}

export async function agregarGasto(fd: FormData) {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const cajaId = texto(fd, "caja_id");
  const monto = numero(fd, "monto");
  if (!monto || monto <= 0) volver(ruta(periodo, fuente, cajaId), "error", "Escriba el monto del gasto.");
  const fechaGasto = texto(fd, "fecha") ?? "";
  if (!fechaGasto.startsWith(periodo)) volver(ruta(periodo, fuente, cajaId), "error", "La fecha del gasto debe ser del mismo mes del fondo.");
  const tipo = texto(fd, "sustento_tipo") ?? "DJ";
  const { error } = await supabase.from("caja_chica_gastos").insert({
    mcp_id: ctx.mcp.id,
    caja_id: texto(fd, "caja_id"),
    fecha: fechaGasto,
    concepto: texto(fd, "concepto"),
    sustento_tipo: tipo,
    sustento_numero: tipo === "DJ" ? null : texto(fd, "sustento_numero"),
    razon_doc: texto(fd, "razon_doc"),
    razon_social: texto(fd, "razon_social"),
    monto,
  });
  if (error) volver(ruta(periodo, fuente, cajaId), "error", mensajeError(error));
  revalidatePath("/caja-chica");
  volver(ruta(periodo, fuente, cajaId), "ok", "Gasto registrado.");
}

export async function editarGasto(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const cajaId = texto(fd, "caja_id");
  const monto = numero(fd, "monto");
  if (!monto || monto <= 0) volver(ruta(periodo, fuente, cajaId), "error", "Escriba el monto del gasto.");
  const fechaGasto = texto(fd, "fecha") ?? "";
  if (!fechaGasto.startsWith(periodo)) volver(ruta(periodo, fuente, cajaId), "error", "La fecha del gasto debe ser del mismo mes del fondo.");
  const tipo = texto(fd, "sustento_tipo") ?? "DJ";
  const { error } = await supabase
    .from("caja_chica_gastos")
    .update({
      fecha: fechaGasto,
      concepto: texto(fd, "concepto")?.toUpperCase(),
      sustento_tipo: tipo,
      sustento_numero: tipo === "DJ" ? null : texto(fd, "sustento_numero")?.toUpperCase() ?? null,
      razon_doc: texto(fd, "razon_doc"),
      razon_social: texto(fd, "razon_social")?.toUpperCase(),
      monto,
    })
    .eq("id", texto(fd, "gasto_id")!);
  if (error) volver(ruta(periodo, fuente, cajaId), "error", mensajeError(error));
  revalidatePath("/caja-chica");
  volver(ruta(periodo, fuente, cajaId), "ok", "Gasto corregido.");
}

export async function anularGasto(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const cajaId = texto(fd, "caja_id");
  const { error } = await supabase
    .from("caja_chica_gastos")
    .update({ anulado: true, anulado_motivo: texto(fd, "motivo") })
    .eq("id", texto(fd, "gasto_id")!);
  if (error) volver(ruta(periodo, fuente, cajaId), "error", mensajeError(error));
  volver(ruta(periodo, fuente, cajaId), "ok", "Gasto anulado. Queda en el historial.");
}

export async function liquidarCaja(fd: FormData) {
  await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const cajaId = texto(fd, "caja_id");
  const { data, error } = await supabase.rpc("liquidar_caja_chica", { p_caja: texto(fd, "caja_id") });
  if (error) volver(ruta(periodo, fuente, cajaId), "error", mensajeError(error));
  revalidatePath("/comprobantes");
  volver(`/comprobantes/${data}`, "ok", "Caja chica liquidada. Se generó su comprobante de pago en borrador.");
}

export async function cambiarCheque(fd: FormData) {
  const supabase = await supabaseServidor();
  const periodo = texto(fd, "periodo")!;
  const fuente = texto(fd, "fuente_id")!;
  const cajaId = texto(fd, "caja_id");
  const cheque = texto(fd, "numero_cheque")?.toUpperCase() ?? null;
  const { error } = await supabase.from("cajas_chicas").update({ numero_cheque: cheque }).eq("id", texto(fd, "caja_id") ?? "");
  if (error) volver(ruta(periodo, fuente, cajaId), "error", mensajeError(error));
  volver(ruta(periodo, fuente, cajaId), "ok", "Número de cheque guardado.");
}
