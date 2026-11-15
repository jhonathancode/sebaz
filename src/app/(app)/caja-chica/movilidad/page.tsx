import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import FormPlanilla from "@/components/FormPlanilla";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, hoyISO, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { activarTarifa, crearPlanilla, guardarTarifa } from "./acciones";

const TIPO = { taxi: "Taxi", urbano: "Urbano" } as const;

export default async function Movilidad({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero");
  const [{ data: tarifas }, { data: planillas }, { data: cajas }] = await Promise.all([
    supabase.from("tarifas_movilidad").select("*").eq("mcp_id", ctx.mcp.id).order("destino"),
    supabase.from("planillas_movilidad").select("*").eq("mcp_id", ctx.mcp.id).order("anio", { ascending: false }).order("numero", { ascending: false }),
    supabase.from("cajas_chicas").select("id, periodo, numero, numero_cheque").eq("mcp_id", ctx.mcp.id).eq("estado", "abierta").order("periodo", { ascending: false }),
  ]);
  const activas = (tarifas ?? []).filter((t) => t.activo).map((t) => ({ id: t.id, destino: t.destino, tipo: t.tipo as "taxi" | "urbano", monto: Number(t.monto) }));

  const campoTarifa = (t?: { id: string; destino: string; tipo: string; monto: number }) => (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="rejilla-2">
        <label className="campo">Destino<input name="destino" required defaultValue={t?.destino ?? ""} placeholder="Ej. PUERTO BERMÚDEZ" style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Tipo
          <select name="tipo" defaultValue={t?.tipo ?? "urbano"}><option value="urbano">Urbano</option><option value="taxi">Taxi</option></select>
        </label>
        <label className="campo">Monto S/<input name="monto" required inputMode="decimal" defaultValue={t ? Number(t.monto).toFixed(2) : ""} /></label>
      </div>
    </>
  );

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Movilidad</h1>
          <div className="sub">Tarifario y planillas de movilidad local de la caja chica</div>
        </div>
        <span className="espacio" />
        <Link className="btn contorno" href="/caja-chica">← Caja chica</Link>
        {puede && (
          <VentanaFlotante boton="+ Nueva planilla" titulo="Planilla de movilidad" accion={crearPlanilla} textoGuardar="Guardar planilla" claseBoton="btn primario grande" ancha>
            <div className="rejilla-2">
              <label className="campo">Comisionado<input name="comisionado" required style={{ textTransform: "uppercase" }} /></label>
              <label className="campo">DNI<input name="documento" inputMode="numeric" maxLength={11} /></label>
              <label className="campo">Cargo<input name="cargo" style={{ textTransform: "uppercase" }} /></label>
              <label className="campo">Pasar a la caja chica (opcional)
                <select name="caja_id" defaultValue="">
                  <option value="">— decidir después —</option>
                  {(cajas ?? []).map((c) => <option key={c.id} value={c.id}>{nombrePeriodo(c.periodo)} · caja {c.numero}{c.numero_cheque ? ` · cheque ${c.numero_cheque}` : ""}</option>)}
                </select>
              </label>
              <label className="campo ancho">Motivo de la movilidad<input name="motivo" required placeholder="Gestiones y entrega de documentos a la sede provincial" style={{ textTransform: "uppercase" }} /></label>
            </div>
            <FormPlanilla tarifas={activas} fechaInicial={hoyISO()} />
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <section className="panel">
        <div className="panel-cab">
          Planillas de movilidad
          <span className="tenue pequeno">{(planillas ?? []).length}</span>
        </div>
        <div className="panel-cuerpo">
          {(planillas ?? []).length === 0 ? (
            <p className="tenue" style={{ margin: 0 }}>Aún no hay planillas. Cree la primera con «+ Nueva planilla»: elija los destinos del tarifario y el monto se completa solo.</p>
          ) : (
            <div className="filas">
              {(planillas ?? []).map((p) => (
                <div key={p.id} className="fila" style={p.anulado ? { opacity: 0.6 } : undefined}>
                  <Link href={`/caja-chica/movilidad/${p.id}`}><b>Planilla {String(p.numero).padStart(3, "0")}-{p.anio}</b></Link>
                  <span className="tenue pequeno">{p.comisionado} · {p.motivo}</span>
                  <span className="espacio" />
                  <b>S/ {soles(p.total)}</b>
                  {p.anulado ? <span className="etq">ANULADA</span> : p.gasto_id ? <span className="etq">En caja chica</span> : <span className="etq">Por pasar a caja</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-cab">
          Tarifario de movilidad
          {puede && (
            <VentanaFlotante boton="+ Agregar tarifa" titulo="Nueva tarifa" accion={guardarTarifa} textoGuardar="Guardar tarifa" claseBoton="btn chico contorno">
              {campoTarifa()}
            </VentanaFlotante>
          )}
        </div>
        <div className="panel-cuerpo">
          {(tarifas ?? []).length === 0 ? (
            <p className="tenue" style={{ margin: 0 }}>Escriba aquí cuánto cuesta ir a cada destino, en taxi o en transporte urbano. Así las planillas se llenan con un clic y los montos son siempre los mismos.</p>
          ) : (
            <div className="cc-excel-marco" style={{ border: "none" }}>
              <table className="cc-excel">
                <thead><tr><th>Destino</th><th>Tipo</th><th className="num">Monto S/</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {(tarifas ?? []).map((t) => (
                    <tr key={t.id} style={t.activo ? undefined : { opacity: 0.55 }}>
                      <td>{t.destino}</td>
                      <td>{TIPO[t.tipo as "taxi" | "urbano"]}</td>
                      <td className="num">{soles(t.monto)}</td>
                      <td>{t.activo ? "Activa" : "Archivada"}</td>
                      <td className="acc">
                        {puede && (
                          <div className="acciones-fila">
                            <VentanaFlotante boton="Editar" titulo="Corregir la tarifa" accion={guardarTarifa} textoGuardar="Guardar cambios" claseBoton="btn chico contorno">
                              {campoTarifa({ id: t.id, destino: t.destino, tipo: t.tipo, monto: Number(t.monto) })}
                            </VentanaFlotante>
                            <form action={activarTarifa}>
                              <input type="hidden" name="id" value={t.id} />
                              <input type="hidden" name="activo" value={t.activo ? "0" : "1"} />
                              {t.activo ? (
                                <BotonConfirmar className="btn chico contorno" pregunta="¿Archivar esta tarifa?" detalle="Deja de salir al crear planillas. Las planillas ya hechas no cambian." textoConfirmar="Sí, archivar">Archivar</BotonConfirmar>
                              ) : (
                                <button className="btn chico contorno">Activar</button>
                              )}
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pequeno tenue" style={{ margin: "10px 0 0" }}>Última actualización del tarifario: {(tarifas ?? []).length ? fecha((tarifas ?? []).map((t) => t.creado_en).sort().at(-1)!.slice(0, 10)) : "—"}.</p>
        </div>
      </section>
    </>
  );
}
