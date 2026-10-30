import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import FormularioPecosa, { type BienConStock } from "@/components/formularios/FormularioPecosa";
import { contextoMcp } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import { CORRELATIVO, proximoNumero } from "@/lib/numeracion";
import { emitirPecosa } from "../../acciones";

export default async function NuevaPecosa({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data } = await supabase
    .from("almacen_stock")
    .select("bien_id, codigo, descripcion, unidad, stock, costo_promedio")
    .eq("mcp_id", ctx.mcp.id)
    .gt("stock", 0)
    .order("descripcion");
  const bienes: BienConStock[] = (data ?? []).map((b) => ({
    id: b.bien_id,
    codigo: b.codigo,
    descripcion: b.descripcion,
    unidad: b.unidad,
    stock: Number(b.stock),
    costo: Number(b.costo_promedio),
  }));

  return (
    <>
      <div className="titulo-ventana">
        <Link className="btn" href="/almacen">← Volver</Link>
        <h1>Entregar bienes (PECOSA)</h1>
      </div>
      <p className="tenue" style={{ margin: 0 }}>
        Elija a quién se entrega y qué bienes. Solo aparecen los bienes que hay en almacén; no se puede entregar más de lo que hay.
      </p>
      <Avisos ok={sp.ok} error={sp.error} />
      <FormularioPecosa proximo={await proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.pecosa, new Date().getFullYear())} mcp={ctx.mcp} accion={emitirPecosa} bienes={bienes} />
    </>
  );
}
