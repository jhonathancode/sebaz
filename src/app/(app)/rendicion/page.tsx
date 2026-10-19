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

  const { data: vigente } = await supabase
    .from("rendiciones")
    .select("id, numero, anio, estado, transferencia, creado_en")
    .eq("mcp_id", ctx.mcp.id)
    .eq("fuente_id", fuente.id)
    .eq("periodo", periodo)
    .neq("estado", "anulada")
    .maybeSingle();

  const { hasta } = rangoPeriodo(periodo);
  let filas: FilaCP[] = [];
  if (!vigente) {
    const { data: cps } = await supabase
      .from("comprobantes_pago")
      .select("id, numero, origen, fecha, beneficiario, concepto, importe, cheque, estado, fuente_id")
      .eq("mcp_id", ctx.mcp.id)
      .in("fuente_id", [fuente.id, ...(propios ? [propios.id] : [])])
      .in("estado", ["borrador", "aprobado"])
      .lte("fecha", hasta)
      .order("fecha");
    filas = (cps ?? []).map((c) => {
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
      <div className="titulo-ventana"><h1>Rendición · {nombrePeriodo(periodo)}</h1></div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="pestanas" role="tablist" aria-label="Municipalidad que transfiere">
        {municipalidades.map((f) => (
          <Link key={f.id} role="tab" aria-selected={f.id === fuente.id} className={f.id === fuente.id ? "activo" : undefined} href={`/rendicion?mes=${periodo}&fuente=${f.id}`}>
            {f.tipo === "distrito" ? "Distrito" : "Provincia"}: {f.municipalidad} · S/ {soles(f.monto_mensual)}
          </Link>
        ))}
      </div>
      <form className="barra" method="get">
        <input type="hidden" name="fuente" value={fuente.id} />
        <label className="campo">Mes a rendir<input type="month" name="mes" defaultValue={periodo} /></label>
        <button className="btn" type="submit">Ver</button>
        <span className="pequeno tenue" style={{ alignSelf: "center" }}>
          Formato: {fuente.formato === "perene" ? "Perené (informe de gestión, capítulos I y II)" : fuente.formato === "chanchamayo" ? "Chanchamayo (ingresos por rubro y gastos por función)" : "General"}
        </span>
      </form>

      {vigente ? (
        <div className="barra" style={{ alignItems: "center" }}>
          <b>Rendición N° {String(vigente.numero).padStart(3, "0")}-{vigente.anio}</b>
          <Estado valor={vigente.estado} />
          <span>Transferencia S/ {soles(vigente.transferencia)}</span>
          <span className="espacio" />
          <Link className="btn primario" href={`/rendicion/${vigente.id}`}>Ver e imprimir el informe</Link>
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
