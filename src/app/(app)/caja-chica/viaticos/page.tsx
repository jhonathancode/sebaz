import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import FormComision from "@/components/FormComision";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { CONCEPTOS_VIAJE, UNIDADES_VIAJE, nombreConcepto, nombreUnidad } from "@/lib/viaticos";
import { activarTarifaViaje, crearComision, guardarTarifaViaje } from "./acciones";

type T = { id: string; destino: string; concepto: string; detalle: string | null; unidad: string; monto: number; activo: boolean };

export default async function Viaticos({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero");
  const [{ data: tarifas }, { data: comisiones }, { data: cajas }] = await Promise.all([
    supabase.from("tarifas_viaje").select("*").eq("mcp_id", ctx.mcp.id).order("destino").order("concepto"),
    supabase.from("comisiones_viaje").select("*").eq("mcp_id", ctx.mcp.id).order("anio", { ascending: false }).order("numero", { ascending: false }),
    supabase.from("cajas_chicas").select("id, periodo, numero, numero_cheque").eq("mcp_id", ctx.mcp.id).eq("estado", "abierta").order("periodo", { ascending: false }),
  ]);
  const todas = (tarifas ?? []) as unknown as T[];
  const activas = todas.filter((t) => t.activo).map((t) => ({ id: t.id, destino: t.destino, concepto: t.concepto, detalle: t.detalle, unidad: t.unidad, monto: Number(t.monto) }));
  const porDestino = new Map<string, T[]>();
  todas.forEach((t) => porDestino.set(t.destino, [...(porDestino.get(t.destino) ?? []), t]));

  const campos = (t?: T) => (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="rejilla-2">
        <label className="campo">Destino<input name="destino" required defaultValue={t?.destino ?? ""} placeholder="HUANCAYO, LIMA, SATIPO…" style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Concepto
          <select name="concepto" defaultValue={t?.concepto ?? "pasaje"}>{CONCEPTOS_VIAJE.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}</select>
        </label>
        <label className="campo">Detalle (opcional)<input name="detalle" defaultValue={t?.detalle ?? ""} placeholder="Bus Chanchamayo – Huancayo" style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Se cobra
          <select name="unidad" defaultValue={t?.unidad ?? "viaje"}>{UNIDADES_VIAJE.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}</select>
        </label>
        <label className="campo">Monto S/<input name="monto" required inputMode="decimal" defaultValue={t ? Number(t.monto).toFixed(2) : ""} /></label>
      </div>
    </>
  );

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Viáticos y comisiones</h1>
          <div className="sub">Viajes fuera de la localidad: pasajes, hospedaje, alimentación y movilidad por destino</div>
        </div>
        <span className="espacio" />
        <Link className="btn contorno" href="/caja-chica/movilidad">Movilidad local</Link>
        <Link className="btn contorno" href="/caja-chica">← Caja chica</Link>
        {puede && (
          <VentanaFlotante boton="+ Nueva comisión" titulo="Comisión de servicio" accion={crearComision} textoGuardar="Guardar comisión" claseBoton="btn primario grande" ancha>
            <div className="rejilla-2">
              <label className="campo">Comisionado<input name="comisionado" required style={{ textTransform: "uppercase" }} /></label>
              <label className="campo">DNI<input name="documento" inputMode="numeric" maxLength={11} /></label>
              <label className="campo">Cargo<input name="cargo" style={{ textTransform: "uppercase" }} /></label>
              <label className="campo">Pasar a la caja chica (opcional)
                <select name="caja_id" defaultValue="">
                  <option value="">— decidir después —</option>
                  {(cajas ?? []).map((c) => <option key={c.id} value={c.id}>{nombrePeriodo(c.periodo)} · caja {c.numero}</option>)}
                </select>
              </label>
              <label className="campo ancho">Motivo de la comisión<input name="motivo" required placeholder="Presentar la rendición de cuentas en la municipalidad provincial" style={{ textTransform: "uppercase" }} /></label>
            </div>
            <FormComision tarifas={activas} />
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <section className="panel">
        <div className="panel-cab">Comisiones de servicio <span className="tenue pequeno">{(comisiones ?? []).length}</span></div>
        <div className="panel-cuerpo">
          {(comisiones ?? []).length === 0 ? (
            <p className="tenue" style={{ margin: 0 }}>Aún no hay comisiones. Primero llene el tarifario de abajo (por ejemplo Huancayo y Lima); después cada comisión se calcula sola según los días del viaje.</p>
          ) : (
            <div className="filas">
              {(comisiones ?? []).map((c) => (
                <div key={c.id} className="fila" style={c.anulado ? { opacity: 0.6 } : undefined}>
                  <Link href={`/caja-chica/viaticos/${c.id}`}><b>Comisión V{String(c.numero).padStart(3, "0")}-{c.anio}</b></Link>
                  <span className="tenue pequeno">{c.comisionado} · {c.destino} · {fecha(c.fecha_salida)} al {fecha(c.fecha_retorno)}</span>
                  <span className="espacio" />
                  <b>S/ {soles(c.total)}</b>
                  {c.anulado ? <span className="etq">ANULADA</span> : c.gasto_id ? <span className="etq">En caja chica</span> : <span className="etq">Por pasar a caja</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-cab">
          Tarifario por destino
          {puede && (
            <VentanaFlotante boton="+ Agregar tarifa" titulo="Nueva tarifa de viaje" accion={guardarTarifaViaje} textoGuardar="Guardar tarifa" claseBoton="btn chico contorno">
              {campos()}
            </VentanaFlotante>
          )}
        </div>
        <div className="panel-cuerpo">
          {porDestino.size === 0 && <p className="tenue" style={{ margin: 0 }}>Agregue las tarifas de cada destino: el pasaje de ida (se cobra por trayecto), el hospedaje por noche y la alimentación por día.</p>}
          <div className="fu-grid">
            {[...porDestino].map(([destino, ts]) => (
              <article key={destino} className="fu-card">
                <header className="fu-card-cab"><span className="fu-tipo">{destino}</span></header>
                <div className="filas">
                  {ts.map((t) => (
                    <div key={t.id} className="fila" style={t.activo ? undefined : { opacity: 0.55 }}>
                      <span><b>{nombreConcepto(t.concepto)}</b>{t.detalle ? <span className="tenue pequeno"> · {t.detalle}</span> : null}<br /><span className="tenue pequeno">{nombreUnidad(t.unidad)}</span></span>
                      <span className="espacio" />
                      <b>S/ {soles(t.monto)}</b>
                      {puede && (
                        <>
                          <VentanaFlotante boton="Editar" titulo="Corregir la tarifa" accion={guardarTarifaViaje} textoGuardar="Guardar cambios" claseBoton="btn chico contorno">{campos(t)}</VentanaFlotante>
                          <form action={activarTarifaViaje}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="activo" value={t.activo ? "0" : "1"} />
                            {t.activo ? <BotonConfirmar className="btn chico contorno" pregunta="¿Archivar esta tarifa?" detalle="Deja de usarse en las comisiones nuevas. Las ya hechas no cambian." textoConfirmar="Sí, archivar">Archivar</BotonConfirmar> : <button className="btn chico contorno">Activar</button>}
                          </form>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
