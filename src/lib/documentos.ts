import type { SupabaseClient } from "@supabase/supabase-js";
import { codigoCP, num3 } from "@/lib/formato";

export type Proveedor = { razon_social: string; num_doc: string; direccion: string | null; telefono: string | null };

/** Carga en paralelo todo lo que forma el expediente de gasto. */
export async function cargarExpediente(supabase: SupabaseClient, id: string) {
  const [{ data: e }, { data: items }, { data: cotizacionesTodas }, { data: ordenesTodas }, { data: conformidadesTodas }, { data: cpsTodos }, { data: neasTodas }] = await Promise.all([
    supabase.from("expedientes").select("*").eq("id", id).single(),
    supabase.from("expediente_items").select("*").eq("expediente_id", id).eq("anulado", false).order("item"),
    supabase.from("cotizaciones").select("*, proveedores(razon_social, num_doc)").eq("expediente_id", id).order("monto"),
    supabase
      .from("ordenes")
      .select("*, proveedores(razon_social, num_doc, direccion, telefono)")
      .eq("expediente_id", id)
      .order("creado_en", { ascending: false }),
    supabase.from("conformidades").select("*").eq("expediente_id", id).order("creado_en", { ascending: false }),
    supabase
      .from("comprobantes_pago")
      .select("*, perfiles!comprobantes_pago_creado_por_fkey(nombre)")
      .eq("expediente_id", id)
      .order("creado_en", { ascending: false }),
    supabase
      .from("notas_entrada")
      .select("*, nota_entrada_items(item, cantidad, precio_unitario, almacen_bienes(codigo, descripcion, unidad))")
      .eq("expediente_id", id)
      .order("creado_en", { ascending: false }),
  ]);
  // Si el expediente se anuló, sus documentos siguen disponibles (con la marca de anulado) para imprimirlos.
  const anuladoExp = e?.estado === "anulado";
  // Vigentes; si el expediente está anulado, también los que se anularon con él (llevan el sello ANULADO)
  const cotizaciones = (cotizacionesTodas ?? []).filter((c) => anuladoExp || !c.anulado);
  const ordenes = ordenesTodas ?? [];
  const conformidades = conformidadesTodas ?? [];
  const orden = ordenes.find((o) => !o.anulado) ?? (anuladoExp ? ordenes[0] ?? null : null);
  const conformidad = conformidades.find((c) => !c.anulado) ?? (anuladoExp ? conformidades[0] ?? null : null);
  const neas = neasTodas ?? [];
  const nea = neas.find((n) => !n.anulado) ?? (anuladoExp ? neas[0] ?? null : null);
  const cps = cpsTodos ?? [];
  const cp = cps.find((c) => c.estado !== "anulado") ?? (e?.estado === "anulado" ? cps[0] ?? null : null);
  const anulado = e?.estado === "anulado" ? { motivo: (e.anulado_motivo as string | null) ?? null, en: (e.anulado_en as string | null) ?? null } : null;
  // Planilla de remuneración: la arma el sistema cada mes en los pagos fijos que la llevan (dietas, personal)
  let planilla: Planilla | null = null;
  const pfId = (e as { pago_fijo_id?: string | null } | null)?.pago_fijo_id;
  if (e && pfId) {
    const { data: pf } = await supabase.from("pagos_fijos").select("*").eq("id", pfId).maybeSingle();
    const docs = ((pf as { documentos?: string[] } | null)?.documentos ?? []) as string[];
    if (pf && docs.includes("planilla")) {
      const total = (items ?? []).reduce((s, i) => s + Number(i.total), 0);
      const concepto = String(pf.concepto ?? "");
      planilla = {
        cargo: cargoDePago(concepto),
        nombre: String(pf.beneficiario ?? "").toUpperCase(),
        dni: (pf.beneficiario_doc as string | null) ?? "",
        monto: total > 0 ? total : Number(pf.monto),
        mes: ((e as { mes_pagado?: string | null }).mes_pagado ?? String(e.fecha).slice(0, 7)) as string,
      };
    }
  }
  return { e, items: items ?? [], cotizaciones: cotizaciones ?? [], orden, conformidad, nea, cp, anulado, planilla };
}

