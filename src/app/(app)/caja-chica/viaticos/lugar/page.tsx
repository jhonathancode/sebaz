import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import FormComision from "@/components/FormComision";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { CONCEPTOS_VIAJE, UNIDADES_VIAJE, nombreConcepto, nombreUnidad } from "@/lib/viaticos";
import { activarTarifaViaje, crearComision, guardarTarifaViaje } from "../acciones";

type T = { id: string; destino: string; concepto: string; detalle: string | null; unidad: string; monto: number; activo: boolean };

/** Un lugar: su tarifario y todas las salidas que se hicieron allí. */
export default async function Lugar({ searchParams }: { searchParams: Promise<ParamsAviso & { d?: string }> }) {
  const sp = await searchParams;
  const destino = (sp.d ?? "").toUpperCase();
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero");
  const [{ data: tarifas }, { data: salidas }, { data: cajas }] = await Promise.all([
    supabase.from("tarifas_viaje").select("*").eq("mcp_id", ctx.mcp.id).eq("destino", destino).order("concepto"),
    supabase.from("comisiones_viaje").select("*").eq("mcp_id", ctx.mcp.id).eq("destino", destino).order("fecha_salida", { ascending: false }),
    supabase.from("cajas_chicas").select("id, periodo, numero").eq("mcp_id", ctx.mcp.id).eq("estado", "abierta").order("periodo", { ascending: false }),
  ]);
  const todas = (tarifas ?? []) as unknown as T[];
  const activas = todas.filter((t) => t.activo).map((t) => ({ id: t.id, destino: t.destino, concepto: t.concepto, detalle: t.detalle, unidad: t.unidad, monto: Number(t.monto) }));
  const vigentes = (salidas ?? []).filter((c) => !c.anulado);
  const gastado = vigentes.reduce((s, c) => s + Number(c.total), 0);
  const aqui = `/caja-chica/viaticos/lugar?d=${encodeURIComponent(destino)}`;

  const campos = (t?: T) => (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="destino" value={destino} />
      <input type="hidden" name="volver_a" value={aqui} />
      <div className="rejilla-2">
        <label className="campo">Concepto
          <select name="concepto" defaultValue={t?.concepto ?? "pasaje"}>{CONCEPTOS_VIAJE.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}</select>
        </label>
        <label className="campo">Se cobra
          <select name="unidad" defaultValue={t?.unidad ?? "viaje"}>{UNIDADES_VIAJE.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}</select>
        </label>
        <label className="campo">Monto S/<input name="monto" required inputMode="decimal" defaultValue={t ? Number(t.monto).toFixed(2) : ""} /></label>
        <label className="campo">Detalle (opcional)<input name="detalle" defaultValue={t?.detalle ?? ""} placeholder="Hotel, bus, menú…" style={{ textTransform: "uppercase" }} /></label>
      </div>
    </>
  );

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>{destino || "Lugar"}</h1>
          <div className="sub">{vigentes.length} salida(s) · S/ {soles(gastado)} en total</div>
        </div>
        <span className="espacio" />
        <Link className="btn contorno" href="/caja-chica/viaticos">← Todos los lugares</Link>
        {puede && (
          <VentanaFlotante boton={`+ Nueva salida a ${destino}`} titulo={`Salida a ${destino}`} accion={crearComision} textoGuardar="Guardar salida" claseBoton="btn primario grande" ancha>
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
              <label className="campo ancho">Motivo de la salida<input name="motivo" required placeholder="Presentar la rendición de cuentas" style={{ textTransform: "uppercase" }} /></label>
            </div>
            <FormComision tarifas={activas} destinoInicial={destino} />
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <section className="panel">
        <div className="panel-cab">
          Tarifario de {destino}
          {puede && (
            <VentanaFlotante boton="+ Agregar tarifa" titulo={`Nueva tarifa de ${destino}`} accion={guardarTarifaViaje} textoGuardar="Guardar tarifa" claseBoton="btn chico contorno">
              {campos()}
            </VentanaFlotante>
          )}
        </div>
        <div className="panel-cuerpo">
          {todas.length === 0 && <p className="tenue" style={{ margin: 0 }}>Agregue los precios de este lugar: pasaje (por trayecto), hospedaje (por noche), alimentación (por día)…</p>}
          <div className="filas">
            {todas.map((t) => (
              <div key={t.id} className="fila" style={t.activo ? undefined : { opacity: 0.55 }}>
                <span><b>{nombreConcepto(t.concepto)}</b>{t.detalle ? <span className="tenue pequeno"> · {t.detalle}</span> : null}<br /><span className="tenue pequeno">{nombreUnidad(t.unidad)}</span></span>
                <span className="espacio" />
                <b>S/ {soles(t.monto)}</b>
                {puede && (
                  <>
                    <VentanaFlotante boton="Editar" titulo="Corregir la tarifa" accion={guardarTarifaViaje} textoGuardar="Guardar cambios" claseBoton="btn chico contorno">{campos(t)}</VentanaFlotante>
                    <form action={activarTarifaViaje}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="volver_a" value={aqui} />
                      <input type="hidden" name="activo" value={t.activo ? "0" : "1"} />
                      {t.activo ? <BotonConfirmar className="btn chico contorno" pregunta="¿Archivar esta tarifa?" detalle="Deja de usarse en las salidas nuevas. Las ya hechas no cambian." textoConfirmar="Sí, archivar">Archivar</BotonConfirmar> : <button className="btn chico contorno">Activar</button>}
                    </form>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-cab">Salidas a {destino} <span className="tenue pequeno">{(salidas ?? []).length}</span></div>
        <div className="panel-cuerpo">
          {(salidas ?? []).length === 0 ? (
            <p className="tenue" style={{ margin: 0 }}>Aún no hay salidas. Pulse «+ Nueva salida a {destino}»: los precios de arriba se cargan solos según los días del viaje.</p>
          ) : (
            <div className="filas">
              {(salidas ?? []).map((c) => (
                <Link key={c.id} href={`/caja-chica/viaticos/${c.id}`} className="fila" style={{ textDecoration: "none", color: "inherit", ...(c.anulado ? { opacity: 0.6 } : {}) }}>
                  <span><b>{fecha(c.fecha_salida)} al {fecha(c.fecha_retorno)}</b><br /><span className="tenue pequeno">{c.comisionado} · {c.motivo}</span></span>
                  <span className="espacio" />
                  <b>S/ {soles(c.total)}</b>
                  {c.anulado ? <span className="etq">ANULADA</span> : c.gasto_id ? <span className="etq azul">En caja chica</span> : <span className="etq">Por pasar a caja</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
