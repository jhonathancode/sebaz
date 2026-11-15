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
import { diasComision, nombreConcepto } from "@/lib/viaticos";
import { anularComision, pasarComisionACaja } from "../acciones";

/** Planilla de viáticos: desglose de lo que cuesta la comisión de servicio. */
export default async function Comision({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: c } = await supabase.from("comisiones_viaje").select("*").eq("id", id).single();
  if (!c) notFound();
  const [{ data: items }, { data: cajas }] = await Promise.all([
    supabase.from("comision_viaje_items").select("*").eq("comision_id", id).order("creado_en"),
    supabase.from("cajas_chicas").select("id, periodo, numero").eq("mcp_id", ctx.mcp.id).eq("estado", "abierta").order("periodo", { ascending: false }),
  ]);
  const puede = tiene(ctx, "admin", "tesorero");
  const codigo = `V${String(c.numero).padStart(3, "0")}-${c.anio}`;
  const { dias, noches } = diasComision(c.fecha_salida, c.fecha_retorno);
  const porConcepto = new Map<string, number>();
  (items ?? []).forEach((i) => porConcepto.set(i.concepto, (porConcepto.get(i.concepto) ?? 0) + Number(i.subtotal)));
  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/caja-chica/viaticos">← Volver a viáticos</Link>
        <span className="espacio" />
        {puede && !c.anulado && !c.gasto_id && (
          <form action={pasarComisionACaja} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="hidden" name="id" value={c.id} />
            {!c.caja_id && (
              <select name="caja_id" required defaultValue="" aria-label="Caja chica">
                <option value="" disabled>Elegir caja chica…</option>
                {(cajas ?? []).map((k) => <option key={k.id} value={k.id}>{nombrePeriodo(k.periodo)} · caja {k.numero}</option>)}
              </select>
            )}
            <BotonConfirmar className="btn primario" pregunta="¿Pasar esta comisión a la caja chica?" detalle={`Se registra un gasto de S/ ${soles(c.total)} con sustento PM, con fecha de retorno ${fecha(c.fecha_retorno)}.`} textoConfirmar="Sí, pasar a caja chica">Pasar a caja chica</BotonConfirmar>
          </form>
        )}
        {puede && !c.anulado && <Motivo chico accion={anularComision} boton="Anular" ayuda="Motivo" campos={{ id: c.id }} />}
        <BotonPdf nombre={`Comision de servicio ${codigo}`} />
        <BotonImprimir />
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="hoja">
        <Encabezado mcp={ctx.mcp} titulo={`PLANILLA DE VIÁTICOS · SALIDA A ${c.destino}`} numero={`N° ${codigo}`} />
        {c.anulado && <p style={{ color: "#a33", fontWeight: 600 }}>COMISIÓN ANULADA: {c.anulado_motivo}</p>}
        <table className="formato">
          <tbody>
            <tr><th style={{ width: 200 }}>Comisionado</th><td>{c.comisionado}{c.documento ? ` · DNI ${c.documento}` : ""}{c.cargo ? ` · ${c.cargo}` : ""}</td></tr>
            <tr><th>Destino</th><td>{c.destino}</td></tr>
            <tr><th>Periodo</th><td>Del {fecha(c.fecha_salida)} al {fecha(c.fecha_retorno)} ({dias} día(s), {noches} noche(s))</td></tr>
            <tr><th>Motivo</th><td>{c.motivo}</td></tr>
          </tbody>
        </table>
        <table className="formato">
          <thead><tr><th>N°</th><th>Concepto</th><th>Detalle</th><th className="num">Cantidad</th><th className="num">Precio S/</th><th className="num">Importe S/</th></tr></thead>
          <tbody>
            {(items ?? []).map((i, n) => (
              <tr key={i.id}><td>{n + 1}</td><td>{nombreConcepto(i.concepto)}</td><td>{i.detalle ?? ""}</td><td className="num">{Number(i.cantidad)}</td><td className="num">{soles(i.precio)}</td><td className="num">{soles(i.subtotal)}</td></tr>
            ))}
            <tr><th colSpan={5}>TOTAL</th><th className="num">{soles(c.total)}</th></tr>
          </tbody>
        </table>
        {porConcepto.size > 1 && (
          <p className="pequeno" style={{ marginTop: 8 }}>Resumen: {[...porConcepto].map(([k, v]) => `${nombreConcepto(k)} S/ ${soles(v)}`).join(" · ")}</p>
        )}
        <p className="pequeno" style={{ marginTop: 10 }}>Declaro haber realizado la comisión de servicio detallada, en las fechas y destino indicados, por encargo de la municipalidad.</p>
        <Firmas nombres={["COMISIONADO", "TESORERO", "ALCALDE"]} />
      </div>
    </>
  );
}
