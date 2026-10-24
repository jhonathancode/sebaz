import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import Motivo from "@/components/Motivo";
import { FormatoNea } from "@/components/formatos/FormatosAlmacen";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, num3 } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularDocumentoAlmacen } from "../../acciones";

export default async function VerNea({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: n } = await supabase
    .from("notas_entrada")
    .select("*, expedientes(id, numero, anio, ordenes(numero, anio, anulado)), nota_entrada_items(item, cantidad, precio_unitario, almacen_bienes(codigo, descripcion, unidad))")
    .eq("id", id)
    .single();
  if (!n) notFound();
  const exp = n.expedientes as unknown as { id: string; numero: number; anio: number; ordenes: { numero: number; anio: number; anulado: boolean }[] } | null;
  const orden = exp?.ordenes?.find((o) => !o.anulado);
  type Item = { item: number; cantidad: number; precio_unitario: number; almacen_bienes: { codigo: number; descripcion: string; unidad: string } };
  const items = (n.nota_entrada_items as unknown as Item[]).sort((a, b) => a.item - b.item);
  const titulo = `NEA ${num3(n.numero)}-${n.anio}`;

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/almacen?ver=entradas">← Almacén</Link>
        <h1>{titulo}</h1>
        <span className={`estado ${n.anulado ? "anulado" : "aprobado"}`}>{n.anulado ? "Anulada" : "Emitida"}</span>
        <span className="espacio" />
        {exp && <Link className="btn contorno" href={`/expedientes/${exp.id}`}>Ver expediente</Link>}
        <BotonPdf nombre={titulo} />
        <BotonImprimir />
        {!n.anulado && tiene(ctx, "admin", "tesorero", "contador", "alcalde") && (
          <Motivo accion={anularDocumentoAlmacen} boton="Anular" titulo={`Anular la ${titulo}`} ayuda="¿Por qué se anula? Los bienes salen del stock." campos={{ tabla: "notas_entrada", id }} />
        )}
      </div>
      <div className="no-imprimir"><Avisos ok={sp.ok} error={sp.error} /></div>
      {n.anulado && <div className="aviso error no-imprimir">Anulada: {n.anulado_motivo} · {fechaHora(n.anulado_en)}</div>}
      <div className="documentos mesa">
        <FormatoNea
          mcp={ctx.mcp}
          n={{
            numero: n.numero,
            anio: n.anio,
            fecha: n.fecha,
            origen: n.origen,
            proveedor: n.proveedor,
            documento_ref: n.documento_ref,
            observacion: n.observacion,
            orden: orden ? `O/C ${num3(orden.numero)}-${orden.anio}` : null,
            expediente: exp ? `Exp. ${num3(exp.numero)}-${exp.anio}` : null,
            anulado: n.anulado,
            items: items.map((i) => ({ ...i.almacen_bienes, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) })),
          }}
        />
      </div>
    </>
  );
}
