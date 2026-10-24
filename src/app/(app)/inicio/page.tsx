import Link from "next/link";
import BotonConfirmar from "@/components/BotonConfirmar";
import Estado from "@/components/Estado";
import { FUNCIONES } from "@/lib/catalogos";
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
import { estadoPagosFijos } from "@/lib/pagosFijos";
import { supabaseServidor } from "@/lib/supabase/server";
import { copiarPagosFijos } from "../expedientes/acciones";

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
  const rangoAnt = rangoPeriodo(anterior);
  const mcpId = ctx.mcp.id;

  const [
    { data: cps },
    { count: reqPorAprobar },
    { data: rendiciones },
    { data: cajas },
    { data: ingresos },
    { data: ultimosExp },
    { data: ultimosCp },
    fijos,
  ] = await Promise.all([
    supabase.from("comprobantes_pago").select("id, estado, cheque, importe, fuente_id, fecha, funcion").eq("mcp_id", mcpId).in("estado", ["borrador", "aprobado", "rendido"]).lte("fecha", hasta),
    supabase.from("expedientes").select("id", { count: "exact", head: true }).eq("mcp_id", mcpId).eq("estado", "borrador"),
    supabase.from("rendiciones").select("id, fuente_id, estado, numero, anio, periodo").eq("mcp_id", mcpId).in("periodo", [periodo, anterior]).neq("estado", "anulada"),
    supabase.from("cajas_chicas").select("id, monto_fondo, estado, caja_chica_gastos(monto, anulado)").eq("mcp_id", mcpId).eq("periodo", periodo).neq("estado", "anulada"),
    supabase.from("ingresos").select("monto").eq("mcp_id", mcpId).eq("estado", "emitido").gte("fecha", desde).lte("fecha", hasta),
    supabase.from("expedientes").select("id, numero, anio, fecha, descripcion, estado, fase").eq("mcp_id", mcpId).neq("estado", "anulado").order("creado_en", { ascending: false }).limit(6),
    supabase.from("comprobantes_pago").select("id, numero, origen, fecha, concepto, importe, estado, creado_en").eq("mcp_id", mcpId).neq("origen", "expediente").neq("estado", "anulado").order("creado_en", { ascending: false }).limit(3),
    estadoPagosFijos(supabase, mcpId, periodo),
  ]);
  // Bienes por reponer (si el almacén ya está activo)
  const { data: stockBajo } = await supabase.from("almacen_stock").select("bien_id, stock, stock_minimo").eq("mcp_id", mcpId).gt("stock_minimo", 0);
  const porReponer = (stockBajo ?? []).filter((b) => Number(b.stock) <= Number(b.stock_minimo)).length;

  const lista = cps ?? [];
  const transferencias = ctx.fuentes.filter((f) => f.tipo !== "propios");
  const propios = ctx.fuentes.find((f) => f.tipo === "propios");
  const cpPorAprobar = lista.filter((c) => c.estado === "borrador").length;
  const cpSinCheque = lista.filter((c) => c.estado === "aprobado" && !c.cheque).length;
  const totalIngresos = (ingresos ?? []).reduce((s, i) => s + Number(i.monto), 0);
  const caja = (cajas ?? [])[0];
  const gastadoCaja = caja
    ? (caja.caja_chica_gastos as { monto: number; anulado: boolean }[]).filter((g) => !g.anulado).reduce((s, g) => s + Number(g.monto), 0)
    : 0;
  const alcalde = tiene(ctx, "alcalde");
  const delMes = lista.filter((c) => c.fecha >= desde);
  const gastadoPropios = delMes.filter((c) => c.fuente_id === propios?.id).reduce((s, c) => s + Number(c.importe), 0);
  const rendicionDe = (fuente: string, p: string) => (rendiciones ?? []).find((r) => r.fuente_id === fuente && r.periodo === p);

  // ---- 2. Cuánto le falta sustentar de cada transferencia
  const tarjetas = transferencias.map((f) => {
    const deLaFuente = lista.filter((c) => c.fuente_id === f.id && c.estado !== "rendido");
    const listo = deLaFuente.filter((c) => c.estado === "aprobado" && c.cheque).reduce((s, c) => s + Number(c.importe), 0);
    const tramite = deLaFuente.filter((c) => !(c.estado === "aprobado" && c.cheque)).reduce((s, c) => s + Number(c.importe), 0);
    const transferencia = Number(f.monto_mensual);
    const falta = Math.round((transferencia - listo - tramite) * 100) / 100;
    const limite = fechaLimite(periodo, f.dia_limite);
    return { f, listo, tramite, transferencia, falta, limite, dias: diasHasta(limite), rendicion: rendicionDe(f.id, periodo) };
  });

  // ---- 3. Rendiciones del mes pasado que aún no se arman
  const atrasadas = transferencias
    .map((f) => {
      const sinRendir = lista.filter((c) => c.fuente_id === f.id && c.estado !== "rendido" && c.fecha >= rangoAnt.desde && c.fecha <= rangoAnt.hasta);
      const limite = fechaLimite(anterior, f.dia_limite);
      return { f, monto: sinRendir.reduce((s, c) => s + Number(c.importe), 0), n: sinRendir.length, limite, dias: diasHasta(limite) };
    })
    .filter((a) => a.n > 0 && !rendicionDe(a.f.id, anterior));

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

  // ---- 5. Cuenta del Banco de la Nación en el mes
  const recibido = tarjetas.reduce((s, t) => s + t.transferencia, 0);
  const idsTransfer = new Set(transferencias.map((f) => f.id));
  const cheques = delMes.filter((c) => c.cheque && idsTransfer.has(c.fuente_id ?? ""));
  const girado = cheques.reduce((s, c) => s + Number(c.importe), 0);

  // ---- Gastos por función (para el informe de Chanchamayo)
  const porFuncion = FUNCIONES.map((f) => ({
    nombre: f.funcion,
    total: delMes.filter((c) => c.funcion === f.funcion).reduce((s, c) => s + Number(c.importe), 0),
  }));
  const sinFuncion = delMes.filter((c) => !c.funcion).reduce((s, c) => s + Number(c.importe), 0);
  if (sinFuncion) porFuncion.push({ nombre: "Sin función asignada", total: sinFuncion });
  const conGasto = porFuncion.filter((f) => f.total > 0);
  const maxFuncion = Math.max(1, ...conGasto.map((f) => f.total));

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
            {mayus(nombrePeriodo(periodo))} · {diasMes === 0 ? "hoy cierra el mes" : `faltan ${diasMes} días para cerrar el mes`}
          </div>
        </div>
      </section>

      {atrasadas.map((a) => (
        <div key={a.f.id} className={`aviso ${a.dias < 0 ? "error" : "alerta"} aviso-accion`}>
          <span>
            <strong>Falta la rendición de {mesAnterior} a {a.f.municipalidad}.</strong> Tiene {a.n} comprobante(s) por S/ {soles(a.monto)} sin rendir. Fecha límite: {fechaLarga(a.limite)} ({cuentaRegresiva(a.dias)}).
          </span>
          <Link className="btn chico primario" href={`/rendicion?fuente=${a.f.id}&mes=${anterior}`}>Armar rendición de {mesAnterior}</Link>
        </div>
      ))}

      <Link href="/expedientes?nuevo=1" className="empezar">
        <span className="empezar-icono" aria-hidden="true">+</span>
        <span className="empezar-texto">
          <strong>Nuevo requerimiento</strong>
          <span>¿Hizo o va a hacer un gasto? Empiece aquí: registre qué se compró o pagó y el sistema le arma los documentos.</span>
        </span>
        <span className="empezar-flecha" aria-hidden="true">→</span>
      </Link>

      {faltaConfigurar && tiene(ctx, "admin") && (
        <div className="aviso info">
          Faltan datos de la MCP (RUC o capítulo I del informe). <Link href="/configuracion">Completar en Configuración</Link>
        </div>
      )}

      {/* 4. Su mes en 3 pasos */}
      <section className="panel" aria-label="Su mes en 3 pasos">
        <div className="panel-cab">
          Su mes de {mesActual} en 3 pasos
          <span className="tenue pequeno">{pasos.filter((p) => p.hecho).length} de 3 listos</span>
        </div>
        <ol className="tres-pasos">
          {pasos.map((p, i) => (
            <li key={p.titulo} className={p.hecho ? "hecho" : i === pasoActual ? "actual" : undefined}>
              <span className="tp-marca" aria-hidden="true">{p.hecho ? "✓" : i + 1}</span>
              <span className="tp-texto">
                <strong>{p.titulo}</strong>
                <small>{p.detalle}</small>
                {i === pasoActual && (
                  <Link className="btn chico primario" href={p.href}>{p.accion}</Link>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* 2 y 3. Cuánto falta de cada transferencia y fecha límite */}
      <section aria-label="Rendición del mes">
        <h2 style={{ marginBottom: 10 }}>Rendición de {mesActual}</h2>
        <div className="rejilla-2">
          {tarjetas.map(({ f, listo, tramite, transferencia, falta, limite, dias, rendicion }) => {
            const base = Math.max(transferencia, listo + tramite, 1);
            return (
              <Link key={f.id} className="tarjeta" href={rendicion ? `/rendicion/${rendicion.id}` : `/rendicion?fuente=${f.id}`} style={{ gap: 10 }}>
                <div className="tarjeta-cab">
                  <span className="etiqueta">{f.tipo === "distrito" ? "Distrito" : "Provincia"} · {f.municipalidad}</span>
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
          {propios && (
            <Link className="tarjeta" href="/ingresos" style={{ gap: 10 }}>
              <span className="etiqueta">Ingresos propios del mes</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span className="valor">S/ {soles(totalIngresos - gastadoPropios)}</span>
                <span className="detalle">disponible</span>
              </div>
              <div className="leyenda">
                <span>Recaudado <b>{soles(totalIngresos)}</b></span>
                <span>Gastado <b>{soles(gastadoPropios)}</b></span>
                <span>Recibos <b>{(ingresos ?? []).length}</b></span>
              </div>
            </Link>
          )}
        </div>
      </section>

      <div className="rejilla-2" style={{ alignItems: "start" }}>
        {/* 1. Pagos fijos del mes */}
        <section className="panel" aria-label="Pagos fijos del mes">
          <div className="panel-cab">
            Pagos fijos de {mesActual}
            <span className="tenue pequeno">Dietas y personal</span>
          </div>
          <div className="panel-cuerpo">
            {fijos.anteriores.length === 0 && fijos.actuales.length === 0 ? (
              <span className="tenue">
                Registre sus dietas y pagos al personal como «Pago fijo». Desde el próximo mes podrá copiarlos aquí con un solo clic.
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

        {/* 5. Cuenta del Banco de la Nación */}
        <section className="panel" aria-label="Cuenta del banco">
          <div className="panel-cab">
            Cuenta del {ctx.mcp.banco_nombre || "Banco de la Nación"} en {mesActual}
            {ctx.mcp.banco_cuenta && <span className="tenue pequeno">N° {ctx.mcp.banco_cuenta}</span>}
          </div>
          <table className="tabla">
            <tbody>
              {tarjetas.map((t) => (
                <tr key={t.f.id}><td>Transferencia de {t.f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")}</td><td className="num">+ {soles(t.transferencia)}</td></tr>
              ))}
              <tr><td>Cheques girados ({cheques.length})</td><td className="num">− {soles(girado)}</td></tr>
              <tr style={{ fontWeight: 600 }}><td>Debería quedar en la cuenta</td><td className="num">{soles(recibido - girado)}</td></tr>
            </tbody>
          </table>
          <div className="panel-cuerpo pequeno tenue" style={{ paddingTop: 8 }}>
            Compare con su estado de cuenta. Si no coincide, puede faltar registrar un cheque o la transferencia aún no llegó.
          </div>
        </section>
      </div>

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
            {porReponer > 0 && (
              <li>
                <Link href="/almacen?filtro=minimo">
                  <span className="cuenta alerta">{porReponer}</span>
                  <span className="texto">Bienes por reponer<small>Llegaron a su stock mínimo en el almacén</small></span>
                  <span className="flecha" aria-hidden="true">›</span>
                </Link>
              </li>
            )}
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

      {/* 6. Documentos listos para imprimir */}
      <section className="panel" aria-label="Documentos listos para imprimir">
        <div className="panel-cab">Documentos listos para imprimir</div>
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
