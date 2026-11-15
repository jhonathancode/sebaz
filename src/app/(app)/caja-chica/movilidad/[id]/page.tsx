import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import Motivo from "@/components/Motivo";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularPlanilla, pasarACaja } from "../acciones";

/** Planilla de movilidad local: viajes con su destino y monto, para sustentar el gasto en la caja chica. */
export default async function Planilla({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: p } = await supabase.from("planillas_movilidad").select("*").eq("id", id).single();
  if (!p) notFound();
  const [{ data: items }, { data: cajas }] = await Promise.all([
    supabase.from("planilla_movilidad_items").select("*").eq("planilla_id", id).order("fecha").order("creado_en"),
    supabase.from("cajas_chicas").select("id, periodo, numero, numero_cheque").eq("mcp_id", ctx.mcp.id).eq("estado", "abierta").order("periodo", { ascending: false }),
  ]);
  const puede = tiene(ctx, "admin", "tesorero");
  const codigo = `${String(p.numero).padStart(3, "0")}-${p.anio}`;
  const tipoTxt = (t: string) => (t === "taxi" ? "TAXI" : "URBANO");
  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/caja-chica/movilidad">← Volver a movilidad</Link>
        <span className="espacio" />
        {puede && !p.anulado && !p.gasto_id && (
          <form action={pasarACaja} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="hidden" name="id" value={p.id} />
            {!p.caja_id && (
              <select name="caja_id" required defaultValue="" aria-label="Caja chica">
                <option value="" disabled>Elegir caja chica…</option>
                {(cajas ?? []).map((c) => <option key={c.id} value={c.id}>{nombrePeriodo(c.periodo)} · caja {c.numero}</option>)}
              </select>
            )}
            <BotonConfirmar className="btn primario" pregunta="¿Pasar esta planilla a la caja chica?" detalle={`Se registra un gasto de S/ ${soles(p.total)} con sustento PM (planilla de movilidad).`} textoConfirmar="Sí, pasar a caja chica">Pasar a caja chica</BotonConfirmar>
          </form>
        )}
        {puede && !p.anulado && <Motivo chico accion={anularPlanilla} boton="Anular" ayuda="Motivo" campos={{ id: p.id }} />}
        <BotonPdf nombre={`Planilla de movilidad ${codigo}`} />
        <BotonImprimir />
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="hoja">
        <Encabezado mcp={ctx.mcp} titulo="PLANILLA DE MOVILIDAD LOCAL" numero={`N° ${codigo}`} />
        {p.anulado && <p style={{ color: "#a33", fontWeight: 600 }}>PLANILLA ANULADA: {p.anulado_motivo}</p>}
        <table className="formato">
          <tbody>
            <tr><th style={{ width: 200 }}>Comisionado</th><td>{p.comisionado}{p.documento ? ` · DNI ${p.documento}` : ""}</td></tr>
            {p.cargo && <tr><th>Cargo</th><td>{p.cargo}</td></tr>}
            <tr><th>Motivo</th><td>{p.motivo}</td></tr>
          </tbody>
        </table>
        <table className="formato">
          <thead><tr><th>N°</th><th>Fecha</th><th>Destino</th><th>Tipo</th><th className="num">Monto S/</th></tr></thead>
          <tbody>
            {(items ?? []).map((i, n) => (
              <tr key={i.id}><td>{n + 1}</td><td>{fecha(i.fecha)}</td><td>{i.destino}</td><td>{tipoTxt(i.tipo)}</td><td className="num">{soles(i.monto)}</td></tr>
            ))}
            <tr><th colSpan={4}>TOTAL</th><th className="num">{soles(p.total)}</th></tr>
          </tbody>
        </table>
        <p className="pequeno" style={{ marginTop: 10 }}>Declaro que los viajes detallados se realizaron por comisión de servicio de la municipalidad, en las fechas y destinos indicados, y que los montos corresponden al tarifario vigente.</p>
        <Firmas nombres={["COMISIONADO", "TESORERO", "ALCALDE"]} />
      </div>
    </>
  );
}
