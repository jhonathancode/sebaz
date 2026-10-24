import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import Motivo from "@/components/Motivo";
import { FormatoPecosa } from "@/components/formatos/FormatosAlmacen";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, num3 } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularDocumentoAlmacen } from "../../acciones";

export default async function VerPecosa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: p } = await supabase
    .from("pecosas")
    .select("*, pecosa_items(item, cantidad, precio_unitario, almacen_bienes(codigo, descripcion, unidad))")
    .eq("id", id)
    .single();
  if (!p) notFound();
  type Item = { item: number; cantidad: number; precio_unitario: number; almacen_bienes: { codigo: number; descripcion: string; unidad: string } };
  const items = (p.pecosa_items as unknown as Item[]).sort((a, b) => a.item - b.item);
  const titulo = `PECOSA ${num3(p.numero)}-${p.anio}`;

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/almacen?ver=salidas">← Almacén</Link>
        <h1>{titulo}</h1>
        <span className={`estado ${p.anulado ? "anulado" : "aprobado"}`}>{p.anulado ? "Anulada" : "Emitida"}</span>
        <span className="espacio" />
        <BotonPdf nombre={titulo} />
        <BotonImprimir />
        {!p.anulado && tiene(ctx, "admin", "tesorero", "contador", "alcalde") && (
          <Motivo accion={anularDocumentoAlmacen} boton="Anular" titulo={`Anular la ${titulo}`} ayuda="¿Por qué se anula? Los bienes vuelven al stock." campos={{ tabla: "pecosas", id }} />
        )}
      </div>
      <div className="no-imprimir"><Avisos ok={sp.ok} error={sp.error} /></div>
      {p.anulado && <div className="aviso error no-imprimir">Anulada: {p.anulado_motivo} · {fechaHora(p.anulado_en)}</div>}
      <div className="documentos mesa">
        <FormatoPecosa
          mcp={ctx.mcp}
          p={{
            numero: p.numero,
            anio: p.anio,
            fecha: p.fecha,
            area_solicitante: p.area_solicitante,
            solicitante: p.solicitante,
            finalidad: p.finalidad,
            anulado: p.anulado,
            items: items.map((i) => ({ ...i.almacen_bienes, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) })),
          }}
        />
      </div>
    </>
  );
}
