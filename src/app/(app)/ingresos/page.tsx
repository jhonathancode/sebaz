import Link from "next/link";
import BotonPdf from "@/components/BotonPdf";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import VentanaFlotante from "@/components/VentanaFlotante";
import { RUBROS_INGRESO } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, hoyISO, nombrePeriodo, periodoActual, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { emitirRecibo } from "./acciones";

const RUBRO = Object.fromEntries(RUBROS_INGRESO.map((r) => [r.codigo, r.nombre]));

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const DOS = (n: number) => String(n).padStart(2, "0");

/** Semanas del mes (lunes a domingo, recortadas al mes): [[1,3],[4,10],…] */
function semanasDelMes(periodo: string) {
  const [a, m] = periodo.split("-").map(Number);
  const ult = new Date(a, m, 0).getDate();
  const out: [number, number][] = [];
  let ini = 1;
  while (ini <= ult) {
    const dow = new Date(a, m - 1, ini).getDay();
    const fin = Math.min(ult, ini + ((7 - dow) % 7));
    out.push([ini, fin]);
    ini = fin + 1;
  }
  return out;
}

export default async function Ingresos({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  // Sin mes elegido se ve el resumen del año (inicio)
  const vista = sp.vista === "mes" || (sp.mes && sp.vista !== "anio") ? "mes" : "anio";
  const periodo = sp.mes ?? periodoActual();
  const anio = periodo.slice(0, 4);
  const mesNum = periodo.slice(5, 7);
  const hoyPeriodo = periodoActual();
  const ultDia = new Date(Number(anio), Number(mesNum), 0).getDate();
  const semanas = semanasDelMes(periodo);

  // Rango dentro del mes: todo el mes, quincenas, semanas o un día
  const rango = sp.rango ?? "mes";
  let desde = `${periodo}-01`;
  let hasta = `${periodo}-${DOS(ultDia)}`;
  let etiqueta = `mes de ${nombrePeriodo(periodo)}`;
  if (rango === "q1") {
    hasta = `${periodo}-15`;
    etiqueta = `1.ª quincena de ${nombrePeriodo(periodo)}`;
  } else if (rango === "q2") {
    desde = `${periodo}-16`;
    etiqueta = `2.ª quincena de ${nombrePeriodo(periodo)}`;
  } else if (/^s[1-6]$/.test(rango) && semanas[Number(rango.slice(1)) - 1]) {
    const [i, f] = semanas[Number(rango.slice(1)) - 1];
    desde = `${periodo}-${DOS(i)}`;
    hasta = `${periodo}-${DOS(f)}`;
    etiqueta = `semana del ${i} al ${f} de ${nombrePeriodo(periodo)}`;
  } else if (rango === "d" && sp.dia?.startsWith(periodo)) {
    desde = hasta = sp.dia;
    etiqueta = `día ${fecha(sp.dia)}`;
  }

  const propios = ctx.fuentes.find((f) => f.tipo === "propios");
  const [{ data: delAnio }, { data: ultimo }, { data: pagosAnio }] = await Promise.all([
    supabase.from("ingresos").select("*").eq("mcp_id", ctx.mcp.id).gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`).order("numero", { ascending: false }),
    supabase.from("ingresos").select("numero, anio").eq("mcp_id", ctx.mcp.id).order("anio", { ascending: false }).order("numero", { ascending: false }).limit(1).maybeSingle(),
    propios
      ? supabase.from("comprobantes_pago").select("fecha, importe").eq("mcp_id", ctx.mcp.id).eq("fuente_id", propios.id).neq("estado", "anulado").gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`)
      : Promise.resolve({ data: [] as { fecha: string; importe: number }[] }),
  ]);

  // Resumen de cada mes del año: lo cobrado, lo pagado con ingresos propios y lo que queda en caja
  const resumen = MES_CORTO.map((_, i) => {
    const per = `${anio}-${DOS(i + 1)}`;
    const rec = (delAnio ?? []).filter((r) => r.fecha.startsWith(per) && r.estado !== "anulado");
    const ingreso = rec.reduce((t, r) => t + Number(r.monto), 0);
    const gasto = (pagosAnio ?? []).filter((c) => c.fecha.startsWith(per)).reduce((t, c) => t + Number(c.importe), 0);
    return { per, n: rec.length, ingreso, gasto };
  });
  let acumulado = 0;
  const filasResumen = resumen.map((r) => {
    acumulado += r.ingreso - r.gasto;
    return { ...r, saldo: r.ingreso - r.gasto, caja: acumulado };
  });
  const totalAnio = resumen.reduce((t, r) => t + r.ingreso, 0);
  const gastoAnio = resumen.reduce((t, r) => t + r.gasto, 0);
  const nAnio = resumen.reduce((t, r) => t + r.n, 0);
  const cajaMes = filasResumen.find((r) => r.per === periodo)?.caja ?? 0;
  const enlace = (c: Record<string, string>) => `/ingresos?${new URLSearchParams(c).toString()}`;

  const delMes = (delAnio ?? []).filter((f) => f.fecha >= desde && f.fecha <= hasta);
  const vigentes = delMes.filter((f) => f.estado !== "anulado");
  const total = vigentes.reduce((s, f) => s + Number(f.monto), 0);
  const anulados = delMes.length - vigentes.length;
  const porRubro = RUBROS_INGRESO.map((r) => ({
    ...r,
    total: vigentes.filter((f) => f.rubro === r.codigo).reduce((s, f) => s + Number(f.monto), 0),
    n: vigentes.filter((f) => f.rubro === r.codigo).length,
  })).filter((r) => r.n > 0);
  const maximo = Math.max(1, ...porRubro.map((r) => r.total));

  const q = (sp.q ?? "").toLowerCase();
  const filas = delMes.filter(
    (f) =>
      (!sp.rubro || f.rubro === sp.rubro) &&
      (!sp.estado || f.estado === sp.estado) &&
      (!q || `${f.pagador_nombre} ${f.concepto} ${f.pagador_doc ?? ""} ${f.numero}`.toLowerCase().includes(q)),
  );
  const siguiente = ultimo ? (ultimo.anio === Number(periodo.slice(0, 4)) ? ultimo.numero + 1 : 1) : 1;
  const puede = tiene(ctx, "admin", "tesorero", "contador");

  return (
    <>
      <div className="titulo-ventana">
        <h1>Ingresos propios · {vista === "anio" ? `resumen ${anio}` : etiqueta}</h1>
        <span className="espacio" />
        {vista === "anio" && <a className="btn contorno" href={`/exportar/ingresos-anio?mes=${periodo}`}>Descargar Excel</a>}
        {vista === "anio" && <BotonPdf nombre={`Ingresos propios ${anio}`} selector=".cc-excel-marco" texto="Descargar PDF" className="btn contorno" horizontal />}
        {vista === "mes" && <BotonPdf nombre={`Ingresos propios ${etiqueta}`} selector=".cc-excel-marco" texto="Descargar PDF" className="btn contorno" horizontal />}
        {puede && (
          <VentanaFlotante boton="Nuevo recibo de ingreso" titulo={`Nuevo recibo de ingreso · N° ${String(siguiente).padStart(4, "0")}`} accion={emitirRecibo} textoGuardar="Emitir recibo" abierta={sp.nuevo === "1"} error={sp.nuevo === "1" ? sp.error : undefined}>
            <div className="rejilla">
              <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
              <label className="campo">
                Rubro
                <select name="rubro" defaultValue="servicio">
                  {RUBROS_INGRESO.map((r) => (
                    <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="campo">DNI o RUC del pagador<input name="pagador_doc" inputMode="numeric" maxLength={11} placeholder="8 u 11 dígitos" /></label>
              <label className="campo">Nombre o razón social<input name="pagador_nombre" required /></label>
              <label className="campo ancho">Concepto<input name="concepto" required placeholder="Tipeo, copias e impresión de documentos" /></label>
              <label className="campo">Monto S/<input name="monto" required inputMode="decimal" placeholder="0.00" /></label>
            </div>
            <p className="pequeno tenue" style={{ margin: 0 }}>
              El número lo pone el sistema. Un recibo emitido no se edita: si hay un error, se anula con motivo y se emite otro.
            </p>
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <section className="cc-selector" aria-label="Elegir el período">
        <div className="cc-fila">
          <Link className={`cc-caja${vista === "anio" ? " activa" : ""}`} href={enlace({ vista: "anio", mes: `${anio}-${mesNum}` })}>Resumen del año</Link>
          <div className="cc-anio">
            <Link className="cc-flecha" href={enlace({ vista, mes: `${Number(anio) - 1}-${mesNum}` })} aria-label={`Año ${Number(anio) - 1}`}>‹</Link>
            <b>{anio}</b>
            <Link className="cc-flecha" href={enlace({ vista, mes: `${Number(anio) + 1}-${mesNum}` })} aria-label={`Año ${Number(anio) + 1}`}>›</Link>
          </div>
          <div className="cc-meses" role="group" aria-label="Meses del año">
            {MES_CORTO.map((nombre, i) => {
              const per = `${anio}-${DOS(i + 1)}`;
              const r = resumen[i];
              const clase = `cc-mes${vista === "mes" && per === periodo ? " sel" : ""}${r.n ? " liq" : " vacia"}${per === hoyPeriodo ? " hoy" : ""}`;
              return (
                <Link key={per} href={enlace({ vista: "mes", mes: per })} className={clase} title={`${nombrePeriodo(per)} · ${r.n} recibo(s) · S/ ${soles(r.ingreso)}`}>
                  <span className="cc-mes-n">{nombre}</span>
                  <span className="cc-mes-d">{r.n ? `S/ ${soles(r.ingreso)}` : "—"}</span>
                </Link>
              );
            })}
          </div>
        </div>
        {vista === "mes" && (
          <div className="cc-fila">
            <span className="tenue pequeno">Ver:</span>
            <Link className={`cc-caja${rango === "mes" ? " activa" : ""}`} href={enlace({ vista: "mes", mes: periodo })}>Todo el mes</Link>
            <Link className={`cc-caja${rango === "q1" ? " activa" : ""}`} href={enlace({ vista: "mes", mes: periodo, rango: "q1" })}>1.ª quincena (1–15)</Link>
            <Link className={`cc-caja${rango === "q2" ? " activa" : ""}`} href={enlace({ vista: "mes", mes: periodo, rango: "q2" })}>2.ª quincena (16–{ultDia})</Link>
            {semanas.map(([i, f], k) => (
              <Link key={k} className={`cc-caja${rango === `s${k + 1}` ? " activa" : ""}`} href={enlace({ vista: "mes", mes: periodo, rango: `s${k + 1}` })}>
                Semana {k + 1} ({i}–{f})
              </Link>
            ))}
            <form method="get" className="cc-dia">
              <input type="hidden" name="vista" value="mes" />
              <input type="hidden" name="mes" value={periodo} />
              <input type="hidden" name="rango" value="d" />
              <input type="date" name="dia" min={`${periodo}-01`} max={`${periodo}-${DOS(ultDia)}`} defaultValue={rango === "d" ? sp.dia : ""} required aria-label="Ver un día" />
              <button className="btn chico contorno" type="submit">Ver día</button>
            </form>
          </div>
        )}
      </section>

      {vista === "anio" ? (
        <>
          <div className="tarjetas">
            <div className="tarjeta">
              <span className="etiqueta">Recaudado en {anio}</span>
              <span className="valor">S/ {soles(totalAnio)}</span>
              <span className="detalle">{nAnio} recibo(s) vigentes</span>
            </div>
            <div className="tarjeta">
              <span className="etiqueta">Gastado con ingresos propios</span>
              <span className="valor">S/ {soles(gastoAnio)}</span>
              <span className="detalle">Comprobantes de pago no anulados</span>
            </div>
            <div className="tarjeta">
              <span className="etiqueta">En caja de ingresos</span>
              <span className="valor">S/ {soles(totalAnio - gastoAnio)}</span>
              <span className="detalle">Recaudado menos gastado en {anio}</span>
            </div>
            <div className="tarjeta">
              <span className="etiqueta">Siguiente recibo</span>
              <span className="valor">N° {String(siguiente).padStart(4, "0")}</span>
              <span className="detalle">{ultimo ? `Último emitido: ${String(ultimo.numero).padStart(4, "0")}-${ultimo.anio}` : "Aún no hay recibos"}</span>
            </div>
          </div>
          <div className="cc-excel-marco">
            <table className="cc-excel">
              <caption>Ingresos propios {anio} · resumen por mes</caption>
              <thead>
                <tr><th>Mes</th><th>Recibos</th><th>Recaudado</th><th>Gastado</th><th>Saldo del mes</th><th>En caja (acumulado)</th><th className="cc-acc-th"><span className="sr-solo">Ver</span></th></tr>
              </thead>
              <tbody>
                {filasResumen.map((r, i) => (
                  <tr key={r.per} className={!r.n && !r.gasto ? "anulada" : undefined}>
                    <td><b>{nombrePeriodo(r.per)}</b></td>
                    <td className="c">{r.n || "—"}</td>
                    <td className="m">{r.n ? `S/ ${soles(r.ingreso)}` : "—"}</td>
                    <td className="m">{r.gasto ? `S/ ${soles(r.gasto)}` : "—"}</td>
                    <td className="m">{r.n || r.gasto ? `S/ ${soles(r.saldo)}` : "—"}</td>
                    <td className="m"><b>S/ {soles(r.caja)}</b></td>
                    <td className="acc"><Link className="btn chico contorno" href={enlace({ vista: "mes", mes: r.per })}>{MES_CORTO[i]} · Ver</Link></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="m">Total {anio}</td>
                  <td className="c">{nAnio}</td>
                  <td className="m">S/ {soles(totalAnio)}</td>
                  <td className="m">S/ {soles(gastoAnio)}</td>
                  <td className="m">S/ {soles(totalAnio - gastoAnio)}</td>
                  <td className="m">S/ {soles(totalAnio - gastoAnio)}</td>
                  <td className="acc"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="pequeno tenue">El saldo en caja se cuenta desde enero de {anio}: recaudado menos lo pagado con ingresos propios.</p>
        </>
      ) : (
        <>
      <div className="tarjetas">
        <div className="tarjeta">
          <span className="etiqueta">Total del período</span>
          <span className="valor">S/ {soles(total)}</span>
          <span className="detalle">{etiqueta}</span>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">Recibos emitidos</span>
          <span className="valor">{vigentes.length}</span>
          <span className="detalle">{anulados ? `${anulados} anulado(s) con motivo` : "Ninguno anulado"}</span>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">En caja de ingresos</span>
          <span className="valor">S/ {soles(cajaMes)}</span>
          <span className="detalle">Acumulado hasta fin de {nombrePeriodo(periodo)}</span>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">Siguiente recibo</span>
          <span className="valor">N° {String(siguiente).padStart(4, "0")}</span>
          <span className="detalle">{ultimo ? `Último emitido: ${String(ultimo.numero).padStart(4, "0")}-${ultimo.anio}` : "Aún no hay recibos"}</span>
        </div>
      </div>

      <div className="columnas">
        <div className="principal">
          <form className="barra" method="get">
            <input type="hidden" name="vista" value="mes" />
            <input type="hidden" name="mes" value={periodo} />
            <input type="hidden" name="rango" value={rango} />
            {rango === "d" && <input type="hidden" name="dia" value={sp.dia ?? ""} />}
            <label className="campo">
              Rubro
              <select name="rubro" defaultValue={sp.rubro ?? ""}>
                <option value="">Todos</option>
                {RUBROS_INGRESO.map((r) => (
                  <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              Estado
              <select name="estado" defaultValue={sp.estado ?? ""}>
                <option value="">Todos</option>
                <option value="emitido">Emitidos</option>
                <option value="anulado">Anulados</option>
              </select>
            </label>
            <label className="campo" style={{ flex: "1 1 180px" }}>Buscar<input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, DNI, concepto o N°" /></label>
            <button className="btn" type="submit">Filtrar</button>
            <a className="btn contorno" href={`/exportar/ingresos?mes=${periodo}&desde=${desde}&hasta=${hasta}&estado=${sp.estado ?? ""}&rubro=${sp.rubro ?? ""}&q=${encodeURIComponent(sp.q ?? "")}`}>Descargar Excel</a>
          </form>

          <div className="cc-excel-marco">
            <table className="cc-excel">
              <caption>Ingresos propios {etiqueta}</caption>
              <thead>
                <tr><th>N° recibo</th><th>Fecha</th><th>Rubro</th><th>Pagador</th><th>Concepto</th><th>Estado</th><th>Monto</th><th className="cc-acc-th"><span className="sr-solo">Acciones</span></th></tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr><td colSpan={9} className="cc-vacio">{delMes.length ? "Ningún recibo coincide con el filtro." : "No hay recibos este mes."}</td></tr>
                )}
                {filas.map((r) => (
                  <tr key={r.id} className={r.estado === "anulado" ? "anulado" : undefined}>
                    <td className="c"><b>{String(r.numero).padStart(4, "0")}</b></td>
                    <td className="c">{fecha(r.fecha)}</td>
                    <td>{RUBRO[r.rubro]}</td>
                    <td>
                      {r.pagador_nombre}
                      {r.pagador_doc && <div className="pequeno tenue">{r.pagador_doc}</div>}
                    </td>
                    <td className="tachar">
                      {r.concepto}
                      {r.estado === "anulado" && <div className="pequeno">Motivo: {r.anulado_motivo}</div>}
                    </td>
                    <td className="c"><Estado valor={r.estado} /></td>
                    <td className="m tachar">S/ {soles(r.monto)}</td>
                    <td className="acc"><div className="acciones-fila"><Link className="btn chico contorno" href={`/ingresos/${r.id}`}>Ver recibo</Link></div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={6} className="m">Total vigente mostrado</td><td className="m">S/ {soles(filas.filter((f) => f.estado !== "anulado").reduce((s, f) => s + Number(f.monto), 0))}</td><td className="acc"></td></tr>
              </tfoot>
            </table>
          </div>
        </div>

        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">Por rubro</div>
            <div className="panel-cuerpo">
              {porRubro.length === 0 && <span className="tenue">Sin ingresos este mes.</span>}
              <div className="barras">
                {porRubro.map((r) => (
                  <div key={r.codigo} className="fila" title={`${r.nombre}: S/ ${soles(r.total)} en ${r.n} recibo(s)`}>
                    <span>{r.nombre} <span className="tenue pequeno">· {r.n}</span></span>
                    <span className="monto">{soles(r.total)}</span>
                    <div className="pista" aria-hidden="true"><div style={{ width: `${(r.total / maximo) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-cab">En la rendición</div>
            <div className="panel-cuerpo">
              <ul className="lista-reglas">
                <li>A Perené salen como recursos directamente recaudados (capítulo II, 2.2).</li>
                <li>A Chanchamayo salen por rubro: venta de bienes, servicios, alquileres y otros.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
        </>
      )}
    </>
  );
}
