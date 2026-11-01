import Link from "next/link";
import { Suspense } from "react";
import BotonAbrirRequerimiento from "@/components/BotonAbrirRequerimiento";
import NuevoRequerimientoInicio from "@/components/NuevoRequerimientoInicio";
import BotonConfirmar from "@/components/BotonConfirmar";
import Estado from "@/components/Estado";
import CurvaIngresos from "@/components/CurvaIngresos";
import { contextoMcp, tiene } from "@/lib/contexto";
import {
  codigoCP,
  diasHasta,
  fechaLarga,
  fechaLimite,
  nombrePeriodo,
  num3,
  periodoActual,
  periodoAnterior,
  rangoPeriodo,
  soles,
} from "@/lib/formato";
import { tieneModulo } from "@/lib/modulos";
import { cargarCatalogoPagosFijos, estadoPagosFijos } from "@/lib/pagosFijos";
import { supabaseServidor } from "@/lib/supabase/server";
import { copiarPagosFijos } from "../expedientes/acciones";
import { etiquetaFuente, montoDelMes } from "@/lib/fuentes";

function saludo() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

const mayus = (t: string) => t.replace(/^./, (c) => c.toUpperCase());

/** "faltan 5 días", "vence hoy", "venció hace 3 días" */
function cuentaRegresiva(dias: number) {
  if (dias > 1) return `faltan ${dias} días`;
  if (dias === 1) return "vence mañana";
  if (dias === 0) return "vence hoy";
  return `venció hace ${-dias} día${dias === -1 ? "" : "s"}`;
}

const NOMBRE_FASE: Record<string, string> = {
  requerimiento: "Requerimiento",
  cotizacion: "Cuadro comparativo",
  orden: "Orden",
  conformidad: "Memorando de conformidad",
  comprobante: "Comprobante de pago",
};

