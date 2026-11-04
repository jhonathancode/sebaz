import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import CamposRequerimiento from "@/components/formularios/CamposRequerimiento";
import VentanaFlotante from "@/components/VentanaFlotante";
import Motivo from "@/components/Motivo";
import { contextoMcp, tiene } from "@/lib/contexto";
import { cargarCierres, estadoGestion } from "@/lib/gestion";
import { codigoCP, fecha, hoyISO, nombrePeriodo, num3, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { cargarCatalogoPagosFijos, siguienteCheque } from "@/lib/pagosFijos";
import { cargarAtajos } from "@/lib/atajos";
import { anularExpedienteTotal, crearExpediente, registrarExpedienteCompleto } from "./acciones";
import AsistenteRequerimiento from "@/components/AsistenteRequerimiento";
import { CORRELATIVO, proximoNumero } from "@/lib/numeracion";

const ORDEN_FASES = ["requerimiento", "cotizacion", "orden", "conformidad", "comprobante"];
/** Documento que corresponde a cada fase (para abrirlo directo desde la lista). */
const DOC_DE_FASE: Record<string, { clave: string; corto: string }> = {
  requerimiento: { clave: "requerimiento", corto: "Requerimiento" },
  cotizacion: { clave: "cotizaciones", corto: "Cotizaciones" },
  orden: { clave: "orden", corto: "Orden" },
  conformidad: { clave: "conformidad", corto: "Conformidad" },
  comprobante: { clave: "comprobante", corto: "Comprobante" },
};
const TIPOS: Record<string, string> = { compra: "Compra de bienes", servicio: "Servicio externo", pago_fijo: "Pago fijo", caja_chica: "Caja chica" };
const ESTADOS = [
  { v: "", t: "Todos" },
  { v: "borrador", t: "Por aprobar" },
  { v: "aprobado", t: "En proceso" },
  { v: "rendido", t: "Rendidos" },
  { v: "anulado", t: "Anulados" },
];

export default async function Expedientes({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  // Sin mes elegido se ve lo que sigue pendiente (de cualquier mes) más lo reciente; con mes, solo ese mes
  const modo: "mes" | "pendientes" = sp.mes ? "mes" : "pendientes";
  const periodo = sp.mes || periodoActual();
  const { desde, hasta } = rangoPeriodo(periodo);
  const hoyP = periodoActual();
  const hace3 = (() => {
    const d = new Date(Number(hoyP.slice(0, 4)), Number(hoyP.slice(5, 7)) - 1 - 3, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();
  const estado = sp.estado ?? "";
  const tipo = sp.tipo ?? "";
  const q = sp.q ?? "";

  // Se traen todos los del mes (con búsqueda y tipo) para contar por estado; el estado se filtra aquí.
  let consulta = supabase
    .from("expedientes")
    .select("id, anio, numero, fecha, tipo, flujo_completo, descripcion, area_usuaria, fase, estado, expediente_items(total, anulado)")
    .eq("mcp_id", ctx.mcp.id)
    .order("fecha", { ascending: false })
    .order("numero", { ascending: false });
  consulta = modo === "mes" ? consulta.gte("fecha", desde).lte("fecha", hasta) : consulta.or(`estado.in.(borrador,aprobado),fecha.gte.${hace3}`);
  if (q) consulta = consulta.ilike("descripcion", `%${q}%`);
  if (tipo) consulta = consulta.eq("tipo", tipo);
  const anioNum = Number(hoyISO().slice(0, 4));
  const [{ data: lista }, pagosFijos, chequeSugerido, cierres, atajos, { data: provData }, { data: tesoreroMiembro }, nExp, nOrdC, nOrdS, nMemo, nNea, nCp, { data: extsTodos }, { data: cobradosTodos }] = await Promise.all([
    consulta,
    cargarCatalogoPagosFijos(supabase, ctx.mcp.id),
    siguienteCheque(supabase, ctx.mcp.id),
    cargarCierres(supabase, ctx.mcp.id),
    cargarAtajos(supabase, ctx.mcp.id),
    supabase.from("proveedores").select("num_doc, razon_social, direccion, telefono").eq("mcp_id", ctx.mcp.id).order("razon_social"),
    supabase.from("miembros").select("cargo, perfiles(nombre)").eq("mcp_id", ctx.mcp.id).eq("rol", "tesorero").eq("activo", true).maybeSingle(),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.expediente, anioNum),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.ordenCompra, anioNum),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.ordenServicio, anioNum),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.memorando, anioNum),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.nea, anioNum),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.comprobante, anioNum),
    // Se piden desde ya, a la vez que lo demás (antes esperaban su turno)
    supabase.from("extractos_transcritos").select("lineas"),
    supabase.from("cheques_cobrados").select("comprobante_id").eq("anulado", false),
  ]);

  const todosBase = (lista ?? []).map((e) => ({
    ...e,
    monto: (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
  }));
  // Conciliación con el banco de todos los del mes (para poder filtrar): un cheque está conciliado si figura cobrado
  // o si su estado de cuenta guardado enlaza comprobantes que suman lo que cobró el banco.
  const idsTodos = todosBase.map((e) => e.id);
  const idsQ = idsTodos.length ? idsTodos : ["00000000-0000-0000-0000-000000000000"];
  // Todo lo de los expedientes (comprobantes y demás documentos) se pide junto, en una sola vuelta
  const [{ data: cpsAllRaw }, { data: ordsV }, { data: confV }, { data: cotsV }, { data: neasV }, { data: cajasV }] = await Promise.all([
    supabase.from("comprobantes_pago").select("id, expediente_id, numero, origen, cheque, estado, creado_en, importe, deducciones").in("expediente_id", idsQ),
    supabase.from("ordenes").select("expediente_id, tipo, numero, anio, anulado, creado_en").in("expediente_id", idsQ),
    supabase.from("conformidades").select("expediente_id, memorando_numero, anio, anulado, creado_en").in("expediente_id", idsQ),
    supabase.from("cotizaciones").select("expediente_id, anulado").in("expediente_id", idsQ),
    supabase.from("notas_entrada").select("id, expediente_id, numero, anio, anulado, creado_en").in("expediente_id", idsQ),
    supabase.from("cajas_chicas").select("id, expediente_id, periodo, fuente_id, numero, estado").in("expediente_id", idsQ).neq("estado", "anulada"),
  ]);
  const cpsAll = cpsAllRaw;
  const cpsV = cpsAllRaw;
  const cpVigente = new Map<string, { id: string; cheque: string | null }>();
  [...(cpsAll ?? [])].sort((a, b) => b.creado_en.localeCompare(a.creado_en)).forEach((c) => {
    if (c.estado !== "anulado" && !cpVigente.has(c.expediente_id)) cpVigente.set(c.expediente_id, { id: c.id, cheque: c.cheque });
  });
  const idsCp = Array.from(cpVigente.values()).map((c) => c.id);
  const conciliadosCp = new Set<string>();
  if (idsCp.length) {
    const propios = new Set(idsCp);
    (cobradosTodos ?? []).forEach((c) => propios.has(c.comprobante_id) && conciliadosCp.add(c.comprobante_id));
    const exts = extsTodos;
    const montoDe = new Map((cpsAll ?? []).map((c) => [c.id, Math.round((Number(c.importe) - Number(c.deducciones ?? 0)) * 100) / 100]));
    type L = { cargo?: number | null; enlace?: { tipo?: string; id?: string; extra?: { id: string }[] } | null };
    const todas = (exts ?? []).flatMap((e) => (e.lineas ?? []) as L[]);
    const faltan = Array.from(new Set(todas.flatMap((l) => (l.enlace?.tipo === "cp" && l.enlace.id ? [l.enlace.id, ...(l.enlace.extra ?? []).map((x) => x.id)] : [])))).filter((id) => !montoDe.has(id));
    if (faltan.length) {
      const { data: otros } = await supabase.from("comprobantes_pago").select("id, importe, deducciones").in("id", faltan);
      (otros ?? []).forEach((c) => montoDe.set(c.id as string, Math.round((Number(c.importe) - Number(c.deducciones ?? 0)) * 100) / 100));
    }
    for (const l of todas) {
      if (l.enlace?.tipo !== "cp" || !l.enlace.id || l.cargo == null) continue;
      const ids = [l.enlace.id, ...(l.enlace.extra ?? []).map((x) => x.id)];
      if (!ids.every((id) => montoDe.has(id))) continue;
      const suma = Math.round(ids.reduce((t, id) => t + (montoDe.get(id) ?? 0), 0) * 100) / 100;
      if (Math.abs(suma - Number(l.cargo)) < 0.005) ids.forEach((id) => conciliadosCp.add(id));
    }
  }
  const conciliadoExp = (id: string) => {
    const c = cpVigente.get(id);
    return !!c && conciliadosCp.has(c.id);
  };
  /** Pagado con cheque pero aún sin pasar por el estado de cuenta del banco. */
  const sinConciliarExp = (e: { id: string; estado: string }) => e.estado !== "anulado" && !!cpVigente.get(e.id)?.cheque && !conciliadoExp(e.id);
  // Vista de pendientes: lo que aún no se rinde ni se paga, lo del mes actual y lo pagado que falta conciliar
  const todos = modo === "mes"
    ? todosBase
    : todosBase.filter((e) => e.estado === "borrador" || e.estado === "aprobado" || e.estado === "anulado" || e.fecha >= `${hoyP}-01` || sinConciliarExp(e));
  const conc = sp.conc === "si" || sp.conc === "no" ? sp.conc : "";
  const nConciliados = todos.filter((e) => e.estado !== "anulado" && conciliadoExp(e.id)).length;
  const nSinConciliar = todos.filter(sinConciliarExp).length;
  const filas = todos.filter((e) => (!estado || e.estado === estado) && (conc === "" || estado === "anulado" || (conc === "si" ? e.estado !== "anulado" && conciliadoExp(e.id) : sinConciliarExp(e))));
  const cuenta = (v: string) => (v ? todos.filter((e) => e.estado === v).length : todos.length);
  const vigentes = todos.filter((e) => e.estado !== "anulado");
  const totalMes = vigentes.reduce((s, e) => s + e.monto, 0);
  const totalLista = filas.filter((f) => f.estado !== "anulado").reduce((s, f) => s + f.monto, 0);
  const porAprobar = todos.filter((e) => e.estado === "borrador");
  const enProceso = todos.filter((e) => e.estado === "aprobado");
  const rendidos = todos.filter((e) => e.estado === "rendido");

  // Anular desde la lista: mismas reglas que dentro del expediente
  const puedeRegistrar = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const puedeAprobar = tiene(ctx, "alcalde", "admin");
  const puedeAnular = (e: { estado: string; fase: string; fecha: string }) =>
    puedeRegistrar &&
    e.estado !== "anulado" &&
    e.estado !== "rendido" &&
    (e.fase !== "comprobante" || puedeAprobar) &&
    estadoGestion(e.fecha, cierres, hoyISO())?.estado !== "bloqueado";

  // De 20 en 20: los últimos primero y luego con números para ir hacia atrás
  const POR_PAGINA = 20;
  const totalPaginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const pagina = Math.min(totalPaginas, Math.max(1, Math.floor(Number(sp.pag)) || 1));
  const visibles = filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const cajaDe = new Map((cajasV ?? []).map((c) => [c.expediente_id as string, c]));
  const elegir = <T extends { creado_en: string }>(xs: T[] | null | undefined, vigente: (x: T) => boolean) => {
    const orden = [...(xs ?? [])].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
    return orden.find(vigente) ?? orden[0] ?? null;
  };
  const docsDe = (e: { id: string; estado: string }) => {
    const mios = <T extends { expediente_id: string }>(xs: T[] | null | undefined) => (xs ?? []).filter((x) => x.expediente_id === e.id);
    const anul = e.estado === "anulado";
    const o = elegir(mios(ordsV), (x) => !x.anulado);
    const c = elegir(mios(confV), (x) => !x.anulado);
    const cp = elegir(mios(cpsV), (x) => x.estado !== "anulado");
    const n = elegir(mios(neasV), (x) => !x.anulado);
    const cots = mios(cotsV).filter((x) => anul || !x.anulado).length;
    return {
      orden: o ? `${o.tipo === "compra" ? "OC" : "OS"} ${num3(o.numero)}-${o.anio}` : null,
      conformidad: c ? `MEMO ${num3(c.memorando_numero)}-${c.anio}` : null,
      cotizaciones: cots > 0 ? `${cots} cot.` : null,
      comprobante: cp ? codigoCP(cp.numero, cp.origen) : null,
      cheque: cp?.cheque ?? null,
      hayCp: !!cp,
      conciliado: conciliadoExp(e.id),
      nea: n ? { id: n.id as string, texto: `NEA ${num3(n.numero)}-${n.anio}` } : null,
    };
  };
  const numeros = Array.from({ length: totalPaginas }, (_, i) => i + 1).filter((n) => n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 2);
  const enlace = (cambios: Record<string, string>) => {
    const p = new URLSearchParams({ ...(modo === "mes" ? { mes: periodo } : {}), estado, tipo, q, conc, ...cambios });
    [...p.keys()].forEach((k) => !p.get(k) && p.delete(k));
    return `/expedientes?${p.toString()}`;
  };

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Expedientes</h1>
          <div className="sub">{modo === "pendientes" ? "Lo pendiente de cualquier mes y lo de este mes · para el historial elija un mes" : `Historial de ${nombrePeriodo(periodo)}`}</div>
        </div>
        <form className="selector-mes" method="get">
          <input type="hidden" name="estado" value={estado} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="conc" value={conc} />
          <input type="month" name="mes" defaultValue={modo === "mes" ? periodo : ""} aria-label="Mes" />
          <button className="btn chico" type="submit">Ver mes</button>
        </form>
        <Link className={`btn${modo === "pendientes" ? " primario" : " contorno"}`} href={enlace({ mes: "" })} title="Todo lo que sigue pendiente, de cualquier mes">Pendientes</Link>
        <span className="espacio" />
        <Link className="btn contorno" href={`/comprobantes?mes=${periodo}`}>Comprobantes de pago</Link>
        <a className="btn contorno" href={`/exportar/expedientes?mes=${periodo}&estado=${estado}&tipo=${tipo}&q=${encodeURIComponent(q)}`}>Descargar Excel</a>
        {tiene(ctx, "alcalde", "admin") ? (
          <AsistenteRequerimiento
            boton="+ Nuevo requerimiento"
            claseBoton="btn primario grande"
            abierta={sp.nuevo === "1"}
            error={sp.nuevo === "1" ? sp.error : undefined}
            eventoAbrir="sebaz:abrir-nuevo-requerimiento"
            accion={registrarExpedienteCompleto}
            mcp={ctx.mcp}
            proximos={{ expediente: nExp, ordenCompra: nOrdC, ordenServicio: nOrdS, memorando: nMemo, nea: nNea, comprobante: nCp }}
            tesorero={(tesoreroMiembro?.perfiles as unknown as { nombre: string } | null)?.nombre ?? ""}
            cargo={tesoreroMiembro?.cargo ?? "Tesorero(a)"}
            hechoPor={ctx.nombre}
            proveedores={provData ?? []}
            chequeSugerido={chequeSugerido}
            fuentes={ctx.fuentes}
          >
            <CamposRequerimiento modo="asistente" fuentes={ctx.fuentes} pagosFijos={pagosFijos} chequeSugerido={chequeSugerido} historial={atajos.historial} fuenteFrecuente={atajos.fuenteFrecuente} proveedores={provData ?? []} />
          </AsistenteRequerimiento>
        ) : (
        <VentanaFlotante
          boton="+ Nuevo requerimiento"
          claseBoton="btn primario grande"
          titulo="Nuevo requerimiento"
          accion={crearExpediente}
          textoGuardar="Guardar requerimiento"
         
          abierta={sp.nuevo === "1"}
          eventoAbrir="sebaz:abrir-nuevo-requerimiento"
          error={sp.nuevo === "1" ? sp.error : undefined}
          ancha
          pin
          pinOpcionalSi={tiene(ctx, "alcalde", "admin") ? 'input[name="tipo"][value="pago_fijo"]:checked' : undefined}
        >
          <CamposRequerimiento fuentes={ctx.fuentes} pagosFijos={pagosFijos} chequeSugerido={chequeSugerido} historial={atajos.historial} fuenteFrecuente={atajos.fuenteFrecuente} proveedores={provData ?? []} />
        </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="kpis">
        <div className="kpi azul">
          <span className="k-et">{modo === "mes" ? `Gasto de ${nombrePeriodo(periodo)}` : "Gasto de lo pendiente y del mes"}</span>
          <span className="k-val">S/ {soles(totalMes)}</span>
          <span className="k-det">{vigentes.length} expedientes vigentes</span>
        </div>
        <Link className={`kpi${porAprobar.length ? " alerta" : ""}`} href={enlace({ estado: "borrador" })}>
          <span className="k-et">Por aprobar</span>
          <span className="k-val">{porAprobar.length}</span>
          <span className="k-det">S/ {soles(porAprobar.reduce((s, e) => s + e.monto, 0))} esperan al alcalde</span>
        </Link>
        <Link className="kpi" href={enlace({ estado: "aprobado" })}>
          <span className="k-et">En proceso</span>
          <span className="k-val">{enProceso.length}</span>
          <span className="k-det">Aprobados, avanzando al pago</span>
        </Link>
        <Link className="kpi" href={enlace({ estado: "rendido" })}>
          <span className="k-et">Rendidos</span>
          <span className="k-val">{rendidos.length}</span>
          <span className="k-det">Ya entraron en una rendición</span>
        </Link>
      </div>

      <div className="filtros">
        <div className="grupo" role="group" aria-label="Estado">
          {ESTADOS.map((x) => (
            <Link key={x.v} className={`f-chip${estado === x.v ? " activo" : ""}${x.v === "anulado" ? " rojo" : ""}`} href={enlace(x.v === "anulado" ? { estado: x.v, conc: "" } : { estado: x.v })}>
              {x.t} <span className="n">{cuenta(x.v)}</span>
            </Link>
          ))}
        </div>
        <div className="grupo" role="group" aria-label="Tipo">
          <span className="grupo-et">Tipo</span>
          {[["", "Todos"], ["compra", "Compra"], ["servicio", "Servicio"], ["pago_fijo", "Pago fijo"], ["caja_chica", "Caja chica"]].map(([v, t]) => (
            <Link key={v} className={`f-chip${tipo === v ? " activo" : ""}`} href={enlace({ tipo: v })}>{t}</Link>
          ))}
        </div>
        <div className="grupo" role="group" aria-label="Conciliación con el banco">
          <span className="grupo-et">Banco</span>
          <Link className={`f-chip${conc === "" ? " activo" : ""}`} href={enlace({ conc: "" })}>Todos</Link>
          <Link className={`f-chip verde${conc === "si" ? " activo" : ""}`} href={enlace({ conc: "si" })}>✓ Conciliados <span className="n">{nConciliados}</span></Link>
          <Link className={`f-chip ambar${conc === "no" ? " activo" : ""}${nSinConciliar > 0 ? " aviso" : ""}`} href={enlace({ conc: "no" })}>⚠ Sin conciliar <span className="n">{nSinConciliar}</span></Link>
        </div>
        <form className="buscador" method="get" role="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="hidden" name="mes" value={modo === "mes" ? periodo : ""} />
          <input type="hidden" name="estado" value={estado} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="conc" value={conc} />
          <input name="q" defaultValue={q} placeholder="Buscar por descripción…" aria-label="Buscar" />
          <button className="btn chico" type="submit">Buscar</button>
        </form>
      </div>

      <div className="filas">
        {filas.length === 0 && (
          <div className="vacio">
            {todos.length === 0 ? "No hay expedientes pendientes. Empiece con «+ Nuevo requerimiento»." : "Ningún expediente con ese filtro."}
          </div>
        )}
        {visibles.map((e) => {
          const pasos =
            e.tipo !== "pago_fijo"
              ? ORDEN_FASES
              : (e as { flujo_completo?: boolean }).flujo_completo
                ? ["requerimiento", "orden", "conformidad", "comprobante"] // pago fijo con expediente completo: sin cotizaciones
                : ["requerimiento", "comprobante"];
          const hecho = e.estado === "rendido" ? pasos.length : Math.max(1, pasos.indexOf(e.fase) + 1);
          const dd = docsDe(e);
          const numDe: Record<string, string | null> = {
            requerimiento: `${num3(e.numero)}-${e.anio}`,
            cotizaciones: dd.cotizaciones,
            orden: dd.orden,
            conformidad: dd.conformidad,
            comprobante: dd.comprobante,
          };
          return (
            <div key={e.id} className={`fila${e.estado === "anulado" ? " anulada" : ""}${dd.conciliado && e.estado !== "anulado" ? " conciliada" : ""}`}>
              <div className="f-num">
                {num3(e.numero)}-{e.anio}
                <small>{fecha(e.fecha)}</small>
              </div>
              <div className="f-desc">
                <Link href={`/expedientes/${e.id}`} title={e.descripcion}>{e.descripcion}</Link>
                <div className="f-meta">
                  <span className="etq">{TIPOS[e.tipo] ?? e.tipo}</span>
                  {e.area_usuaria && <span>{e.area_usuaria}</span>}
                  {(() => {
                    const g = estadoGestion(e.fecha, cierres, hoyISO());
                    return g ? <span className={`etq ${g.estado === "bloqueado" ? "rojo" : "ambar"}`} title={g.estado === "bloqueado" ? "De una gestión anterior: bloqueado" : `Gestión anterior: se bloquea el ${fecha(g.desde)}`}>{g.estado === "bloqueado" ? "🔒 Gestión anterior" : "Gestión anterior · en gracia"}</span> : null;
                  })()}
                </div>
                <div className="doc-pasos" aria-label="Documentos del expediente">
                  {pasos.map((p, i) => {
                    const d = DOC_DE_FASE[p];
                    const listo = i < hecho;
                    const siguiente = i === hecho && e.estado !== "anulado" && e.estado !== "rendido";
                    return (
                      <span key={p} className="doc-par">
                        {i > 0 && <i className={`doc-sep${listo ? " ok" : ""}`} aria-hidden="true" />}
                        {listo ? (
                          <Link className="doc-paso" href={`/expedientes/${e.id}?paso=${p}&ver=${d.clave}`} title={`Ver ${d.corto.toLowerCase()}`}>
                            <span className="ic" aria-hidden="true">✓</span>{d.corto}
                            {numDe[p] && <span className="doc-num">{numDe[p]}</span>}
                          </Link>
                        ) : (
                          siguiente ? (
                            <Link className="doc-paso pendiente siguiente" href={`/expedientes/${e.id}`} title="Es el que sigue: abrir para continuar">
                              <span className="ic" aria-hidden="true" />{d.corto}
                            </Link>
                          ) : (
                            <span className="doc-paso pendiente" title="Aún no se genera">
                              <span className="ic" aria-hidden="true" />{d.corto}
                            </span>
                          )
                        )}
                        {p === "conformidad" && dd.nea && (
                          <>
                            <i className="doc-sep ok" aria-hidden="true" />
                            <Link className="doc-paso" href={`/almacen/nea/${dd.nea.id}`} title="Ver la nota de entrada a almacén">
                              <span className="ic" aria-hidden="true">✓</span>Almacén<span className="doc-num">{dd.nea.texto}</span>
                            </Link>
                          </>
                        )}
                        {p === "comprobante" && dd.hayCp && (
                          <span className={`doc-cheque${dd.cheque ? "" : " sin"}`} title={dd.cheque ? "Cheque con el que se pagó" : "Aún sin número de cheque"}>
                            {dd.cheque ? `Cheque ${dd.cheque}` : "Sin cheque"}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                {(() => {
                  const caja = cajaDe.get(e.id);
                  const esCaja = e.tipo === "caja_chica" || /caja chica/i.test(e.descripcion);
                  if (caja) {
                    return (
                      <Link className={`caja-enlace${caja.estado === "liquidada" ? " cerrada" : ""}`} href={`/caja-chica?mes=${caja.periodo}&fuente=${caja.fuente_id}&caja=${caja.id}`} title="Abrir esta caja chica">
                        ▣ ENLAZADO A CAJA CHICA · {nombrePeriodo(caja.periodo).split(" ")[0].toUpperCase()} {caja.periodo.slice(0, 4)} · {caja.estado === "liquidada" ? "CERRADA" : "ABIERTA"}
                      </Link>
                    );
                  }
                  if (esCaja && e.estado !== "anulado") return <span className="caja-enlace sin" title="Este expediente es de caja chica pero aún no abre ninguna caja">⚠ SIN ENLAZAR A CAJA CHICA</span>;
                  return null;
                })()}
              </div>
              <div className="f-monto">
                S/ {soles(e.monto)}
                <small><Estado valor={e.estado} /></small>
              </div>
              <div className="f-acc">
                <Link className="btn chico primario" href={`/expedientes/${e.id}`}>Abrir</Link>
                {puedeAnular(e) && (
                  <Motivo
                    chico
                    pin
                    accion={anularExpedienteTotal}
                    boton="Anular"
                    titulo={`Anular el expediente ${num3(e.numero)}-${e.anio}`}
                    ayuda="Motivo de la anulación (mínimo 10 letras). Si ya tiene comprobante de pago o NEA, también se anulan. No se borra nada."
                    campos={{ id: e.id, volver_a: enlace({}) }}
                  />
                )}
              </div>
            </div>
          );
        })}
        {filas.length > 0 && (
          <div className="pie-filas">
            <span>
              Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(filas.length, pagina * POR_PAGINA)} de {filas.length} expediente(s){estado || tipo || q ? " con este filtro" : ""}
            </span>
            <span>Total vigente S/ {soles(totalLista)}</span>
          </div>
        )}
        {totalPaginas > 1 && (
          <nav className="paginas" aria-label="Páginas de expedientes">
            {pagina > 1 && <Link className="pag" href={enlace({ pag: String(pagina - 1) })}>‹ Anterior</Link>}
            {numeros.map((n, i) => (
              <span key={n} className="pag-grupo">
                {i > 0 && n - numeros[i - 1] > 1 && <span className="pag-puntos">…</span>}
                <Link className={`pag${n === pagina ? " activa" : ""}`} href={enlace({ pag: String(n) })} aria-current={n === pagina ? "page" : undefined}>{n}</Link>
              </span>
            ))}
            {pagina < totalPaginas && <Link className="pag" href={enlace({ pag: String(pagina + 1) })}>Siguiente ›</Link>}
          </nav>
        )}
      </div>
      <p className="pequeno tenue" style={{ margin: 0 }}>Nada se elimina: los expedientes se anulan con motivo y quedan en el historial.</p>
    </>
  );
}
