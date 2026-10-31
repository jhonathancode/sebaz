import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, hoyISO, nombrePeriodo, periodoActual, soles } from "@/lib/formato";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
import { supabaseServidor } from "@/lib/supabase/server";
import { abrirCaja, agregarGasto, anularGasto, cambiarCheque, editarGasto, liquidarCaja } from "./acciones";

const NOMBRE_SUSTENTO = Object.fromEntries(SUSTENTOS.map((s) => [s.codigo, s.nombre]));

export default async function CajaChica({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = sp.mes ?? periodoActual();
  const fuenteId = sp.fuente ?? ctx.fuentes.find((f) => f.tipo === "distrito")?.id ?? ctx.fuentes[0]?.id;
  const puede = tiene(ctx, "admin", "tesorero");

  const anio = periodo.slice(0, 4);
  const mesNum = periodo.slice(5, 7);
  const vista = sp.vista === "anio" ? "anio" : "mes";
  const hoyPeriodo = periodoActual();

  // La caja del mes y todas las del año (para elegir el mes y ver el cuadro del año) se piden a la vez
  const [{ data: caja }, { data: cajasAnio }] = await Promise.all([
    supabase
      .from("cajas_chicas")
      .select("*, perfiles(nombre), comprobantes_pago!cajas_chicas_comprobante_id_fkey(id, numero, origen, estado)")
      .eq("mcp_id", ctx.mcp.id)
      .eq("periodo", periodo)
      .eq("fuente_id", fuenteId ?? "")
      .neq("estado", "anulada")
      .maybeSingle(),
    supabase
      .from("cajas_chicas")
      .select("id, periodo, monto_fondo, estado")
      .eq("mcp_id", ctx.mcp.id)
      .eq("fuente_id", fuenteId ?? "")
      .gte("periodo", `${anio}-01`)
      .lte("periodo", `${anio}-12`)
      .neq("estado", "anulada"),
  ]);
  const idsAnio = (cajasAnio ?? []).map((c) => c.id);
  const [{ data: gastos }, { data: gastosAnio }] = await Promise.all([
    caja
      ? supabase.from("caja_chica_gastos").select("*").eq("caja_id", caja.id).order("fecha").order("creado_en")
      : Promise.resolve({ data: [] as never[] }),
    idsAnio.length
      ? supabase.from("caja_chica_gastos").select("caja_id, monto").in("caja_id", idsAnio).eq("anulado", false)
      : Promise.resolve({ data: [] as { caja_id: string; monto: number }[] }),
  ]);
  // Resumen de cada mes del año
  const resumenMes = new Map<string, { fondo: number; gastado: number; n: number; estado: string }>();
  (cajasAnio ?? []).forEach((c) => resumenMes.set(c.periodo, { fondo: Number(c.monto_fondo), gastado: 0, n: 0, estado: c.estado }));
  const periodoDeCaja = new Map((cajasAnio ?? []).map((c) => [c.id, c.periodo]));
  (gastosAnio ?? []).forEach((g) => {
    const r = resumenMes.get(periodoDeCaja.get(g.caja_id) ?? "");
    if (r) {
      r.gastado += Number(g.monto);
      r.n += 1;
    }
  });
  const enlace = (c: Record<string, string>) => {
    const q = new URLSearchParams({ mes: periodo, ...(fuenteId ? { fuente: fuenteId } : {}), ...(vista === "anio" ? { vista: "anio" } : {}), ...c });
    return `/caja-chica?${q.toString()}`;
  };

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

  const cuadra = !!caja && Math.round(saldo * 100) === 0;
  const fuenteNombre = ctx.fuentes.find((f) => f.id === fuenteId)?.municipalidad ?? "";
  const formGasto = caja && abierta && puede && (
    <VentanaFlotante boton="+ Registrar gasto" titulo="Registrar un gasto de caja chica" accion={agregarGasto} textoGuardar="Agregar gasto" claseBoton="btn primario grande">
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
  );

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Caja chica {caja && <Estado valor={caja.estado} />}</h1>
          <div className="sub">Fondo de {nombrePeriodo(periodo)}{fuenteNombre ? ` · pagado con ${fuenteNombre}` : ""}</div>
        </div>
        <span className="espacio" />
        {vista === "mes" && caja && <a className="btn contorno" href={`/exportar/caja-chica?mes=${periodo}`}>Descargar Excel</a>}
        {vista === "mes" && caja && <Link className="btn contorno" href={`/caja-chica/${caja.id}/requerimiento`}>Requerimiento</Link>}
        {vista === "mes" && caja && <Link className="btn contorno" href={`/caja-chica/${caja.id}/relacion`}>Relación de gastos</Link>}
        {vista === "mes" && formGasto}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <section className="cc-selector" aria-label="Elegir el período">
        <div className="cc-fila">
          <div className="cc-anio">
            <Link className="cc-flecha" href={enlace({ mes: `${Number(anio) - 1}-${mesNum}` })} aria-label={`Año ${Number(anio) - 1}`}>‹</Link>
            <b>{anio}</b>
            <Link className="cc-flecha" href={enlace({ mes: `${Number(anio) + 1}-${mesNum}` })} aria-label={`Año ${Number(anio) + 1}`}>›</Link>
          </div>
          <div className="cc-meses" role="group" aria-label="Meses del año">
            {MES_CORTO.map((nombre, i) => {
              const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
              const r = resumenMes.get(per);
              const clase = `cc-mes${per === periodo ? " sel" : ""}${r ? (r.estado === "liquidada" ? " liq" : " abierta") : " vacia"}${per === hoyPeriodo ? " hoy" : ""}`;
              return (
                <Link
                  key={per}
                  href={enlace({ mes: per })}
                  className={clase}
                  aria-current={per === periodo ? "page" : undefined}
                  title={`${nombrePeriodo(per)} · ${r ? (r.estado === "liquidada" ? "Liquidada" : "Abierta") : "Sin fondo"}${r ? ` · S/ ${soles(r.fondo)}` : ""}`}
                >
                  <span className="cc-mes-n">{nombre}</span>
                  <span className="cc-mes-d">{r ? (r.estado === "liquidada" ? "✓ Liquidada" : "Abierta") : "—"}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="cc-fila cc-pie">
          {ctx.fuentes.length > 1 ? (
            <div className="cc-fuentes" role="group" aria-label="Fondo pagado con">
              {ctx.fuentes.map((f) => (
                <Link key={f.id} href={enlace({ fuente: f.id })} className={`cc-fuente${f.id === fuenteId ? " sel" : ""}`}>
                  {f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "") || "Ingresos propios"}
                </Link>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="cc-vista" role="group" aria-label="Qué ver">
            <Link href={enlace({ vista: "mes" })} className={`cc-vista-op${vista === "mes" ? " sel" : ""}`}>Un mes</Link>
            <Link href={enlace({ vista: "anio" })} className={`cc-vista-op${vista === "anio" ? " sel" : ""}`}>Cuadro del año {anio}</Link>
          </div>
        </div>
      </section>

      {vista === "anio" && (
        <section className="panel">
          <div className="panel-cab">
            Cuadro de caja chica · {anio}
            <span className="tenue pequeno">{fuenteNombre}</span>
          </div>
          <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
            <table className="tabla">
              <thead>
                <tr><th>Mes</th><th className="num">Fondo S/</th><th className="num">Gastado S/</th><th className="num">Falta gastar S/</th><th className="num">Gastos</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {MES_CORTO.map((nombre, i) => {
                  const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
                  const r = resumenMes.get(per);
                  return (
                    <tr key={per} className={r ? undefined : "cc-fila-vacia"}>
                      <td><Link href={enlace({ mes: per, vista: "mes" })}><b>{nombrePeriodo(per)}</b></Link></td>
                      <td className="num">{r ? soles(r.fondo) : "—"}</td>
                      <td className="num">{r ? soles(r.gastado) : "—"}</td>
                      <td className="num">{r ? (Math.round((r.fondo - r.gastado) * 100) === 0 ? "✓ cuadra" : soles(r.fondo - r.gastado)) : "—"}</td>
                      <td className="num">{r ? r.n : "—"}</td>
                      <td>{r ? <Estado valor={r.estado} /> : <span className="tenue">Sin fondo</span>}</td>
                      <td><Link className="btn chico contorno" href={enlace({ mes: per, vista: "mes" })}>{r ? "Ver" : puede ? "Abrir fondo" : "Ver"}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total {anio}</td>
                  <td className="num">{soles([...resumenMes.values()].reduce((t, r) => t + r.fondo, 0))}</td>
                  <td className="num">{soles([...resumenMes.values()].reduce((t, r) => t + r.gastado, 0))}</td>
                  <td className="num">{soles([...resumenMes.values()].reduce((t, r) => t + (r.fondo - r.gastado), 0))}</td>
                  <td className="num">{[...resumenMes.values()].reduce((t, r) => t + r.n, 0)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {vista === "mes" && (
        <>

      {!caja &&
        (puede ? (
          <div className="kpi azul" style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <span className="k-et">Caja chica de {nombrePeriodo(periodo)}</span>
              <span className="k-val">Aún no se abre el fondo</span>
              <span className="k-det">Ábralo con el monto que se retiró (normalmente S/ 2,000 de la transferencia) y el responsable.</span>
            </div>
            <VentanaFlotante boton="Abrir fondo del mes" titulo="Abrir el fondo de caja chica" accion={abrirCaja} textoGuardar="Abrir fondo" claseBoton="btn primario grande">
              <input type="hidden" name="periodo" value={periodo} />
              <input type="hidden" name="fuente_id" value={fuenteId} />
              <div className="rejilla-2">
                <label className="campo">Monto del fondo S/<input name="monto_fondo" required inputMode="decimal" placeholder="2000.00" /></label>
                <label className="campo">N° de cheque<input name="numero_cheque" placeholder="Ej. 00012345" style={{ textTransform: "uppercase" }} /></label>
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
        ))}

      {caja && (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="k-et">Fondo</span>
              <span className="k-val">S/ {soles(fondo)}</span>
              <span className="k-det">Responsable: {(caja.perfiles as { nombre: string } | null)?.nombre}</span>
            </div>
            <div className="kpi">
              <span className="k-et">Gastado</span>
              <span className="k-val">S/ {soles(gastado)}</span>
              <div className="k-barra"><div style={{ width: `${Math.min(pct, 100)}%` }} /></div>
              <span className="k-det">{pct} % del fondo · {vigentes.length} gasto(s)</span>
            </div>
            <div className={`kpi ${cuadra ? "azul" : saldo < 0 ? "rojo" : "alerta"}`}>
              <span className="k-et">{cuadra ? "Cuadra" : saldo < 0 ? "Se pasó del fondo" : "Falta gastar"}</span>
              <span className="k-val">S/ {soles(Math.abs(saldo))}</span>
              <span className="k-det">{cuadra ? (abierta ? "Ya puede cerrar la caja chica" : "Caja liquidada") : saldo < 0 ? "Anule o corrija algún gasto" : "Para cerrar, lo gastado debe ser igual al fondo"}</span>
            </div>
            <div className="kpi">
              <span className="k-et">Por sustento</span>
              <span className="k-det" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {porTipo.size === 0 && "Aún no hay gastos"}
                {[...porTipo].map(([t, v]) => (
                  <span key={t} className="etq" title={NOMBRE_SUSTENTO[t] ?? t}>{t} · {v.n} · S/ {soles(v.total)}</span>
                ))}
              </span>
              {cp && (
                <span className="k-det" style={{ marginTop: 6 }}>
                  Comprobante: <Link href={`/comprobantes/${cp.id}`}>{codigoCP(cp.numero, cp.origen)}</Link> <Estado valor={cp.estado} />
                </span>
              )}
            </div>
          </div>

          {puede && caja.estado === "abierta" && (
            <div style={{ margin: "0 0 8px", display: "flex", justifyContent: "flex-end" }}>
              <VentanaFlotante boton={caja.numero_cheque ? `Cheque: ${caja.numero_cheque} · cambiar` : "Poner N° de cheque"} titulo="Número de cheque de la caja chica" accion={cambiarCheque} textoGuardar="Guardar" claseBoton="btn chico contorno">
                <input type="hidden" name="periodo" value={periodo} />
                <input type="hidden" name="fuente_id" value={fuenteId} />
                <input type="hidden" name="caja_id" value={caja.id} />
                <label className="campo">N° de cheque<input name="numero_cheque" defaultValue={caja.numero_cheque ?? ""} style={{ textTransform: "uppercase" }} /></label>
              </VentanaFlotante>
            </div>
          )}
          <div className="cc-excel-marco">
            <table className="cc-excel">
              <caption>Caja chica mes de {nombrePeriodo(periodo)}</caption>
              <thead>
                <tr>
                  <th>N°</th><th>Fecha</th><th>Cheque</th><th>CP</th><th>N° CP</th><th>Razón social</th><th>Concepto</th><th>Monto</th><th className="cc-acc-th"><span className="sr-solo">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {(gastos ?? []).length === 0 && (
                  <tr><td colSpan={9} className="cc-vacio">Aún no hay gastos. Registre el primero con «+ Registrar gasto».</td></tr>
                )}
                {(() => {
                  let n = 0;
                  return (gastos ?? []).map((g) => {
                    if (!g.anulado) n += 1;
                    return (
                      <tr key={g.id} className={g.anulado ? "anulada" : undefined}>
                        <td className="c">{g.anulado ? "—" : n}</td>
                        <td className="c">{fecha(g.fecha)}</td>
                        <td className="c">{caja.numero_cheque ?? "—"}</td>
                        <td className="c">
                          {g.sustento_tipo === "DJ" && !g.anulado ? (
                            <Link className="cc-dj" href={`/caja-chica/dj/${g.id}`} title="Ver o imprimir la declaración jurada">DJ</Link>
                          ) : (
                            g.sustento_tipo
                          )}
                        </td>
                        <td className="c">{g.sustento_numero ?? "SN"}</td>
                        <td>{g.razon_social}</td>
                        <td>
                          {g.concepto}
                          {g.anulado && <span className="cc-anulado-motivo"> · ANULADO: {g.anulado_motivo}</span>}
                        </td>
                        <td className="m">S/ {soles(g.monto)}</td>
                        <td className="acc">
                          <div className="acciones-fila">
                                                        {abierta && !g.anulado && puede && (
                              <VentanaFlotante boton="Editar" titulo="Corregir el gasto" accion={editarGasto} textoGuardar="Guardar cambios" claseBoton="btn chico contorno">
                                <input type="hidden" name="gasto_id" value={g.id} />
                                <input type="hidden" name="periodo" value={periodo} />
                                <input type="hidden" name="fuente_id" value={fuenteId} />
                                <div className="rejilla">
                                  <label className="campo">Fecha<input type="date" name="fecha" required defaultValue={g.fecha} /></label>
                                  <label className="campo">
                                    Sustento
                                    <select name="sustento_tipo" defaultValue={g.sustento_tipo}>
                                      {SUSTENTOS.map((x) => (
                                        <option key={x.codigo} value={x.codigo}>{x.nombre}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="campo">N° del documento (no para DJ)<input name="sustento_numero" defaultValue={g.sustento_numero ?? ""} /></label>
                                  <label className="campo">Razón social o comisionado<input name="razon_social" required defaultValue={g.razon_social} /></label>
                                  <label className="campo ancho">Concepto<input name="concepto" required defaultValue={g.concepto} /></label>
                                  <label className="campo">Monto S/<input name="monto" required inputMode="decimal" defaultValue={Number(g.monto).toFixed(2)} /></label>
                                </div>
                              </VentanaFlotante>
                            )}
                            {abierta && !g.anulado && puede && (
                              <Motivo chico accion={anularGasto} boton="Anular" ayuda="Motivo" campos={{ gasto_id: g.id, periodo, fuente_id: fuenteId ?? "" }} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              {(gastos ?? []).length > 0 && (
                <tfoot>
                  <tr><td colSpan={7} className="m">Total gastado</td><td className="m">S/ {soles(gastado)}</td><td className="acc"></td></tr>
                  <tr><td colSpan={7} className="m">Fondo</td><td className="m">S/ {soles(fondo)}</td><td className="acc"></td></tr>
                  <tr><td colSpan={7} className="m">{cuadra ? "Saldo (cuadra)" : saldo < 0 ? "Se pasó del fondo" : "Falta gastar"}</td><td className="m">S/ {soles(Math.abs(saldo))}</td><td className="acc"></td></tr>
                </tfoot>
              )}
            </table>
          </div>

          {abierta && puede && (
            <div className="kpi" style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 240 }}>
                <span className="k-et">Cerrar (liquidar) la caja chica</span>
                <span className="k-det">
                  Se genera un comprobante de pago por lo gastado, con la relación de gastos, y entra en la rendición como una sola línea.
                  {!cuadra && ` Falta ${saldo > 0 ? `registrar S/ ${soles(saldo)}` : `quitar S/ ${soles(-saldo)}`} para poder cerrar.`}
                </span>
              </div>
              <form action={liquidarCaja}>
                <input type="hidden" name="caja_id" value={caja.id} />
                <input type="hidden" name="periodo" value={periodo} />
                <input type="hidden" name="fuente_id" value={fuenteId} />
                <BotonConfirmar
                  className="btn primario grande"
                  disabled={!cuadra}
                  pregunta="¿Está seguro de cerrar la caja chica?"
                  detalle={`Se generará el comprobante de pago por S/ ${soles(gastado)}. Cerrada, ya no admite gastos ni cambios.`}
                  textoConfirmar="Sí, cerrar caja chica"
                >
                  Cerrar caja chica
                </BotonConfirmar>
              </form>
            </div>
          )}
        </>
      )}
        </>
      )}
    </>
  );
}