export default async function Inicio() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = periodoActual();
  const anterior = periodoAnterior(periodo);
  const { desde, hasta } = rangoPeriodo(periodo);
  const mcpId = ctx.mcp.id;

  const [
    { data: cps },
    { count: reqPorAprobar },
    { data: rendiciones },
    { data: cajas },
    { data: ultimosExp },
    { data: ultimosCp },
    fijos,
  ] = await Promise.all([
    supabase.from("comprobantes_pago").select("id, estado, cheque, importe, fuente_id, fecha, funcion").eq("mcp_id", mcpId).in("estado", ["borrador", "aprobado", "rendido"]).lte("fecha", hasta),
    supabase.from("expedientes").select("id", { count: "exact", head: true }).eq("mcp_id", mcpId).eq("estado", "borrador"),
    supabase.from("rendiciones").select("id, fuente_id, estado, numero, anio, periodo").eq("mcp_id", mcpId).in("periodo", [periodo, anterior]).neq("estado", "anulada"),
    supabase.from("cajas_chicas").select("id, monto_fondo, estado, numero_cheque, caja_chica_gastos(monto, anulado, sustento_tipo)").eq("mcp_id", mcpId).eq("periodo", periodo).neq("estado", "anulada"),
    supabase.from("expedientes").select("id, numero, anio, fecha, descripcion, estado, fase").eq("mcp_id", mcpId).neq("estado", "anulado").order("creado_en", { ascending: false }).limit(6),
    supabase.from("comprobantes_pago").select("id, numero, origen, fecha, concepto, importe, estado, creado_en").eq("mcp_id", mcpId).neq("origen", "expediente").neq("estado", "anulado").order("creado_en", { ascending: false }).limit(3),
    estadoPagosFijos(supabase, mcpId, periodo),
  ]);
  const catalogo = await cargarCatalogoPagosFijos(supabase, mcpId);
  const faltanCatalogo = catalogo.filter((p) => !p.pagados.includes(periodo));
  const lista = cps ?? [];
  const transferencias = ctx.fuentes.filter((f) => f.tipo !== "propios");
  const cpPorAprobar = lista.filter((c) => c.estado === "borrador").length;
  const cpSinCheque = lista.filter((c) => c.estado === "aprobado" && !c.cheque).length;
  const gastadoCaja = (cajas ?? []).reduce(
    (t, c) => t + (c.caja_chica_gastos as { monto: number; anulado: boolean }[]).filter((g) => !g.anulado).reduce((s, g) => s + Number(g.monto), 0),
    0,
  );
  const delMes = lista.filter((c) => c.fecha >= desde);
  const rendicionDe = (fuente: string, p: string) => (rendiciones ?? []).find((r) => r.fuente_id === fuente && r.periodo === p);

  // ---- 2. Cuánto le falta sustentar de cada transferencia
  const tarjetas = transferencias.map((f) => {
    const deLaFuente = lista.filter((c) => c.fuente_id === f.id && c.estado !== "rendido");
    const listo = deLaFuente.filter((c) => c.estado === "aprobado" && c.cheque).reduce((s, c) => s + Number(c.importe), 0);
    const tramite = deLaFuente.filter((c) => !(c.estado === "aprobado" && c.cheque)).reduce((s, c) => s + Number(c.importe), 0);
    const transferencia = montoDelMes(f, periodo);
    const falta = Math.round((transferencia - listo - tramite) * 100) / 100;
    const limite = fechaLimite(periodo, f.dia_limite);
    return { f, listo, tramite, transferencia, falta, limite, dias: diasHasta(limite), rendicion: rendicionDe(f.id, periodo) };
  }).filter((t) => t.transferencia > 0 || t.listo + t.tramite > 0 || t.rendicion);

  // ---- 4. El mes en 3 pasos
  const totalFalta = tarjetas.reduce((s, t) => s + Math.max(0, t.falta), 0);
  const rendidas = tarjetas.filter((t) => t.rendicion).length;
  const pasos = [
    {
      titulo: "Registre los gastos",
      hecho: tarjetas.length > 0 && tarjetas.every((t) => t.falta <= 0 || t.rendicion),
      detalle: totalFalta > 0 ? `Faltan sustentar S/ ${soles(totalFalta)}` : "Todo lo transferido está sustentado",
      href: "/expedientes?nuevo=1",
      accion: "Nuevo requerimiento",
    },
    {
      titulo: "Apruebe y ponga los cheques",
      hecho: delMes.length > 0 && cpPorAprobar === 0 && cpSinCheque === 0,
      detalle:
        cpPorAprobar + cpSinCheque > 0
          ? [cpPorAprobar && `${cpPorAprobar} por aprobar`, cpSinCheque && `${cpSinCheque} sin cheque`].filter(Boolean).join(" · ")
          : delMes.length > 0
            ? "Todos los comprobantes tienen cheque"
            : "Aún no hay comprobantes este mes",
      href: cpPorAprobar ? "/comprobantes?estado=borrador" : "/comprobantes?estado=aprobado",
      accion: "Ver comprobantes",
    },
    {
      titulo: "Arme la rendición",
      hecho: tarjetas.length > 0 && rendidas === tarjetas.length,
      detalle: `${rendidas} de ${tarjetas.length} generada${tarjetas.length === 1 ? "" : "s"}`,
      href: "/rendicion",
      accion: "Armar rendición",
    },
  ];
  const pasoActual = pasos.findIndex((p) => !p.hecho);

  // ---- Ingresos propios del año (curva, promedio, mejor mes, recibos del mes)
  const anioNum = Number(periodo.slice(0, 4));
  const { data: ingAnio } = tieneModulo(ctx.mcp, "ingresos")
    ? await supabase.from("ingresos").select("fecha, monto, numero").eq("mcp_id", mcpId).eq("estado", "emitido").gte("fecha", `${anioNum}-01-01`).lte("fecha", `${anioNum}-12-31`)
    : { data: [] as { fecha: string; monto: number; numero: number }[] };
  const mesesIng = Array.from({ length: 12 }, (_, i) => {
    const per = `${anioNum}-${String(i + 1).padStart(2, "0")}`;
    const rec = (ingAnio ?? []).filter((r) => r.fecha.startsWith(per));
    const nums = rec.map((r) => Number(r.numero));
    return { per, n: rec.length, total: rec.reduce((t, r) => t + Number(r.monto), 0), del: nums.length ? Math.min(...nums) : null, al: nums.length ? Math.max(...nums) : null };
  });
  const iMes = Number(periodo.slice(5, 7)) - 1;
  const ingMes = mesesIng[iMes];
  const ingPrev = iMes > 0 ? mesesIng[iMes - 1].total : 0;
  const variacion = iMes > 0 && ingPrev > 0 ? ((ingMes.total - ingPrev) / ingPrev) * 100 : null;
  const conIngreso = mesesIng.filter((m) => m.n > 0);
  const promedioMes = conIngreso.length ? conIngreso.reduce((t, m) => t + m.total, 0) / conIngreso.length : 0;
  const mejorMes = conIngreso.reduce<(typeof mesesIng)[number] | null>((m, x) => (!m || x.total > m.total ? x : m), null);
  const maxIng = Math.max(1, ...mesesIng.slice(0, iMes + 1).map((m) => m.total));
  const pts: [number, number][] = mesesIng.slice(0, iMes + 1).map((m, i) => [30 + (iMes === 0 ? 0 : (i * 460) / iMes), 108 - (m.total / maxIng) * 70]);
  const trazo = (() => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i - 1] ?? pts[i];
      const b = pts[i];
      const c = pts[i + 1];
      const e = pts[i + 2] ?? c;
      const cl = (v: number) => Math.min(108, Math.max(38, v));
      d += ` C ${b[0] + (c[0] - a[0]) / 6} ${cl(b[1] + (c[1] - a[1]) / 6)}, ${c[0] - (e[0] - b[0]) / 6} ${cl(c[1] - (e[1] - b[1]) / 6)}, ${c[0]} ${c[1]}`;
    }
    return d;
  })();
  const codRec = (n: number | null) => (n === null ? "—" : String(n).padStart(4, "0"));

  // ---- Caja chica: cuánto falta para cuadrar
  const cajasMes = cajas ?? [];
  const gastosCaja = cajasMes.flatMap((c) => (c.caja_chica_gastos as { monto: number; anulado: boolean; sustento_tipo: string }[]).filter((g) => !g.anulado));
  const fondoCaja = cajasMes.reduce((t, c) => t + Number(c.monto_fondo), 0);
  const faltaCuadrar = Math.round((fondoCaja - gastadoCaja) * 100) / 100;
  const pctCaja = fondoCaja ? Math.round((gastadoCaja / fondoCaja) * 100) : 0;
  const djCaja = gastosCaja.filter((g) => g.sustento_tipo === "DJ").length;
  const chequesCaja = cajasMes.map((c) => c.numero_cheque).filter(Boolean).join(" · ");
  const hayCajaAbierta = cajasMes.some((c) => c.estado === "abierta");

  // ---- 5. Cuenta del Banco de la Nación en el mes
  const recibido = tarjetas.reduce((s, t) => s + t.transferencia, 0);
  const idsTransfer = new Set(transferencias.map((f) => f.id));
  const cheques = delMes.filter((c) => c.cheque && idsTransfer.has(c.fuente_id ?? ""));
  const girado = cheques.reduce((s, c) => s + Number(c.importe), 0);

  // ---- 6. Documentos listos para imprimir
  const documentos = [
    ...(ultimosExp ?? []).map((x) => ({
      clave: x.id,
      titulo: `Expediente ${num3(x.numero)}-${x.anio}`,
      detalle: x.descripcion,
      ultimo: NOMBRE_FASE[x.fase] ?? "Requerimiento",
      estado: x.estado,
      ver: `/expedientes/${x.id}`,
      imprimir: `/expedientes/${x.id}/documentos?doc=todo&imprimir=1`,
    })),
    ...(ultimosCp ?? []).map((x) => ({
      clave: x.id,
      titulo: codigoCP(x.numero, x.origen),
      detalle: x.concepto,
      ultimo: x.origen === "caja_chica" ? "Liquidación de caja chica" : "Comprobante de pago",
      estado: x.estado,
      ver: `/comprobantes/${x.id}`,
      imprimir: `/comprobantes/${x.id}`,
    })),
  ].slice(0, 8);

  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate();
  const faltaConfigurar = !ctx.mcp.ruc || !Object.values(ctx.mcp.capitulo1 ?? {}).some(Boolean);
  const nombreCorto = ctx.nombre.split(/\s+/)[0];
  const mesActual = nombrePeriodo(periodo).split(" ")[0];
  const mesAnterior = nombrePeriodo(anterior).split(" ")[0];
  const puedeRegistrar = tiene(ctx, "admin", "tesorero", "contador");

  const siguiente = pasoActual >= 0 ? pasos[pasoActual] : null;
  const quedaBanco = recibido - girado;

  return (
    <>
      {tiene(ctx, "alcalde", "admin") && (
        <Suspense fallback={null}>
          <NuevoRequerimientoInicio />
        </Suspense>
      )}


      {faltaConfigurar && tiene(ctx, "admin") && (
        <div className="aviso info">
          Faltan datos de la MCP (RUC o capítulo I del informe). <Link href="/configuracion">Completar en Configuración</Link>
        </div>
      )}


      <div className="ini-dos">
        <div className="ini-col">
          <section className="saludo">
        <div>
          <h1>{saludo()}, {nombreCorto}</h1>
          <div className="tenue">
            {mayus(nombrePeriodo(periodo))} · {diasMes === 0 ? "hoy cierra el mes" : `faltan ${diasMes} días para cerrar el mes`}
          </div>
        </div>
      </section>

          {/* Lo siguiente que le toca */}
          <section className="ini-hero" aria-label="Lo siguiente que le toca">
            <div className="ini-hero-texto">
              <span className="ini-hero-et">{siguiente ? `Lo siguiente · paso ${pasoActual + 1} de 3` : "Todo al día"}</span>
              <strong>{siguiente ? siguiente.titulo : `Su mes de ${mesActual} está completo`}</strong>
              <span>{siguiente ? siguiente.detalle : "Los tres pasos están listos."}</span>
            </div>
            <div className="ini-hero-pasos" aria-hidden="true">
              {pasos.map((p, i) => (
                <span key={p.titulo} className={p.hecho ? "hecho" : i === pasoActual ? "actual" : undefined}>{p.hecho ? "✓" : i + 1}</span>
              ))}
            </div>
            {siguiente && (siguiente.href === "/expedientes?nuevo=1" && tiene(ctx, "alcalde", "admin")
              ? <BotonAbrirRequerimiento className="ini-hero-boton">{siguiente.accion}</BotonAbrirRequerimiento>
              : <Link className="ini-hero-boton" href={siguiente.href}>{siguiente.accion}</Link>)}
          </section>


          {tieneModulo(ctx.mcp, "rendicion") && (
            <section className="ini-panel" aria-label="Rendición del mes">
              <div className="ini-panel-cab"><span>Rendición de {mesActual}</span></div>
              <div className="ini-rend">
          {tarjetas.map(({ f, listo, tramite, transferencia, falta, limite, dias, rendicion }) => {
            const base = Math.max(transferencia, listo + tramite, 1);
            return (
              <Link key={f.id} className="ini-rend-fila" href={rendicion ? `/rendicion/${rendicion.id}` : `/rendicion?fuente=${f.id}`} style={{ gap: 10 }}>
                <div className="tarjeta-cab">
                  <span className="etiqueta">{etiquetaFuente(f)} · {f.municipalidad}</span>
                  {rendicion ? <Estado valor={rendicion.estado} /> : <span className={`plazo ${dias < 0 ? "vencido" : dias <= 5 ? "cerca" : ""}`}>Hasta el {fechaLarga(limite)} · {cuentaRegresiva(dias)}</span>}
                </div>
                {rendicion ? (
                  <>
                    <span className="valor">Rendición {String(rendicion.numero).padStart(3, "0")}-{rendicion.anio}</span>
                    <span className="detalle">Ya generada. Ábrala para imprimir el informe.</span>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      {falta > 0 ? (
                        <>
                          <span className="detalle">Le faltan sustentar</span>
                          <span className="valor">S/ {soles(falta)}</span>
                          <span className="detalle">de S/ {soles(transferencia)}</span>
                        </>
                      ) : falta < 0 ? (
                        <>
                          <span className="valor" style={{ color: "var(--rojo)" }}>S/ {soles(-falta)}</span>
                          <span className="detalle">gastado de más: revise los comprobantes</span>
                        </>
                      ) : (
                        <>
                          <span className="valor" style={{ color: "var(--verde-texto)" }}>✓ Completo</span>
                          <span className="detalle">{tramite > 0 ? "Termine de aprobar y poner cheques" : "Ya puede armar la rendición"}</span>
                        </>
                      )}
                    </div>
                    <div className="apilada" role="img" aria-label={`Listo ${soles(listo)}, en trámite ${soles(tramite)}, por sustentar ${soles(Math.max(0, falta))}`}>
                      {listo > 0 && <div className="listo" style={{ width: `${(listo / base) * 100}%` }} title={`Listo: S/ ${soles(listo)}`} />}
                      {tramite > 0 && <div className="tramite" style={{ width: `${(tramite / base) * 100}%` }} title={`En trámite: S/ ${soles(tramite)}`} />}
                    </div>
                    <div className="leyenda">
                      <span><i style={{ background: "var(--primario)" }} />Con cheque <b>{soles(listo)}</b></span>
                      <span><i style={{ background: "var(--primario-claro)" }} />En trámite <b>{soles(tramite)}</b></span>
                      <span><i style={{ background: "var(--pista)", border: "1px solid var(--borde)" }} />Por sustentar <b>{soles(Math.max(0, falta))}</b></span>
                    </div>
                  </>
                )}
              </Link>
            );
          })}
              </div>
            </section>
          )}

                {/* 1. Pagos fijos del mes */}
        <section className="ini-panel" aria-label="Pagos fijos del mes">
          <div className="ini-panel-cab">
            Pagos fijos de {mesActual}
            <span className="tenue pequeno">Dietas y personal</span>
          </div>
          <div className="ini-cuerpo">
            {catalogo.length > 0 ? (
              faltanCatalogo.length === 0 ? (
                <div className="aviso ok" style={{ margin: 0 }}>✓ Los {catalogo.length} pagos fijos de {mesActual} ya están registrados.</div>
              ) : (
                <>
                  <div>
                    Faltan <b>{faltanCatalogo.length}</b> de {catalogo.length} pagos fijos de {mesActual}:
                  </div>
                  <ul className="lista-simple">
                    {faltanCatalogo.map((p) => (
                      <li key={p.id}>
                        <span className="envolver">{p.concepto}{p.beneficiario ? ` · ${p.beneficiario}` : ""}</span>
                        <span className="num">S/ {soles(p.monto)}</span>
                      </li>
                    ))}
                  </ul>
                  {puedeRegistrar && (
                    <form action={copiarPagosFijos} style={{ alignSelf: "flex-start" }}>
                      <BotonConfirmar
                        className="btn primario"
                        pregunta={`¿Registrar ${faltanCatalogo.length} pago(s) fijo(s) de ${mesActual}?`}
                        detalle="Se crean los requerimientos en borrador con el monto de la lista. Después revíselos y envíelos al alcalde."
                        textoConfirmar="Sí, registrar"
                      >
                        Registrar los {faltanCatalogo.length} de {mesActual}
                      </BotonConfirmar>
                    </form>
                  )}
                </>
              )
            ) : fijos.anteriores.length === 0 && fijos.actuales.length === 0 ? (
              <span className="tenue">
                Arme la lista de pagos fijos (dietas, asesor, personal) en <Link href="/configuracion#pagos-fijos">Configuración</Link>: cada mes saldrán aquí los que faltan.
              </span>
            ) : fijos.faltan.length === 0 ? (
              <div className="aviso ok" style={{ margin: 0 }}>✓ Los {fijos.actuales.length} pagos fijos de {mesActual} ya están registrados.</div>
            ) : (
              <>
                <div>
                  Faltan <b>{fijos.faltan.length}</b> de {fijos.anteriores.length} pagos fijos que hizo en {mesAnterior}:
                </div>
                <ul className="lista-simple">
                  {fijos.faltan.map((p) => (
                    <li key={p.id}>
                      <span className="envolver">{p.descripcion}</span>
                      <span className="num">S/ {soles(p.monto)}</span>
                    </li>
                  ))}
                </ul>
                {puedeRegistrar && (
                  <form action={copiarPagosFijos} style={{ alignSelf: "flex-start" }}>
                    <BotonConfirmar
                      className="btn primario"
                      pregunta={`¿Copiar ${fijos.faltan.length} pago(s) fijo(s) de ${mesAnterior} a ${mesActual}?`}
                      detalle={`Se crean en borrador con el mismo monto y el mes cambiado a ${mesActual.toUpperCase()}. Después revise y envíelos al alcalde.`}
                      textoConfirmar="Sí, copiar"
                    >
                      Copiar los {fijos.faltan.length} de {mesAnterior}
                    </BotonConfirmar>
                  </form>
                )}
              </>
            )}
          </div>
        </section>


        </div>

        <div className="ini-col">
          {tieneModulo(ctx.mcp, "ingresos") && (
            <section className="ini-panel" aria-label="Ingresos propios por mes">
              <div className="ini-panel-cab">
                <span>Ingresos propios por mes</span>
                <Link href="/ingresos?vista=anio">Resumen del año →</Link>
              </div>
              <div className="ini-grande">S/ {soles(ingMes.total)}</div>
              <div className="ini-sub">
                {mesActual.toLowerCase()}
                {variacion !== null && <> · <span className={`ini-var ${variacion >= 0 ? "sube" : "baja"}`}>{variacion >= 0 ? "▲" : "▼"} {Math.abs(variacion).toFixed(0)} %</span> frente a {mesAnterior.toLowerCase()}</>}
              </div>
              <CurvaIngresos
                trazo={trazo}
                puntos={mesesIng.slice(0, iMes + 1).map((m, i) => ({ x: pts[i][0], y: pts[i][1], corto: nombrePeriodo(m.per).slice(0, 3), largo: nombrePeriodo(m.per), total: m.total, n: m.n }))}
              />
              <div className="ini-datos">
                <div><span>Recibos del mes</span><b>{ingMes.n ? `${ingMes.n} · del ${codRec(ingMes.del)} al ${codRec(ingMes.al)}` : "0"}</b></div>
                <div><span>Promedio por mes</span><b>S/ {soles(promedioMes)}</b></div>
                <div><span>Mejor mes</span><b>{mejorMes ? `${nombrePeriodo(mejorMes.per).split(" ")[0]} · S/ ${soles(mejorMes.total)}` : "—"}</b></div>
              </div>
            </section>
          )}

          {tieneModulo(ctx.mcp, "caja_chica") && (
            <section className="ini-panel" aria-label="Caja chica">
              <div className="ini-panel-cab">
                <span>Caja chica · cómo va el cuadre</span>
                {chequesCaja && <small>cheque {chequesCaja}</small>}
              </div>
              {cajasMes.length > 0 ? (
                <>
                  <div className="ini-trio">
                    <div><span>Fondo</span><b>{soles(fondoCaja)}</b></div>
                    <div><span>Gastado</span><b>{soles(gastadoCaja)}</b></div>
                    <div className="resalta"><span>{faltaCuadrar < 0 ? "Se pasó" : "Falta"}</span><b>{soles(Math.abs(faltaCuadrar))}</b></div>
                  </div>
                  <div className="ini-barra" aria-hidden="true"><div style={{ width: `${Math.min(100, pctCaja)}%` }} /></div>
                  <p className="ini-nota">
                    {gastosCaja.length} gasto(s) · {djCaja} declaración(es) jurada(s)
                    {faltaCuadrar === 0 ? " · ya cuadra: puede cerrar la caja." : faltaCuadrar > 0 ? ` · al llegar a S/ ${soles(fondoCaja)} cuadra; también puede cerrarla antes.` : " · anule o corrija algún gasto."}
                    {cajasMes.length > 1 ? ` (${cajasMes.length} cajas este mes)` : ""}
                  </p>
                  <div className="ini-acciones">
                    {hayCajaAbierta && <Link className="btn primario" href="/caja-chica">+ Registrar gasto</Link>}
                    <Link className="btn" href="/caja-chica">Ver caja chica</Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="ini-nota">Aún no se abre el fondo de caja chica de {mesActual}.</p>
                  <div className="ini-acciones"><Link className="btn primario" href="/caja-chica">Abrir el fondo</Link></div>
                </>
              )}
            </section>
          )}

          <section className="ini-panel" aria-label="Cuenta del banco">
            <div className="ini-panel-cab">
              <span>Cuenta del {ctx.mcp.banco_nombre || "Banco de la Nación"}</span>
              {ctx.mcp.banco_cuenta && <small>N° {ctx.mcp.banco_cuenta}</small>}
            </div>
            <div className="ini-lineas">
              {tarjetas.map((t) => (
                <div key={t.f.id}><span>Transferencia de {t.f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")}</span><b>+ {soles(t.transferencia)}</b></div>
              ))}
              <div><span>Cheques girados ({cheques.length})</span><b>− {soles(girado)}</b></div>
              <div className="total"><span>Debería quedar en la cuenta</span><b>S/ {soles(quedaBanco)}</b></div>
            </div>
          </section>

        </div>
      </div>

      {/* 6. Documentos listos para imprimir */}
      <section className="ini-panel" aria-label="Documentos listos para imprimir">
        <div className="ini-panel-cab"><span>Documentos listos para imprimir</span></div>
        <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
          <table className="tabla" style={{ minWidth: 640 }}>
            <tbody>
              {documentos.length === 0 && <tr><td className="tenue">Todavía no hay documentos. Empiece con un nuevo requerimiento.</td></tr>}
              {documentos.map((d) => (
                <tr key={d.clave}>
                  <td style={{ fontWeight: 600 }}>{d.titulo}</td>
                  <td className="envolver">{d.detalle}</td>
                  <td className="tenue pequeno">Último: {d.ultimo}</td>
                  <td><Estado valor={d.estado} /></td>
                  <td>
                    <div className="acciones-fila">
                      <Link className="btn chico contorno" href={d.ver}>Ver</Link>
                      <Link className="btn chico primario" href={d.imprimir}>Imprimir</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
