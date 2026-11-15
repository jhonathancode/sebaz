import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { CONCEPTOS_VIAJE, UNIDADES_VIAJE } from "@/lib/viaticos";
import { guardarTarifaViaje } from "./acciones";

/** Viáticos: una tarjeta por lugar (Huancayo, Lima…). Dentro de cada lugar va su tarifario y todas las salidas hechas allí. */
export default async function Viaticos({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero");
  const [{ data: tarifas }, { data: comisiones }] = await Promise.all([
    supabase.from("tarifas_viaje").select("destino, activo").eq("mcp_id", ctx.mcp.id),
    supabase.from("comisiones_viaje").select("destino, total, anulado").eq("mcp_id", ctx.mcp.id),
  ]);
  const lugares = new Map<string, { tarifas: number; salidas: number; total: number }>();
  const dato = (d: string) => lugares.get(d) ?? { tarifas: 0, salidas: 0, total: 0 };
  (tarifas ?? []).filter((t) => t.activo).forEach((t) => lugares.set(t.destino, { ...dato(t.destino), tarifas: dato(t.destino).tarifas + 1 }));
  (comisiones ?? []).filter((c) => !c.anulado).forEach((c) => lugares.set(c.destino, { ...dato(c.destino), salidas: dato(c.destino).salidas + 1, total: dato(c.destino).total + Number(c.total) }));
  const lista = [...lugares].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Viáticos</h1>
          <div className="sub">Un tarifario por lugar; dentro de cada lugar se registran las salidas (pasajes, hospedaje, alimentación…)</div>
        </div>
        <span className="espacio" />
        <Link className="btn contorno" href="/caja-chica/movilidad">Movilidad local (planilla del mes)</Link>
        <Link className="btn contorno" href="/caja-chica">← Caja chica</Link>
        {puede && (
          <VentanaFlotante boton="+ Nuevo lugar" titulo="Nuevo lugar y su primera tarifa" accion={guardarTarifaViaje} textoGuardar="Crear lugar" claseBoton="btn primario grande">
            <input type="hidden" name="volver_a" value="/caja-chica/viaticos" />
            <div className="rejilla-2">
              <label className="campo ancho">Lugar<input name="destino" required placeholder="HUANCAYO, LIMA, SATIPO…" style={{ textTransform: "uppercase" }} /></label>
              <label className="campo">Primera tarifa
                <select name="concepto" defaultValue="pasaje">{CONCEPTOS_VIAJE.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}</select>
              </label>
              <label className="campo">Se cobra
                <select name="unidad" defaultValue="viaje">{UNIDADES_VIAJE.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}</select>
              </label>
              <label className="campo">Monto S/<input name="monto" required inputMode="decimal" /></label>
              <label className="campo">Detalle (opcional)<input name="detalle" placeholder="Bus Chanchamayo – Huancayo" style={{ textTransform: "uppercase" }} /></label>
            </div>
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {lista.length === 0 ? (
        <section className="panel"><div className="panel-cuerpo"><p className="tenue" style={{ margin: 0 }}>Aún no hay lugares. Pulse «+ Nuevo lugar» (por ejemplo Huancayo): ahí guarda sus precios de pasaje, hotel y comida, y luego todas las salidas que se hagan a ese lugar.</p></div></section>
      ) : (
        <div className="fu-grid">
          {lista.map(([destino, d]) => (
            <Link key={destino} href={`/caja-chica/viaticos/lugar?d=${encodeURIComponent(destino)}`} className="fu-card" style={{ textDecoration: "none", color: "inherit" }}>
              <header className="fu-card-cab"><span className="fu-tipo">{destino}</span></header>
              <b style={{ fontSize: 20 }}>S/ {soles(d.total)}</b>
              <span className="tenue pequeno">{d.salidas} salida(s) · {d.tarifas} tarifa(s)</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
