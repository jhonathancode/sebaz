import Link from "next/link";
import Estado from "@/components/Estado";
import { FUNCIONES } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, nombrePeriodo, num3, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

function saludo() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function Inicio() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = periodoActual();
  const { desde, hasta } = rangoPeriodo(periodo);
  const mcpId = ctx.mcp.id;

  const [{ data: cps }, { count: reqPorAprobar }, { data: rendiciones }, { data: cajas }, { data: ingresos }, { data: recientesExp }, { data: recientesCp }] =
    await Promise.all([
      supabase.from("comprobantes_pago").select("estado, cheque, importe, fuente_id, fecha, funcion").eq("mcp_id", mcpId).in("estado", ["borrador", "aprobado", "rendido"]).lte("fecha", hasta),
      supabase.from("expedientes").select("id", { count: "exact", head: true }).eq("mcp_id", mcpId).eq("estado", "borrador"),
      supabase.from("rendiciones").select("id, fuente_id, estado, numero, anio").eq("mcp_id", mcpId).eq("periodo", periodo).neq("estado", "anulada"),
      supabase.from("cajas_chicas").select("id, monto_fondo, estado, caja_chica_gastos(monto, anulado)").eq("mcp_id", mcpId).eq("periodo", periodo).neq("estado", "anulada"),
      supabase.from("ingresos").select("monto").eq("mcp_id", mcpId).eq("estado", "emitido").gte("fecha", desde).lte("fecha", hasta),
      supabase.from("expedientes").select("id, numero, anio, fecha, descripcion, estado, creado_en").eq("mcp_id", mcpId).order("creado_en", { ascending: false }).limit(5),
      supabase.from("comprobantes_pago").select("id, numero, origen, fecha, beneficiario, importe, estado, creado_en").eq("mcp_id", mcpId).order("creado_en", { ascending: false }).limit(5),
    ]);

  const lista = cps ?? [];
  const cpPorAprobar = lista.filter((c) => c.estado === "borrador").length;
  const cpSinCheque = lista.filter((c) => c.estado === "aprobado" && !c.cheque).length;
  const totalIngresos = (ingresos ?? []).reduce((s, i) => s + Number(i.monto), 0);
  const caja = (cajas ?? [])[0];
  const gastadoCaja = caja
    ? (caja.caja_chica_gastos as { monto: number; anulado: boolean }[]).filter((g) => !g.anulado).reduce((s, g) => s + Number(g.monto), 0)
    : 0;
  const alcalde = tiene(ctx, "alcalde");

  // Gastos del mes por función (para el informe de Chanchamayo)
  const delMes = lista.filter((c) => c.fecha >= desde);
  const porFuncion = FUNCIONES.map((f) => ({
    nombre: f.funcion,
    total: delMes.filter((c) => c.funcion === f.funcion).reduce((s, c) => s + Number(c.importe), 0),
  }));
  const sinFuncion = delMes.filter((c) => !c.funcion).reduce((s, c) => s + Number(c.importe), 0);
  if (sinFuncion) porFuncion.push({ nombre: "Sin función asignada", total: sinFuncion });
  const conGasto = porFuncion.filter((f) => f.total > 0);
  const maxFuncion = Math.max(1, ...conGasto.map((f) => f.total));

  const recientes = [
    ...(recientesExp ?? []).map((x) => ({
      href: `/expedientes/${x.id}`,
      doc: `Expediente ${num3(x.numero)}-${x.anio}`,
      detalle: x.descripcion,
      monto: null as number | null,
      estado: x.estado,
      fecha: x.fecha,
      en: x.creado_en,
    })),
    ...(recientesCp ?? []).map((x) => ({
      href: `/comprobantes/${x.id}`,
      doc: codigoCP(x.numero, x.origen),
      detalle: x.beneficiario,
      monto: Number(x.importe),
      estado: x.estado,
      fecha: x.fecha,
      en: x.creado_en,
    })),
  ]
    .sort((a, b) => b.en.localeCompare(a.en))
    .slice(0, 6);

  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const diasRestantes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate();
  const faltaConfigurar = !ctx.mcp.ruc || !Object.values(ctx.mcp.capitulo1 ?? {}).some(Boolean);
  const nombreCorto = ctx.nombre.split(/\s+/)[0];

  const pendientes = [
    { n: reqPorAprobar ?? 0, t: "Requerimientos por aprobar", d: alcalde ? "Esperan su aprobación" : "Esperan la aprobación del alcalde", href: "/expedientes?estado=borrador" },
    { n: cpPorAprobar, t: "Comprobantes de pago por aprobar", d: "Están en borrador", href: "/comprobantes?estado=borrador" },
    { n: cpSinCheque, t: "Comprobantes sin cheque", d: "Sin cheque no entran en la rendición", href: "/comprobantes?estado=aprobado" },
  ];

  return (
    <>
      <section className="saludo">
        <div>
          <h1>{saludo()}, {nombreCorto}</h1>
          <div className="tenue">
            {nombrePeriodo(periodo).replace(/^./, (c) => c.toUpperCase())} · {diasRestantes === 0 ? "hoy cierra el mes" : `faltan ${diasRestantes} días para cerrar el mes`}
          </div>
        </div>
        <span className="espacio" />
        <div className="accesos">
          <Link className="btn primario" href="/expedientes?nuevo=1">Nuevo requerimiento</Link>
          <Link className="btn" href="/rendicion">Armar rendición</Link>
        </div>
      </section>

      {faltaConfigurar && tiene(ctx, "admin") && (
        <div className="aviso info">
          Faltan datos de la MCP (RUC o capítulo I del informe). <Link href="/configuracion">Completar en Configuración</Link>
        </div>
      )}

      <section aria-label="Rendición del mes">
        <h2 style={{ marginBottom: 10 }}>Rendición del mes</h2>
        <div className="rejilla-2">
          {ctx.fuentes.map((f) => {
            const deLaFuente = lista.filter((c) => c.fuente_id === f.id && c.estado !== "rendido");
            const listo = deLaFuente.filter((c) => c.estado === "aprobado" && c.cheque).reduce((s, c) => s + Number(c.importe), 0);
            const tramite = deLaFuente.filter((c) => !(c.estado === "aprobado" && c.cheque)).reduce((s, c) => s + Number(c.importe), 0);
            const transferencia = Number(f.monto_mensual);
            const base = Math.max(transferencia, listo + tramite, 1);
            const falta = Math.max(0, transferencia - listo - tramite);
            const rendicion = (rendiciones ?? []).find((r) => r.fuente_id === f.id);
            return (
              <Link key={f.id} className="tarjeta" href={`/rendicion?fuente=${f.id}`} style={{ gap: 10 }}>
                <div className="tarjeta-cab">
                  <span className="etiqueta">{f.tipo === "distrito" ? "Distrito" : "Provincia"} · {f.municipalidad}</span>
                  {rendicion && <Estado valor={rendicion.estado} />}
                </div>
                {rendicion ? (
                  <>
                    <span className="valor">Rendición {String(rendicion.numero).padStart(3, "0")}-{rendicion.anio}</span>
                    <span className="detalle">Ya generada. Ábrala para imprimir el informe.</span>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span className="valor">S/ {soles(listo)}</span>
                      <span className="detalle">listo de S/ {soles(transferencia)}</span>
                    </div>
                    <div className="apilada" role="img" aria-label={`Listo ${soles(listo)}, en trámite ${soles(tramite)}, por cubrir ${soles(falta)}`}>
                      {listo > 0 && <div className="listo" style={{ width: `${(listo / base) * 100}%` }} title={`Listo: S/ ${soles(listo)}`} />}
                      {tramite > 0 && <div className="tramite" style={{ width: `${(tramite / base) * 100}%` }} title={`En trámite: S/ ${soles(tramite)}`} />}
                    </div>
                    <div className="leyenda">
                      <span><i style={{ background: "var(--verde)" }} />Listo <b>{soles(listo)}</b></span>
                      <span><i style={{ background: "var(--verde-claro)" }} />En trámite <b>{soles(tramite)}</b></span>
                      <span><i style={{ background: "var(--pista)", border: "1px solid var(--borde)" }} />Por cubrir <b>{soles(falta)}</b></span>
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="rejilla-2" style={{ alignItems: "start" }}>
        <section className="panel" aria-label="Pendientes">
          <div className="panel-cab">Pendientes</div>
          <ul className="pendientes">
            {pendientes.map((p) => (
              <li key={p.t}>
                <Link href={p.href}>
                  <span className={`cuenta ${p.n > 0 ? "alerta" : "ok"}`}>{p.n}</span>
                  <span className="texto">{p.t}<small>{p.d}</small></span>
                  <span className="flecha" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/caja-chica">
                <span className={`cuenta ${caja ? "ok" : "alerta"}`}>{caja ? "✓" : "!"}</span>
                <span className="texto">
                  Caja chica
                  <small>{caja ? `Saldo S/ ${soles(Number(caja.monto_fondo) - gastadoCaja)} de S/ ${soles(caja.monto_fondo)}` : "Aún no se abre el fondo del mes"}</small>
                </span>
                <span className="flecha" aria-hidden="true">›</span>
              </Link>
            </li>
            <li>
              <Link href="/ingresos">
                <span className="cuenta ok">{(ingresos ?? []).length}</span>
                <span className="texto">Ingresos propios del mes<small>S/ {soles(totalIngresos)} en recibos emitidos</small></span>
                <span className="flecha" aria-hidden="true">›</span>
              </Link>
            </li>
          </ul>
        </section>

        <section className="panel" aria-label="Gastos del mes por función">
          <div className="panel-cab">
            Gastos del mes por función
            <span className="tenue pequeno">S/ {soles(delMes.reduce((s, c) => s + Number(c.importe), 0))}</span>
          </div>
          <div className="panel-cuerpo">
            {conGasto.length === 0 ? (
              <span className="tenue">Aún no hay comprobantes de pago este mes.</span>
            ) : (
              <div className="barras">
                {conGasto.map((f) => (
                  <div key={f.nombre} className="fila" title={`${f.nombre}: S/ ${soles(f.total)}`}>
                    <span className={f.nombre.startsWith("Sin función") ? "falta" : undefined}>{f.nombre}</span>
                    <span className="monto">{soles(f.total)}</span>
                    <div className="pista" aria-hidden="true">
                      <div style={{ width: `${(f.total / maxFuncion) * 100}%`, background: f.nombre.startsWith("Sin función") ? "var(--ambar-borde)" : undefined }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel" aria-label="Movimientos recientes">
        <div className="panel-cab">Movimientos recientes</div>
        <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
          <table className="tabla" style={{ minWidth: 640 }}>
            <tbody>
              {recientes.length === 0 && <tr><td className="tenue">Todavía no hay movimientos. Empiece con un nuevo requerimiento.</td></tr>}
              {recientes.map((r) => (
                <tr key={r.href}>
                  <td><Link href={r.href}>{r.doc}</Link></td>
                  <td>{fecha(r.fecha)}</td>
                  <td className="envolver">{r.detalle}</td>
                  <td className="num">{r.monto !== null ? `S/ ${soles(r.monto)}` : ""}</td>
                  <td><Estado valor={r.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
