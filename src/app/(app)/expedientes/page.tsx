import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import CamposRequerimiento from "@/components/formularios/CamposRequerimiento";
import VentanaFlotante from "@/components/VentanaFlotante";
import Motivo from "@/components/Motivo";
import { contextoMcp, tiene } from "@/lib/contexto";
import { cargarCierres, estadoGestion } from "@/lib/gestion";
import { fecha, hoyISO, nombrePeriodo, num3, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
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
const TIPOS: Record<string, string> = { compra: "Compra de bienes", servicio: "Servicio externo", pago_fijo: "Pago fijo" };
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
  const periodo = sp.mes ?? periodoActual();
  const { desde, hasta } = rangoPeriodo(periodo);
  const estado = sp.estado ?? "";
  const tipo = sp.tipo ?? "";
  const q = sp.q ?? "";

  // Se traen todos los del mes (con búsqueda y tipo) para contar por estado; el estado se filtra aquí.
  let consulta = supabase
    .from("expedientes")
    .select("id, anio, numero, fecha, tipo, flujo_completo, descripcion, area_usuaria, fase, estado, expediente_items(total, anulado)")
    .eq("mcp_id", ctx.mcp.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("numero", { ascending: false });
  if (q) consulta = consulta.ilike("descripcion", `%${q}%`);
  if (tipo) consulta = consulta.eq("tipo", tipo);
  const anioNum = Number(hoyISO().slice(0, 4));
  const [{ data: lista }, pagosFijos, chequeSugerido, cierres, atajos, { data: provData }, { data: tesoreroMiembro }, nExp, nOrdC, nOrdS, nMemo, nNea, nCp] = await Promise.all([
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
  ]);

  const todos = (lista ?? []).map((e) => ({
    ...e,
    monto: (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
  }));
  const filas = estado ? todos.filter((e) => e.estado === estado) : todos;
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

  const enlace = (cambios: Record<string, string>) => {
    const p = new URLSearchParams({ mes: periodo, estado, tipo, q, ...cambios });
    [...p.keys()].forEach((k) => !p.get(k) && p.delete(k));
    return `/expedientes?${p.toString()}`;
  };

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Expedientes</h1>
          <div className="sub">Cada gasto, del requerimiento al comprobante de pago</div>
        </div>
        <form className="selector-mes" method="get">
          <input type="hidden" name="estado" value={estado} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="month" name="mes" defaultValue={periodo} aria-label="Mes" />
          <button className="btn chico" type="submit">Ver</button>
        </form>
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
          <span className="k-et">Gasto de {nombrePeriodo(periodo)}</span>
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
            <Link key={x.v} className={`f-chip${estado === x.v ? " activo" : ""}${x.v === "anulado" ? " rojo" : ""}`} href={enlace({ estado: x.v })}>
              {x.t} <span className="n">{cuenta(x.v)}</span>
            </Link>
          ))}
        </div>
        <div className="grupo" role="group" aria-label="Tipo">
          <span className="grupo-et">Tipo</span>
          {[["", "Todos"], ["compra", "Compra"], ["servicio", "Servicio"], ["pago_fijo", "Pago fijo"]].map(([v, t]) => (
            <Link key={v} className={`f-chip${tipo === v ? " activo" : ""}`} href={enlace({ tipo: v })}>{t}</Link>
          ))}
        </div>
        <form className="buscador" method="get" role="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="hidden" name="mes" value={periodo} />
          <input type="hidden" name="estado" value={estado} />
          <input type="hidden" name="tipo" value={tipo} />
          <input name="q" defaultValue={q} placeholder="Buscar por descripción…" aria-label="Buscar" />
          <button className="btn chico" type="submit">Buscar</button>
        </form>
      </div>

      <div className="filas">
        {filas.length === 0 && (
          <div className="vacio">
            {todos.length === 0 ? "No hay expedientes en este mes. Empiece con «+ Nuevo requerimiento»." : "Ningún expediente con ese filtro."}
          </div>
        )}
        {filas.map((e) => {
          const pasos =
            e.tipo !== "pago_fijo"
              ? ORDEN_FASES
              : (e as { flujo_completo?: boolean }).flujo_completo
                ? ["requerimiento", "orden", "conformidad", "comprobante"] // pago fijo con expediente completo: sin cotizaciones
                : ["requerimiento", "comprobante"];
          const hecho = e.estado === "rendido" ? pasos.length : Math.max(1, pasos.indexOf(e.fase) + 1);
          return (
            <div key={e.id} className={`fila${e.estado === "anulado" ? " anulada" : ""}`}>
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
                      </span>
                    );
                  })}
                </div>
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
            <span>{filas.length} expediente(s){estado || tipo || q ? " con este filtro" : ""}</span>
            <span>Total vigente S/ {soles(totalLista)}</span>
          </div>
        )}
      </div>
      <p className="pequeno tenue" style={{ margin: 0 }}>Nada se elimina: los expedientes se anulan con motivo y quedan en el historial.</p>
    </>
  );
}
