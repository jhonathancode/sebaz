import Link from "next/link";
import { Fragment } from "react";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { cargarContabilidad, chequesEnTransito, libro, libroDiario, matriz, MESES_CORTOS, nombreRubro } from "@/lib/contabilidad";
import { fecha, hoyISO, nombrePeriodo, periodoActual, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularTransferencia, guardarExtracto, guardarSaldoInicial, marcarCobrados, registrarTransferencia } from "./acciones";

const VISTAS = [
  { v: "resumen", t: "Resumen" },
  { v: "bancos", t: "Libro Bancos" },
  { v: "caja", t: "Libro Caja" },
  { v: "ejecucion", t: "Ejecución" },
  { v: "conciliacion", t: "Conciliación bancaria" },
  { v: "diario", t: "Libro diario" },
  { v: "datos", t: "Datos contables" },
];

export default async function Contabilidad({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = sp.mes ?? periodoActual();
  const anio = Number(mes.slice(0, 4));
  const ver = VISTAS.some((x) => x.v === sp.ver) ? sp.ver! : "resumen";
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const d = await cargarContabilidad(supabase, ctx.mcp.id, anio, ctx.fuentes);
  const transferencias = ctx.fuentes.filter((f) => f.tipo !== "propios");

  if (d.faltaActualizacion) {
    return (
      <>
        <div className="cab-vista"><h1>Contabilidad</h1></div>
        <div className="aviso error">La contabilidad aún no está activa: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql). Avise a soporte.</div>
      </>
    );
  }

  const bancos = libro(d, "bancos", mes);
  const caja = libro(d, "caja", mes);
  const mesNum = Number(mes.slice(5, 7)) - 1;
  const gastosAnio = d.cps.reduce((s, c) => s + c.importe, 0);
  const ingresosAnio = d.transferencias.reduce((s, t) => s + t.monto, 0) + d.ingresos.reduce((s, i) => s + i.monto, 0);
  const gastosMes = d.cps.filter((c) => c.fecha.startsWith(mes)).reduce((s, c) => s + c.importe, 0);
  const ingresosMes = d.transferencias.filter((t) => t.fecha.startsWith(mes)).reduce((s, t) => s + t.monto, 0) + d.ingresos.filter((i) => i.fecha.startsWith(mes)).reduce((s, i) => s + i.monto, 0);
  const transito = chequesEnTransito(d, mes);
  const totalTransito = transito.reduce((s, c) => s + c.liquido, 0);
  const extracto = d.conciliaciones.get(mes);
  const diferencia = extracto ? Math.round((extracto.saldo_extracto - (bancos.final + totalTransito)) * 100) / 100 : null;
  const sinTransferenciaMes = transferencias.filter((f) => !d.transferencias.some((t) => t.fuente_id === f.id && t.periodo === mes));

  const enlace = (v: string, m = mes) => `/contabilidad?ver=${v}&mes=${m}`;

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Contabilidad</h1>
          <div className="sub">Así está {nombrePeriodo(mes)}: lo que entró, lo que salió y si cuadra con el banco</div>
        </div>
        <span className="espacio" />
        {["bancos", "caja", "ejecucion", "diario"].includes(ver) && (
          <a className="btn contorno" href={`/exportar/contabilidad?ver=${ver}&mes=${mes}`}>Descargar Excel</a>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <section className="cc-selector" aria-label="Elegir el mes">
        <div className="cc-fila">
          <div className="cc-anio">
            <Link className="cc-flecha" href={enlace(ver, `${anio - 1}-${mes.slice(5, 7)}`)} aria-label={`Año ${anio - 1}`}>‹</Link>
            <b>{anio}</b>
            <Link className="cc-flecha" href={enlace(ver, `${anio + 1}-${mes.slice(5, 7)}`)} aria-label={`Año ${anio + 1}`}>›</Link>
          </div>
          <div className="cc-meses" role="group" aria-label="Meses del año">
            {MESES_CORTOS.map((nombre, i) => {
              const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
              return (
                <Link key={per} href={enlace(ver, per)} className={`cc-mes${per === mes ? " sel" : ""}${per === periodoActual() ? " hoy" : ""}`} aria-current={per === mes ? "page" : undefined}>
                  <span className="cc-mes-n">{nombre}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <nav className="cfg-tabs" role="tablist" aria-label="Vistas de contabilidad">
        {VISTAS.map((x) => (
          <Link key={x.v} role="tab" aria-selected={ver === x.v} className={`cfg-tab${ver === x.v ? " activa" : ""}`} href={enlace(x.v)}>{x.t}</Link>
        ))}
      </nav>

      {(!d.hayDatosIniciales || sinTransferenciaMes.length > 0) && ver !== "datos" && ver !== "resumen" && (
        <div className="aviso alerta aviso-accion">
          <span>
            {!d.hayDatosIniciales && <>Falta el <b>saldo inicial {anio}</b> de la cuenta. </>}
            {sinTransferenciaMes.length > 0 && <>Falta registrar la transferencia de {nombrePeriodo(mes)} de {sinTransferenciaMes.map((f) => f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")).join(" y ")}. </>}
            Sin estos datos los saldos no cuadran con el banco.
          </span>
          <Link className="btn chico primario" href={enlace("datos")}>Completar datos</Link>
        </div>
      )}

      {/* ------------------------------------------------------- RESUMEN */}
      {ver === "resumen" && (
        <>
          {(() => {
            const ing = MESES_CORTOS.map((_, i) => {
              const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
              return d.transferencias.filter((t) => t.fecha.startsWith(per)).reduce((t, x) => t + x.monto, 0) + d.ingresos.filter((x) => x.fecha.startsWith(per)).reduce((t, x) => t + x.monto, 0);
            });
            const gas = MESES_CORTOS.map((_, i) => d.cps.filter((c) => c.fecha.startsWith(`${anio}-${String(i + 1).padStart(2, "0")}`)).reduce((t, c) => t + c.importe, 0));
            const tope = Math.max(1, ...ing, ...gas);
            const partidas = matriz(d.cps, (c) => c.partida, (c) => c.fecha, (c) => c.importe).filas;
            const maxPartida = Math.max(1, ...partidas.map((f) => f.total));
            return (
              <>
                {/* 1 · Lo que falta, en pasos simples */}
                {(() => {
                  const pasos = [
                    { ok: d.hayDatosIniciales, t: `Saldo inicial de ${anio}`, d: d.hayDatosIniciales ? "Ya está registrado" : "Cuánto dinero había en el banco y en caja al empezar", href: enlace("datos"), b: "Registrar" },
                    { ok: sinTransferenciaMes.length === 0, t: `Transferencia de ${nombrePeriodo(mes)}`, d: sinTransferenciaMes.length === 0 ? "Ya está registrada" : `Falta la de ${sinTransferenciaMes.map((f) => f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")).join(" y ")}`, href: enlace("datos"), b: "Registrar" },
                    { ok: !!extracto, t: "Estado de cuenta del banco", d: extracto ? "Ya está copiado" : "Súbalo y cópielo para comparar con el banco", href: `/contabilidad/estados-cuenta/conciliar?mes=${mes}`, b: "Subir y copiar" },
                  ];
                  const faltan = pasos.filter((x) => !x.ok).length;
                  return (
                    <section className={`cs-pasos${faltan === 0 ? " listo" : ""}`} aria-label="Lo que falta">
                      <div className="cs-pasos-cab">
                        <b>{faltan === 0 ? "✓ Todo está en orden" : `Faltan ${faltan} cosa${faltan > 1 ? "s" : ""} para que cuadre`}</b>
                        <span>{faltan === 0 ? `${nombrePeriodo(mes)} tiene todo lo necesario.` : "Hágalas en este orden:"}</span>
                      </div>
                      <ol>
                        {pasos.map((x, n) => (
                          <li key={x.t} className={x.ok ? "hecho" : ""}>
                            <i>{x.ok ? "✓" : n + 1}</i>
                            <div><b>{x.t}</b><small>{x.d}</small></div>
                            {!x.ok && <Link className="btn chico primario" href={x.href}>{x.b}</Link>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  );
                })()}

                {/* 2 · Cuatro cifras en palabras claras */}
                <section className="cs-cifras" aria-label="Cifras del mes">
                  <div className="cs-cifra azul">
                    <span>Dinero en el banco</span>
                    <b>S/ {soles(bancos.final)}</b>
                    <small>{d.hayDatosIniciales ? `Según su libro al cerrar ${nombrePeriodo(mes)}` : "Aún falta el saldo inicial"}</small>
                  </div>
                  <div className="cs-cifra">
                    <span>Dinero en caja</span>
                    <b>S/ {soles(caja.final)}</b>
                    <small>Efectivo de ingresos propios</small>
                  </div>
                  <div className="cs-cifra mas">
                    <span>Entró este mes</span>
                    <b>+ S/ {soles(ingresosMes)}</b>
                    <small>En todo {anio}: S/ {soles(ingresosAnio)}</small>
                  </div>
                  <div className="cs-cifra menos">
                    <span>Salió este mes</span>
                    <b>− S/ {soles(gastosMes)}</b>
                    <small>En todo {anio}: S/ {soles(gastosAnio)}</small>
                  </div>
                </section>

                {/* 3 · ¿Cuadra con el banco? */}
                <section className="cs-cuadra" aria-label="¿Cuadra con el banco?">
                  <h2>¿Cuadra con el banco?</h2>
                  <div className="cs-cuenta">
                    <div><span>Su libro dice</span><b>S/ {soles(bancos.final)}</b></div>
                    <div className="op"><span>+ Cheques girados que el banco aún no cobra ({transito.length})</span><b>S/ {soles(totalTransito)}</b></div>
                    <div className="tot"><span>El banco debería tener</span><b>S/ {soles(bancos.final + totalTransito)}</b></div>
                    <div><span>El estado de cuenta dice</span><b>{extracto ? `S/ ${soles(extracto.saldo_extracto)}` : "—"}</b></div>
                  </div>
                  {extracto ? (
                    diferencia === 0 ? (
                      <div className="cs-veredicto ok">✓ Sí cuadra. No hay diferencia con el banco.</div>
                    ) : (
                      <div className="cs-veredicto mal">⚠ No cuadra: hay una diferencia de S/ {soles(Math.abs(diferencia!))}. Revise los movimientos en la conciliación.</div>
                    )
                  ) : (
                    <div className="cs-veredicto pend">Aún no se puede comparar: falta copiar el estado de cuenta de {nombrePeriodo(mes)}.</div>
                  )}
                  <div className="ini-acciones">
                    <Link className="btn primario" href={`/contabilidad/estados-cuenta/conciliar?mes=${mes}`}>{extracto ? "Ver o corregir el estado de cuenta" : "Subir y copiar el estado de cuenta"}</Link>
                    <Link className="btn" href={enlace("conciliacion")}>Ver cheques en tránsito</Link>
                  </div>
                </section>

                {/* 4 · El detalle, plegado para no cargar la vista */}
                <details className="cs-mas">
                  <summary>Ver más detalle: mes a mes y por partida</summary>
                  <section className="ini-panel" aria-label="Ingresos y gastos del año por mes">
                    <div className="ini-panel-cab">
                      <span>Ingresos y gastos de {anio}, mes a mes</span>
                      <small><i className="ct-leyenda ing" /> Ingresos · <i className="ct-leyenda gas" /> Gastos</small>
                    </div>
                    <div className="ct-barras">
                      {MESES_CORTOS.map((nombre, i) => (
                        <Link key={nombre} href={enlace("resumen", `${anio}-${String(i + 1).padStart(2, "0")}`)} className={`ct-par${i === mesNum ? " sel" : ""}`} title={`${nombre}: ingresos S/ ${soles(ing[i])} · gastos S/ ${soles(gas[i])}`}>
                          <span className="ct-col">
                            <span className="ing" style={{ height: `${(ing[i] / tope) * 100}%` }} />
                            <span className="gas" style={{ height: `${(gas[i] / tope) * 100}%` }} />
                          </span>
                          <span className="ct-mes">{nombre}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                  <section className="ini-panel" aria-label="Gasto del año por partida">
                    <div className="ini-panel-cab"><span>Gasto de {anio} por partida</span><small>S/ {soles(gastosAnio)}</small></div>
                    {partidas.length === 0 ? (
                      <span className="tenue">Sin gastos aprobados en {anio}.</span>
                    ) : (
                      <div className="barras">
                        {partidas.map((f) => (
                          <div key={f.nombre} className="fila" title={`${f.nombre}: S/ ${soles(f.total)}`}>
                            <span>{f.nombre}</span>
                            <span className="monto">{soles(f.total)}</span>
                            <div className="pista" aria-hidden="true"><div style={{ width: `${(f.total / maxPartida) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </details>
              </>
            );
          })()}
        </>
      )}

      {/* ------------------------------------------------- LIBROS */}
      {(ver === "bancos" || ver === "caja") && (() => {
        const l = ver === "bancos" ? bancos : caja;
        return (
          <section className="panel">
            <div className="panel-cab">
              {ver === "bancos" ? `Libro Bancos · ${ctx.mcp.banco_nombre}${ctx.mcp.banco_cuenta ? ` N° ${ctx.mcp.banco_cuenta}` : ""}` : "Libro Caja · ingresos propios"} · {nombrePeriodo(mes)}
            </div>
            <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
              <table className="tabla" style={{ minWidth: 900 }}>
                <thead><tr><th>Fecha</th><th>Documento</th><th>Detalle</th><th className="num">Ingreso S/</th><th className="num">Egreso S/</th><th className="num">Saldo S/</th></tr></thead>
                <tbody>
                  <tr style={{ fontWeight: 600 }}><td colSpan={5}>Saldo anterior</td><td className="num">{soles(l.anterior)}</td></tr>
                  {l.filas.length === 0 && <tr><td colSpan={6} className="tenue">Sin movimientos en el mes.</td></tr>}
                  {l.filas.map((m, i) => (
                    <tr key={i}>
                      <td>{fecha(m.fecha)}</td>
                      <td>{m.documento}</td>
                      <td className="envolver">{m.detalle}</td>
                      <td className="num">{m.entra ? soles(m.entra) : ""}</td>
                      <td className="num">{m.sale ? soles(m.sale) : ""}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{soles(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>Totales del mes · saldo final</td><td className="num">{soles(l.entradas)}</td><td className="num">{soles(l.salidas)}</td><td className="num">{soles(l.final)}</td></tr>
                </tfoot>
              </table>
            </div>
            <div className="panel-cuerpo pequeno tenue">
              {ver === "bancos"
                ? "Ingresos: transferencias registradas en «Datos contables». Egresos: comprobantes de pago aprobados pagados con transferencia, por el líquido (importe menos deducciones)."
                : "Ingresos: recibos de ingresos propios. Egresos: comprobantes de pago aprobados pagados con ingresos propios."}
            </div>
          </section>
        );
      })()}

      {/* ---------------------------------------------- EJECUCIÓN */}
      {ver === "ejecucion" && (
        <>
          <Matriz
            titulo={`Ingresos ${anio}`}
            m={matriz(
              [
                ...d.transferencias.map((t) => ({ k: `Transferencia · ${t.municipalidad}`, f: t.fecha, v: t.monto })),
                ...d.ingresos.map((i) => ({ k: `Ingresos propios · ${nombreRubro(i.rubro)}`, f: i.fecha, v: i.monto })),
              ],
              (x) => x.k,
              (x) => x.f,
              (x) => x.v,
            )}
            mesActual={mesNum}
          />
          <Matriz titulo={`Gastos ${anio} por partida (específica del gasto)`} m={matriz(d.cps, (c) => c.partida, (c) => c.fecha, (c) => c.importe)} mesActual={mesNum} />
          <Matriz titulo={`Gastos ${anio} por función`} m={matriz(d.cps, (c) => c.funcion, (c) => c.fecha, (c) => c.importe)} mesActual={mesNum} />
          <p className="pequeno tenue" style={{ margin: 0 }}>Gastos: comprobantes de pago aprobados o rendidos, por su importe. Ingresos: transferencias registradas y recibos de ingresos propios.</p>
        </>
      )}

      {/* -------------------------------------------- CONCILIACIÓN */}
      {ver === "conciliacion" && (
        <div className="rend-grid">
          <section className="panel">
            <div className="panel-cab">Cheques girados no cobrados al cierre de {nombrePeriodo(mes)} ({transito.length})</div>
            {transito.length === 0 ? (
              <div className="panel-cuerpo tenue">No hay cheques en tránsito.</div>
            ) : (
              <form action={marcarCobrados}>
                <input type="hidden" name="mes" value={mes} />
                <div className="filas" style={{ border: "none", borderRadius: 0 }}>
                  {transito.map((c) => (
                    <label key={c.id} className="cp-sel marcable">
                      <input type="checkbox" name="cp" value={c.id} disabled={!puede} />
                      <div className="f-num" style={{ fontWeight: 700 }}>Ch. {c.cheque}<small style={{ display: "block", fontWeight: 400, color: "var(--tenue)", fontSize: 12 }}>{fecha(c.fecha)}</small></div>
                      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{c.beneficiario}</div><div className="pequeno tenue">{c.codigo} · {c.concepto}</div></div>
                      <div className="c-monto">S/ {soles(c.liquido)}</div>
                      <div className="c-estado"><span className="estado abierta">En tránsito</span></div>
                    </label>
                  ))}
                </div>
                {puede && (
                  <div className="panel-cuerpo" style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="campo">Fecha de cobro (según extracto)<input type="date" name="fecha_cobro" defaultValue={hoyISO()} required /></label>
                    <BotonConfirmar className="btn primario" pregunta="¿Marcar los cheques como cobrados?" detalle="Hágalo cuando el cheque aparezca cobrado en el extracto del banco." textoConfirmar="Sí, marcar">
                      Marcar los cheques seleccionados como cobrados
                    </BotonConfirmar>
                  </div>
                )}
              </form>
            )}
          </section>

          <aside className="rend-cuadro">
            <span className="r-et">Conciliación bancaria</span>
            <dl>
              <dt>Saldo según libro</dt><dd>{soles(bancos.final)}</dd>
              <dt>(+) Cheques en tránsito</dt><dd>{soles(totalTransito)}</dd>
              <dt><b>Saldo conciliado</b></dt><dd><b>{soles(bancos.final + totalTransito)}</b></dd>
              <dt>Saldo según extracto</dt><dd>{extracto ? soles(extracto.saldo_extracto) : "—"}</dd>
              {diferencia !== null && (<><dt>Diferencia</dt><dd style={{ color: diferencia === 0 ? "var(--primario-texto)" : "var(--rojo)" }}>{soles(diferencia)}</dd></>)}
            </dl>
            {diferencia === 0 && <div className="aviso ok" style={{ margin: 0 }}>✓ Conciliado.</div>}
            {diferencia !== null && diferencia !== 0 && (
              <div className="aviso error" style={{ margin: 0 }}>
                No cuadra. Revise: transferencias sin registrar, cheques cobrados sin marcar, comisiones o abonos del banco.
              </div>
            )}
            {puede && (
              <form action={guardarExtracto} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="hidden" name="mes" value={mes} />
                <label className="campo">Saldo del extracto al cierre del mes S/<input name="saldo_extracto" inputMode="decimal" required defaultValue={extracto ? String(extracto.saldo_extracto) : ""} /></label>
                <label className="campo">Observación<input name="observacion" defaultValue={extracto?.observacion ?? ""} placeholder="Opcional" /></label>
                <BotonConfirmar className="btn primario" pregunta="¿Guardar el saldo del extracto?" textoConfirmar="Sí, guardar">Guardar saldo del extracto</BotonConfirmar>
              </form>
            )}
          </aside>
        </div>
      )}

      {/* ------------------------------------------------- DIARIO */}
      {ver === "diario" && (() => {
        const asientos = libroDiario(d, mes);
        const td = asientos.reduce((s, a) => s + a.lineas.reduce((x, l) => x + l.debe, 0), 0);
        const th = asientos.reduce((s, a) => s + a.lineas.reduce((x, l) => x + l.haber, 0), 0);
        return (
          <section className="panel">
            <div className="panel-cab">Libro diario simplificado · {nombrePeriodo(mes)}</div>
            <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
              <table className="tabla" style={{ minWidth: 900 }}>
                <thead><tr><th>N°</th><th>Fecha</th><th>Cuenta</th><th className="num">Debe S/</th><th className="num">Haber S/</th></tr></thead>
                <tbody>
                  {asientos.length === 0 && <tr><td colSpan={5} className="tenue">Sin asientos en el mes.</td></tr>}
                  {asientos.map((a, i) => (
                    <Fragment key={i}>
                      <tr style={{ background: "var(--panel-2)" }}><td style={{ fontWeight: 700 }}>{i + 1}</td><td>{fecha(a.fecha)}</td><td colSpan={3} className="envolver" style={{ fontStyle: "italic" }}>{a.glosa}</td></tr>
                      {a.lineas.map((l, j) => (
                        <tr key={`l${i}-${j}`}>
                          <td></td><td></td>
                          <td style={{ paddingLeft: l.haber ? 36 : 10 }}>{l.cuenta}</td>
                          <td className="num">{l.debe ? soles(l.debe) : ""}</td>
                          <td className="num">{l.haber ? soles(l.haber) : ""}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Totales</td><td className="num">{soles(td)}</td><td className="num">{soles(th)}</td></tr></tfoot>
              </table>
            </div>
            <div className="panel-cuerpo pequeno tenue">
              Asientos referenciales generados automáticamente según el Plan Contable Gubernamental. Revíselos con el contador y ajuste las cuentas si su práctica es otra.
            </div>
          </section>
        );
      })()}

      {/* ------------------------------------------------- DATOS */}
      {ver === "datos" && (
        <div className="dos-columnas">
          <div className="columna">
            <section className="panel">
              <div className="panel-cab">Saldo inicial {anio}</div>
              <form action={guardarSaldoInicial} className="panel-cuerpo">
                <input type="hidden" name="mes" value={mes} />
                <span className="pequeno tenue">Saldos al 1 de enero de {anio} (o al empezar a usar el sistema). Salen del extracto bancario y del arqueo de caja.</span>
                <div className="rejilla-2">
                  <label className="campo">Banco S/<input name="saldo_banco" inputMode="decimal" defaultValue={String(d.saldoBancoInicial)} disabled={!puede} /></label>
                  <label className="campo">Caja (efectivo) S/<input name="saldo_caja" inputMode="decimal" defaultValue={String(d.saldoCajaInicial)} disabled={!puede} /></label>
                </div>
                <label className="campo">Observación<input name="observacion" placeholder="Ej.: según extracto al 31/12" disabled={!puede} /></label>
                {puede && <BotonConfirmar className="btn primario" pregunta="¿Guardar el saldo inicial?" textoConfirmar="Sí, guardar">Guardar saldo inicial</BotonConfirmar>}
              </form>
            </section>
          </div>
          <div className="columna">
            <section className="panel">
              <div className="panel-cab">
                Transferencias recibidas {anio}
                {puede && (
                  <VentanaFlotante boton="+ Registrar transferencia" titulo="Transferencia recibida en la cuenta" accion={registrarTransferencia} textoGuardar="Registrar" claseBoton="btn chico primario">
                    <input type="hidden" name="mes" value={mes} />
                    <div className="rejilla-2">
                      <label className="campo">
                        Municipalidad que transfiere
                        <select name="fuente_id" required defaultValue={sinTransferenciaMes[0]?.id ?? transferencias[0]?.id}>
                          {transferencias.map((f) => (
                            <option key={f.id} value={f.id}>{f.municipalidad}</option>
                          ))}
                        </select>
                      </label>
                      <label className="campo">Mes que corresponde<input type="month" name="periodo" defaultValue={mes} required /></label>
                      <label className="campo">Fecha del abono<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
                      <label className="campo">Monto S/<input name="monto" inputMode="decimal" required defaultValue={String(sinTransferenciaMes[0]?.monto_mensual ?? transferencias[0]?.monto_mensual ?? "")} /></label>
                      <label className="campo">N° de operación<input name="documento" placeholder="Según el extracto" /></label>
                    </div>
                  </VentanaFlotante>
                )}
              </div>
              <div className="filas" style={{ border: "none", borderRadius: 0 }}>
                {d.transferencias.length === 0 && <div className="vacio">Aún no se registran transferencias en {anio}.</div>}
                {d.transferencias.slice().reverse().map((t) => (
                  <div key={t.id} className="fila" style={{ gridTemplateColumns: "100px minmax(0,1fr) auto auto" }}>
                    <div className="f-num">{t.periodo}<small>{fecha(t.fecha)}</small></div>
                    <div className="f-desc"><span className="f-titulo">{t.municipalidad}</span><div className="f-meta">{t.documento ? `Op. ${t.documento}` : "Sin N° de operación"}</div></div>
                    <div className="f-monto">S/ {soles(t.monto)}</div>
                    <div className="f-acc">{puede && <Motivo accion={anularTransferencia} boton="Anular" ayuda="Motivo" campos={{ id: t.id, mes }} />}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Matriz({ titulo, m, mesActual }: { titulo: string; m: ReturnType<typeof matriz>; mesActual: number }) {
  return (
    <section className="panel">
      <div className="panel-cab">{titulo}<span className="tenue pequeno">Total S/ {soles(m.total)}</span></div>
      <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
        <table className="tabla matriz" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              <th>Concepto</th>
              {MESES_CORTOS.map((x, i) => <th key={x} className={`num${i === mesActual ? " mes-actual" : ""}`}>{x}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {m.filas.length === 0 && <tr><td colSpan={14} className="tenue">Sin movimientos.</td></tr>}
            {m.filas.map((f) => (
              <tr key={f.nombre}>
                <td className="envolver" style={{ minWidth: 220 }}>{f.nombre}</td>
                {f.meses.map((v, i) => <td key={i} className={`num${i === mesActual ? " mes-actual" : ""}`}>{v ? soles(v) : "—"}</td>)}
                <td className="num" style={{ fontWeight: 700 }}>{soles(f.total)}</td>
              </tr>
            ))}
          </tbody>
          {m.filas.length > 0 && (
            <tfoot>
              <tr>
                <td>Total</td>
                {m.totales.map((v, i) => <td key={i} className={`num${i === mesActual ? " mes-actual" : ""}`}>{v ? soles(v) : "—"}</td>)}
                <td className="num">{soles(m.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
