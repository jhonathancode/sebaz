import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import SelectorRendicion, { type FilaCP } from "@/components/SelectorRendicion";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, nombrePeriodo, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { generarRendicion } from "./acciones";

export default async function Rendicion({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = sp.mes ?? periodoActual();
  const municipalidades = ctx.fuentes.filter((f) => f.tipo !== "propios");
  const propios = ctx.fuentes.find((f) => f.tipo === "propios");
  const fuente = municipalidades.find((f) => f.id === sp.fuente) ?? municipalidades.find((f) => f.tipo === "distrito") ?? municipalidades[0];

  if (!fuente) {
    return <div className="aviso info">La MCP no tiene municipalidades que transfieren configuradas. Pida a soporte que las registre.</div>;
  }

  const { hasta } = rangoPeriodo(periodo);
  // De una sola vez: rendiciones del mes y comprobantes pendientes de todas las municipalidades
  const [{ data: delMes }, { data: cps }] = await Promise.all([
    supabase.from("rendiciones").select("id, numero, anio, estado, transferencia, fuente_id, creado_en").eq("mcp_id", ctx.mcp.id).eq("periodo", periodo).neq("estado", "anulada"),
    supabase
      .from("comprobantes_pago")
      .select("id, numero, origen, fecha, beneficiario, concepto, importe, cheque, estado, fuente_id")
      .eq("mcp_id", ctx.mcp.id)
      .in("fuente_id", [...municipalidades.map((f) => f.id), ...(propios ? [propios.id] : [])])
      .in("estado", ["borrador", "aprobado"])
      .lte("fecha", hasta)
      .order("fecha"),
  ]);
  const vigente = (delMes ?? []).find((r) => r.fuente_id === fuente.id) ?? null;
  const resumen = municipalidades.map((f) => {
    const r = (delMes ?? []).find((x) => x.fuente_id === f.id);
    const listos = (cps ?? []).filter((c) => c.fuente_id === f.id && c.estado === "aprobado" && c.cheque).reduce((s, c) => s + Number(c.importe), 0);
    return { f, r, listos, pct: Number(f.monto_mensual) ? Math.min(100, Math.round((listos / Number(f.monto_mensual)) * 100)) : 0 };
  });

  let filas: FilaCP[] = [];
  if (!vigente) {
    filas = (cps ?? [])
      .filter((c) => c.fuente_id === fuente.id || c.fuente_id === propios?.id)
      .map((c) => {
        const motivo = c.estado !== "aprobado" ? "Falta aprobar" : !c.cheque ? "Falta el cheque" : undefined;
        return {
          id: c.id,
          codigo: codigoCP(c.numero, c.origen),
          fecha: fecha(c.fecha),
          beneficiario: c.beneficiario,
          concepto: c.concepto,
          cheque: c.cheque,
          importe: Number(c.importe),
          disponible: !motivo,
          motivo,
          propio: c.fuente_id === propios?.id,
        };
      });
  }

  const { data: anteriores } = await supabase
    .from("rendiciones")
    .select("id, numero, anio, periodo, estado, transferencia, fuentes(municipalidad), rendicion_items(activo, comprobantes_pago(importe))")
    .eq("mcp_id", ctx.mcp.id)
    .order("creado_en", { ascending: false })
    .limit(12);

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Rendición de {nombrePeriodo(periodo)}</h1>
          <div className="sub">
            Formato {fuente.formato === "perene" ? "Perené: informe de gestión, capítulos I y II" : fuente.formato === "chanchamayo" ? "Chanchamayo: ingresos por rubro y gastos por función" : "general"}
          </div>
        </div>
        <form className="selector-mes" method="get">
          <input type="hidden" name="fuente" value={fuente.id} />
          <input type="month" name="mes" defaultValue={periodo} aria-label="Mes a rendir" />
          <button className="btn chico" type="submit">Ver</button>
        </form>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="muni-tabs" role="tablist" aria-label="Municipalidad que transfiere">
        {resumen.map(({ f, r, listos, pct }) => (
          <Link key={f.id} role="tab" aria-selected={f.id === fuente.id} className={`muni-tab${f.id === fuente.id ? " activo" : ""}`} href={`/rendicion?mes=${periodo}&fuente=${f.id}`}>
            <div className="m-cab">
              <span className="m-nom">{f.tipo === "distrito" ? "Distrito" : "Provincia"} · {f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")}</span>
              <span className="m-monto">S/ {soles(f.monto_mensual)}</span>
            </div>
            <div className="k-barra"><div style={{ width: `${r ? 100 : pct}%` }} /></div>
            <span className="m-det">
              {r ? <>Rendición {String(r.numero).padStart(3, "0")}-{r.anio} generada <Estado valor={r.estado} /></> : `Listo con cheque S/ ${soles(listos)} · ${pct} %`}
            </span>
          </Link>
        ))}
      </div>

      {vigente ? (
        <div className="kpi azul" style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <span className="k-et">Rendición N° {String(vigente.numero).padStart(3, "0")}-{vigente.anio}</span>
            <span className="k-val">S/ {soles(vigente.transferencia)}</span>
            <span className="k-det">Ya está generada para este mes. Ábrala para imprimir o descargar el informe.</span>
          </div>
          <Estado valor={vigente.estado} />
          <Link className="btn primario grande" href={`/rendicion/${vigente.id}`}>Ver el informe</Link>
        </div>
      ) : (
        <SelectorRendicion
          filas={filas}
          transferencia={Number(fuente.monto_mensual)}
          municipalidad={fuente.municipalidad}
          accion={generarRendicion}
          ocultos={{ periodo, fuente_id: fuente.id }}
          puedeGenerar={tiene(ctx, "admin", "tesorero")}
        />
      )}

      <section className="panel">
        <div className="panel-cab">Rendiciones anteriores</div>
        <div className="tabla-marco" style={{ border: "none" }}>
          <table className="tabla" style={{ minWidth: 720 }}>
            <thead><tr><th>N°</th><th>Mes</th><th>Municipalidad</th><th className="num">Transferido</th><th className="num">Rendido</th><th>Estado</th></tr></thead>
            <tbody>
              {(anteriores ?? []).length === 0 && <tr><td colSpan={6} className="tenue">Aún no hay rendiciones.</td></tr>}
              {(anteriores ?? []).map((r) => {
                const items = r.rendicion_items as unknown as { activo: boolean; comprobantes_pago: { importe: number } | null }[];
                const rendido = items.filter((i) => i.activo || r.estado === "anulada").reduce((s, i) => s + Number(i.comprobantes_pago?.importe ?? 0), 0);
                return (
                  <tr key={r.id} className={r.estado === "anulada" ? "anulado" : undefined}>
                    <td><Link href={`/rendicion/${r.id}`}>{String(r.numero).padStart(3, "0")}-{r.anio}</Link></td>
                    <td>{nombrePeriodo(r.periodo)}</td>
                    <td>{(r.fuentes as unknown as { municipalidad: string } | null)?.municipalidad}</td>
                    <td className="num">{soles(r.transferencia)}</td>
                    <td className="num">{soles(rendido)}</td>
                    <td><Estado valor={r.estado} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