/** Datos de la planilla mensual de un pago fijo. */
export type Planilla = { cargo: string; nombre: string; dni: string; monto: number; mes: string };

export type ClaveDoc = "requerimiento" | "cotizaciones" | "orden" | "conformidad" | "nea" | "comprobante" | "planilla";

/** Lista de documentos del expediente, en el orden del archivo físico. */
export function listaDocumentos(d: Awaited<ReturnType<typeof cargarExpediente>>) {
  const base = listaBase(d);
  if (!d.planilla) return base;
  // La planilla va entre el requerimiento y el comprobante, como en el archivo físico
  const i = base.findIndex((x) => x.clave === "comprobante");
  const pl = { clave: "planilla" as ClaveDoc, nombre: "Planilla de remuneración", numero: "", listo: true };
  return i >= 0 ? [...base.slice(0, i), pl, ...base.slice(i)] : [...base, pl];
}

function listaBase(d: Awaited<ReturnType<typeof cargarExpediente>>) {
  const { e, cotizaciones, orden, conformidad, nea, cp } = d;
  const lista = [
    {
      clave: "requerimiento" as ClaveDoc,
      nombre: "Cuadro de requerimiento",
      numero: e ? `N° ${num3(e.numero)}-${e.anio}` : "",
      listo: !!e,
    },
    {
      clave: "cotizaciones" as ClaveDoc,
      nombre: "Cuadro comparativo de cotizaciones",
      numero: `${cotizaciones.length} cotización(es)`,
      listo: cotizaciones.length > 0,
    },
    {
      clave: "orden" as ClaveDoc,
      nombre: orden?.tipo === "compra" || e?.tipo === "compra" ? "Orden de compra" : "Orden de servicio",
      numero: orden ? `N° ${num3(orden.numero)}-${orden.anio}` : "",
      listo: !!orden,
    },
    {
      clave: "conformidad" as ClaveDoc,
      nombre: "Memorando de conformidad",
      numero: conformidad ? `N° ${num3(conformidad.memorando_numero)}-${conformidad.anio}` : "",
      listo: !!conformidad,
    },
    {
      clave: "nea" as ClaveDoc,
      nombre: "Entrada al almacén (NEA)",
      numero: nea ? `N° ${num3(nea.numero)}-${nea.anio}` : "",
      listo: !!nea,
    },
    {
      clave: "comprobante" as ClaveDoc,
      nombre: "Comprobante de pago",
      numero: cp ? codigoCP(cp.numero, cp.origen) : "",
      listo: !!cp,
    },
  ];
  // La NEA solo existe en las compras de bienes que pasan por almacén
  const pasaPorAlmacen = e?.tipo === "compra" && !(e as { sin_almacen_motivo?: string | null }).sin_almacen_motivo;
  if (!nea && !pasaPorAlmacen) {
    const i = lista.findIndex((x) => x.clave === "nea");
    if (i >= 0) lista.splice(i, 1);
  }
  if (e?.tipo === "caja_chica") return lista.filter((x) => x.clave === "requerimiento" || x.clave === "comprobante");
  if (e?.tipo !== "pago_fijo") return lista;
  // Pago fijo simple (dietas): solo requerimiento y comprobante. Con expediente completo: sin cuadro comparativo.
  return e.flujo_completo ? lista.filter((x) => x.clave !== "cotizaciones") : lista.filter((x) => x.clave === "requerimiento" || x.clave === "comprobante");
}


/** Cargo que sale en la planilla según el concepto del pago fijo: «DIETA DE ALCALDE» → «ALCALDE». */
export function cargoDePago(concepto: string): string {
  return (concepto.match(/^DIETAS?\s+(?:DEL?|DE LA)\s+(.+)$/i)?.[1] ?? concepto).toUpperCase();
}
