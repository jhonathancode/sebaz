import type { supabaseServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/**
 * Compra o servicio aprobado con «completar todo»: emite la orden y, si ya se recibió
 * conforme, el memorando de conformidad y el comprobante de pago (aprobado con la misma
 * aprobación). Devuelve un texto con lo que se hizo, o null si no correspondía.
 */
export async function completarTodo(supabase: Cliente, mcpId: string, mcpNombre: string, expedienteId: string, chequeSiguiente: string): Promise<string | null> {
  const { data: e } = await supabase
    .from("expedientes")
    .select("id, tipo, estado, descripcion, fuente_id, clasificador, cheque_previsto, sin_almacen_motivo, completar_todo, con_conformidad, sustento_tipo, sustento_numero, expediente_items(total, anulado)")
    .eq("id", expedienteId)
    .single();
  if (!e || !e.completar_todo || e.estado !== "aprobado" || (e.tipo !== "compra" && e.tipo !== "servicio")) return null;
  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("proveedor_id, monto, proveedores(razon_social, num_doc)")
    .eq("expediente_id", e.id)
    .eq("elegida", true)
    .eq("anulado", false)
    .maybeSingle();
  if (!cot) return null;
  const prov = cot.proveedores as unknown as { razon_social: string; num_doc: string } | null;
  const fecha = hoyLima();
  const tipoOrden = e.tipo === "compra" ? "compra" : "servicio";

  const { data: ordenYa } = await supabase.from("ordenes").select("id").eq("expediente_id", e.id).eq("anulado", false).maybeSingle();
  if (!ordenYa) {
    const { error } = await supabase.from("ordenes").insert({ mcp_id: mcpId, expediente_id: e.id, tipo: tipoOrden, fecha, proveedor_id: cot.proveedor_id, concepto: e.descripcion, monto: cot.monto });
    if (error) return null;
    await supabase.from("expedientes").update({ fase: "orden" }).eq("id", e.id);
  }
  if (!e.con_conformidad) return `Orden de ${tipoOrden} emitida. Falta la conformidad y el comprobante de pago.`;

  const { data: confYa } = await supabase.from("conformidades").select("id").eq("expediente_id", e.id).eq("anulado", false).maybeSingle();
  if (!confYa) {
    const texto = `Mediante la presente se le comunica la CONFORMIDAD por ${e.descripcion.toLowerCase()}, a cargo de ${prov?.razon_social ?? ""}, a favor de la ${mcpNombre}.`;
    const { error } = await supabase.from("conformidades").insert({ mcp_id: mcpId, expediente_id: e.id, fecha, texto });
    if (error) return `Orden de ${tipoOrden} emitida, pero no se pudo emitir la conformidad.`;
    await supabase.from("expedientes").update({ fase: "conformidad" }).eq("id", e.id);
  }
  if (!e.fuente_id || Number(cot.monto) <= 0) return `Orden y conformidad emitidas. Falta definir con qué dinero se paga para generar el comprobante.`;

  // Los bienes comprados deben entrar primero al almacén (NEA), salvo que se indique por qué no
  if (e.tipo === "compra" && !e.sin_almacen_motivo) {
    const { data: nea } = await supabase.from("notas_entrada").select("id").eq("expediente_id", e.id).eq("anulado", false).limit(1);
    if (!nea || !nea.length) return "Orden y conformidad emitidas. Falta registrar la entrada al almacén (NEA) para generar el comprobante de pago.";
  }

  const { data: ya } = await supabase.from("comprobantes_pago").select("id").eq("expediente_id", e.id).neq("estado", "anulado").limit(1);
  if (ya && ya.length) return "Orden y conformidad emitidas.";
  const cheque = e.cheque_previsto || chequeSiguiente || null;
  const { data: cp, error } = await supabase
    .from("comprobantes_pago")
    .insert({
      mcp_id: mcpId,
      fecha,
      origen: "expediente",
      expediente_id: e.id,
      fuente_id: e.fuente_id,
      beneficiario: prov?.razon_social ?? "",
      beneficiario_doc: prov?.num_doc ?? null,
      concepto: e.descripcion,
      importe: Number(cot.monto),
      partida: e.clasificador,
      sustento_tipo: e.sustento_tipo,
      sustento_numero: e.sustento_numero,
      cheque,
    })
    .select("id")
    .single();
  if (error || !cp) return "Orden y conformidad emitidas, pero no se pudo generar el comprobante de pago.";
  await supabase.from("expedientes").update({ fase: "comprobante" }).eq("id", e.id);
  await supabase.from("comprobantes_pago").update({ estado: "aprobado" }).eq("id", cp.id);
  return `Orden, conformidad y comprobante de pago generados y aprobados${cheque ? ` con el cheque N° ${cheque}` : ""}.`;
}
