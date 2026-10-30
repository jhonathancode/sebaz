import type { SupabaseClient } from "@supabase/supabase-js";
import { codigoCP, num3 } from "@/lib/formato";

export type Proveedor = { razon_social: string; num_doc: string; direccion: string | null; telefono: string | null };

/** Carga en paralelo todo lo que forma el expediente de gasto. */
export async function cargarExpediente(supabase: SupabaseClient, id: string) {
  const [{ data: e }, { data: items }, { data: cotizacionesTodas }, { data: ordenesTodas }, { data: conformidadesTodas }, { data: cpsTodos }] = await Promise.all([
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
  ]);
  // Si el expediente se anuló, sus documentos siguen disponibles (con la marca de anulado) para imprimirlos.
  const anuladoExp = e?.estado === "anulado";
  // Vigentes; si el expediente está anulado, también los que se anularon con él (llevan el sello ANULADO)
  const cotizaciones = (cotizacionesTodas ?? []).filter((c) => anuladoExp || !c.anulado);
  const ordenes = ordenesTodas ?? [];
  const conformidades = conformidadesTodas ?? [];
  const orden = ordenes.find((o) => !o.anulado) ?? (anuladoExp ? ordenes[0] ?? null : null);
  const conformidad = conformidades.find((c) => !c.anulado) ?? (anuladoExp ? conformidades[0] ?? null : null);
  const cps = cpsTodos ?? [];
  const cp = cps.find((c) => c.estado !== "anulado") ?? (e?.estado === "anulado" ? cps[0] ?? null : null);
  const anulado = e?.estado === "anulado" ? { motivo: (e.anulado_motivo as string | null) ?? null, en: (e.anulado_en as string | null) ?? null } : null;
  return { e, items: items ?? [], cotizaciones: cotizaciones ?? [], orden, conformidad, cp, anulado };
}

export type ClaveDoc = "requerimiento" | "cotizaciones" | "orden" | "conformidad" | "comprobante";

/** Lista de documentos del expediente, en el orden del archivo físico. */
export function listaDocumentos(d: Awaited<ReturnType<typeof cargarExpediente>>) {
  const { e, cotizaciones, orden, conformidad, cp } = d;
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
      clave: "comprobante" as ClaveDoc,
      nombre: "Comprobante de pago",
      numero: cp ? codigoCP(cp.numero, cp.origen) : "",
      listo: !!cp,
    },
  ];
  if (e?.tipo !== "pago_fijo") return lista;
  // Pago fijo simple (dietas): solo requerimiento y comprobante. Con expediente completo: sin cuadro comparativo.
  return e.flujo_completo ? lista.filter((x) => x.clave !== "cotizaciones") : lista.filter((x) => x.clave === "requerimiento" || x.clave === "comprobante");
}
