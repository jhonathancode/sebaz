import type { SupabaseClient } from "@supabase/supabase-js";
import { codigoCP, num3 } from "@/lib/formato";

export type Proveedor = { razon_social: string; num_doc: string; direccion: string | null; telefono: string | null };

/** Carga en paralelo todo lo que forma el expediente de gasto. */
export async function cargarExpediente(supabase: SupabaseClient, id: string) {
  const [{ data: e }, { data: items }, { data: cotizaciones }, { data: orden }, { data: conformidad }, { data: cp }] = await Promise.all([
    supabase.from("expedientes").select("*").eq("id", id).single(),
    supabase.from("expediente_items").select("*").eq("expediente_id", id).eq("anulado", false).order("item"),
    supabase.from("cotizaciones").select("*, proveedores(razon_social, num_doc)").eq("expediente_id", id).eq("anulado", false).order("monto"),
    supabase
      .from("ordenes")
      .select("*, proveedores(razon_social, num_doc, direccion, telefono)")
      .eq("expediente_id", id)
      .eq("anulado", false)
      .maybeSingle(),
    supabase.from("conformidades").select("*").eq("expediente_id", id).eq("anulado", false).maybeSingle(),
    supabase
      .from("comprobantes_pago")
      .select("*, perfiles!comprobantes_pago_creado_por_fkey(nombre)")
      .eq("expediente_id", id)
      .neq("estado", "anulado")
      .maybeSingle(),
  ]);
  return { e, items: items ?? [], cotizaciones: cotizaciones ?? [], orden, conformidad, cp };
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
  return e?.tipo === "pago_fijo" ? lista.filter((x) => x.clave === "requerimiento" || x.clave === "comprobante") : lista;
}
