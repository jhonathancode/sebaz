import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, hoyISO, nombrePeriodo, periodoActual, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { abrirCaja, agregarGasto, anularGasto, liquidarCaja } from "./acciones";

const NOMBRE_SUSTENTO = Object.fromEntries(SUSTENTOS.map((s) => [s.codigo, s.nombre]));

export default async function CajaChica({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = sp.mes ?? periodoActual();
  const fuenteId = sp.fuente ?? ctx.fuentes.find((f) => f.tipo === "distrito")?.id ?? ctx.fuentes[0]?.id;
  const puede = tiene(ctx, "admin", "tesorero");

  const { data: caja } = await supabase
    .from("cajas_chicas")
    .select("*, perfiles(nombre), comprobantes_pago!cajas_chicas_comprobante_id_fkey(id, numero, origen, estado)")
    .eq("mcp_id", ctx.mcp.id)
    .eq("periodo", periodo)
    .eq("fuente_id", fuenteId ?? "")
    .neq("estado", "anulada")
    .maybeSingle();

  const { data: gastos } = caja
    ? await supabase.from("caja_chica_gastos").select("*").eq("caja_id", caja.id).order("fecha").order("creado_en")
    : { data: [] };

  const vigentes = (gastos ?? []).filter((g) => !g.anulado);
  const gastado = vigentes.reduce((s, g) => s + Number(g.monto), 0);
  const fondo = Number(caja?.monto_fondo ?? 0);
  const saldo = fondo - gastado;
  const pct = fondo ? Math.round((gastado / fondo) * 100) : 0;
  const porTipo = new Map<string, { n: number; total: number }>();
  vigentes.forEach((g) => {
    const t = porTipo.get(g.sustento_tipo) ?? { n: 0, total: 0 };
    porTipo.set(g.sustento_tipo, { n: t.n + 1, total: t.total + Number(g.monto) });
  });

  const { data: responsables } = await supabase
    .from("miembros")
    .select("user_id, rol, perfiles(nombre)")
    .eq("mcp_id", ctx.mcp.id)
    .eq("activo", true);

  const abierta = caja?.estado === "abierta";
  const cp = caja?.comprobantes_pago as unknown as { id: string; numero: number; origen: string; estado: string } | null;

  return (
    <>
      <div className="titulo-ventana">
        <h1>Caja chica · {nombrePeriodo(periodo)}</h1>
        {caja && <Estado valor={caja.estado} />}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="barra">
        <form method="get" style={{ display: "contents" }}>
        <label className="campo">Mes<input type="month" name="mes" defaultValue={periodo} /></label>
        <label className="campo">
          Fondo de la transferencia de
          <select name="fuente" defaultValue={fuenteId}>
            {ctx.fuentes.map((f) => (
              <option key={f.id} value={f.id}>{f.municipalidad}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">Ver</button>
        </form>
        <span className="espacio" />
        {caja && abierta && puede && (
          <VentanaFlotante boton="Registrar gasto" titulo="Registrar un gasto de caja chica" accion={agregarGasto} textoGuardar="Agregar gasto" claseBoton="btn">
            <input type="hidden" name="caja_id" value={caja.id} />
            <input type="hidden" name="periodo" value={periodo} />
            <input type="hidden" name="fuente_id" value={fuenteId} />
            <div className="rejilla">
              <label className="campo">Fecha<input type="date" name="fecha" required defaultValue={hoyISO().startsWith(periodo) ? hoyISO() : `${periodo}-01`} /></label>
              <label className="campo">
                Sustento
                <select name="sustento_tipo" defaultValue="DJ">
                  {SUSTENTOS.map((x) => (
                    <option key={x.codigo} value={x.codigo}>{x.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="campo">N° del documento (no para DJ)<input name="sustento_numero" placeholder="B001-3516" /></label>
              <label className="campo">Razón social o comisionado<input name="razon_social" required /></label>
              <label className="campo ancho">Concepto<input name="concepto" required placeholder="Salida a Perené: verificación de documentos para la rendición" /></label>
              <label className="campo">Monto S/<input name="monto" required inputMode="decimal" /></label>
            </div>
            <p className="pequeno tenue" style={{ margin: 0 }}>Saldo disponible del fondo: S/ {soles(saldo)}. Con declaración jurada, el formato se imprime desde la lista.</p>
          </VentanaFlotante>
        )}
        {caja && (
          <Link className="btn" href={`/caja-chica/${caja.id}/relacion`}>Imprimir relación</Link>
        )}
        {caja && abierta && puede && vigentes.length > 0 && (
          <form action={liquidarCaja}>
            <input type="hidden" name="caja_id" value={caja.id} />
            <input type="hidden" name="periodo" value={periodo} />
            <input type="hidden" name="fuente_id" value={fuenteId} />
            <button className="btn primario" type="submit">Liquidar caja chica</button>
          </form>
        )}
      </div>

      {!caja && (
        puede ? (
          <div className="aviso info" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ flex: 1 }}>Aún no se abre el fondo de caja chica de este mes.</span>
            <VentanaFlotante boton="Abrir fondo del mes" titulo="Abrir el fondo de caja chica" accion={abrirCaja} textoGuardar="Abrir fondo">
              <input type="hidden" name="periodo" value={periodo} />
              <input type="hidden" name="fuente_id" value={fuenteId} />
              <div className="rejilla-2">
                <label className="campo">Monto del fondo S/<input name="monto_fondo" required inputMode="decimal" placeholder="2000.00" /></label>
                <label className="campo">
                  Responsable del fondo
                  <select name="responsable_id" required>
                    {(responsables ?? []).map((r) => (
                      <option key={r.user_id + r.rol} value={r.user_id}>
                        {(r.perfiles as unknown as { nombre: string } | null)?.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </VentanaFlotante>
          </div>
        ) : (
          <div className="aviso info">No hay fondo de caja chica abierto este mes.</div>
        )
      )}

      {caja && (
        <div className="columnas">
          <div className="principal">
            <div className="tabla-marco">
              <table className="tabla" style={{ minWidth: 860 }}>
                <thead>
                  <tr><th>N°</th><th>Fecha</th><th>Sustento</th><th>N° doc.</th><th>Razón social</th><th>Concepto</th><th className="num">Monto S/</th><th></th></tr>
                </thead>
                <tbody>
                  {(gastos ?? []).length === 0 && <tr><td colSpan={8} className="tenue">Aún no hay gastos.</td></tr>}
                  {(gastos ?? []).map((g, i) => (
                    <tr key={g.id} className={g.anulado ? "anulado" : undefined}>
                      <td>{i + 1}</td>
                      <td>{fecha(g.fecha)}</td>
                      <td>{g.sustento_tipo}</td>
                      <td>{g.sustento_numero ?? "S/N"}</td>
                      <td>{g.razon_social}</td>
                      <td className="envolver tachar">
                        {g.concepto}
                        {g.anulado && <div className="pequeno">Anulado: {g.anulado_motivo}</div>}
                      </td>
                      <td className="num tachar">{soles(g.monto)}</td>
                      <td>
                        {g.sustento_tipo === "DJ" && !g.anulado && <Link className="btn" href={`/caja-chica/dj/${g.id}`}>DJ</Link>}{" "}
                        {abierta && !g.anulado && puede && (
                          <Motivo accion={anularGasto} boton="Anular" ayuda="Motivo" campos={{ gasto_id: g.id, periodo, fuente_id: fuenteId ?? "" }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={6}>Total gastado</td><td className="num">{soles(gastado)}</td><td></td></tr>
                </tfoot>
              </table>
            </div>

          </div>

          <aside className="lateral">
            <section className="panel">
              <div className="panel-cab">Estado del fondo</div>
              <table className="tabla">
                <tbody>
                  <tr><td>Fondo</td><td className="num">{soles(fondo)}</td></tr>
                  <tr><td>Gastado ({vigentes.length})</td><td className="num">{soles(gastado)}</td></tr>
                  <tr style={{ fontWeight: 600 }}><td>Saldo</td><td className="num">{soles(saldo)}</td></tr>
                </tbody>
              </table>
              <div className="panel-cuerpo">
                <div style={{ display: "flex", justifyContent: "space-between" }} className="pequeno tenue"><span>Gastado</span><span>{pct} %</span></div>
                <div style={{ height: 12, background: "var(--linea)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "var(--verde)" }} />
                </div>
                <div className="pequeno">Responsable: {(caja.perfiles as { nombre: string } | null)?.nombre}</div>
                {cp && (
                  <div>
                    Comprobante: <Link href={`/comprobantes/${cp.id}`}>{codigoCP(cp.numero, cp.origen)}</Link> <Estado valor={cp.estado} />
                  </div>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-cab">Por tipo de sustento</div>
              <table className="tabla">
                <tbody>
                  {[...porTipo].map(([t, v]) => (
                    <tr key={t}><td>{NOMBRE_SUSTENTO[t] ?? t} ({v.n})</td><td className="num">{soles(v.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel">
              <div className="panel-cab">Al liquidar</div>
              <div className="panel-cuerpo">
                <ul className="lista-reglas">
                  <li>Se genera un comprobante de pago por lo gastado, con la relación de gastos.</li>
                  <li>Ese comprobante entra en la rendición como una sola línea.</li>
                  <li>Liquidada, la caja ya no admite gastos ni cambios.</li>
                </ul>
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
