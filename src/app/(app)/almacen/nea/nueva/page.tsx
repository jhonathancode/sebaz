import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import FormularioNea from "@/components/formularios/FormularioNea";
import { contextoMcp } from "@/lib/contexto";
import { num3 } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { emitirNea } from "../../acciones";

/** Nueva entrada al almacén. Con ?expediente= se llena con la compra. */
export default async function NuevaNea({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const expedienteId = sp.expediente;

  let inicial: Parameters<typeof FormularioNea>[0]["inicial"];
  let orden: string | undefined;
  let expediente: string | undefined;
  let aviso: string | null = null;

  if (expedienteId) {
    const [{ data: e }, { data: items }, { data: o }] = await Promise.all([
      supabase.from("expedientes").select("id, numero, anio, tipo, descripcion").eq("id", expedienteId).single(),
      supabase.from("expediente_items").select("descripcion, unidad, cantidad, precio_unitario, total").eq("expediente_id", expedienteId).eq("anulado", false).order("item"),
      supabase.from("ordenes").select("numero, anio, monto, proveedores(razon_social)").eq("expediente_id", expedienteId).eq("anulado", false).maybeSingle(),
    ]);
    if (!e) return <div className="aviso error">Expediente no encontrado.</div>;
    const lista = items ?? [];
    const totalReq = lista.reduce((s, i) => s + Number(i.total), 0);
    // Si la orden se emitió por otro monto (precio de la cotización elegida), los precios se ajustan en proporción.
    const factor = o && totalReq > 0 && Math.abs(Number(o.monto) - totalReq) > 0.009 ? Number(o.monto) / totalReq : 1;
    if (factor !== 1) aviso = `La orden de compra es por S/ ${Number(o!.monto).toFixed(2)} y el requerimiento por S/ ${totalReq.toFixed(2)}: los precios se ajustaron a la orden. Revíselos con la factura.`;
    inicial = {
      proveedor: (o?.proveedores as unknown as { razon_social: string } | null)?.razon_social ?? "",
      items: lista.map((i) => ({
        descripcion: i.descripcion,
        unidad: i.unidad,
        cantidad: Number(i.cantidad),
        precio_unitario: Math.round(Number(i.precio_unitario) * factor * 100) / 100,
      })),
    };
    orden = o ? `O/C ${num3(o.numero)}-${o.anio}` : undefined;
    expediente = `Exp. ${num3(e.numero)}-${e.anio}`;
  }

  return (
    <>
      <div className="titulo-ventana">
        <Link className="btn" href={expedienteId ? `/expedientes/${expedienteId}` : "/almacen"}>← Volver</Link>
        <h1>Entrada al almacén (NEA){expediente ? ` · ${expediente}` : ""}</h1>
      </div>
      <p className="tenue" style={{ margin: 0 }}>
        {expedienteId
          ? "Los bienes de la compra ya vienen anotados. Cambie la cantidad si llegó menos, revise los precios con la factura y vea la vista previa antes de emitir."
          : "Anote los bienes que entran. Si un bien ya existe en el almacén con el mismo nombre y unidad, se suma a su stock."}
      </p>
      <Avisos ok={sp.ok} error={sp.error} />
      {aviso && <div className="aviso alerta">{aviso}</div>}
      <FormularioNea mcp={ctx.mcp} accion={emitirNea} expedienteId={expedienteId} inicial={inicial} orden={orden} expediente={expediente} />
    </>
  );
}
