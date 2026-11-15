import Link from "next/link";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import { contextoMcp } from "@/lib/contexto";
import { FASES, faseGasto, indiceFase } from "@/lib/fasesGasto";
import { fecha, nombrePeriodo, num3, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

/** Los gastos del mes por fase (requerido, comprometido, devengado, girado, pagado), como lo ve el SIAF. */
export default async function FasesGasto({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : periodoActual();
  const { desde, hasta } = rangoPeriodo(mes);
  const { data: exps } = await supabase
    .from("expedientes")
    .select("id, numero, anio, fecha, descripcion, estado, expediente_items(total, anulado)")
    .eq("mcp_id", ctx.mcp.id).gte("fecha", desde).lte("fecha", hasta).order("numero");
  const ids = (exps ?? []).map((e) => e.id);
  const [{ data: ords }, { data: confs }, { data: cps }, { data: cobrados }] = ids.length
    ? await Promise.all([
        supabase.from("ordenes").select("expediente_id").in("expediente_id", ids).eq("anulado", false),
        supabase.from("conformidades").select("expediente_id").in("expediente_id", ids).eq("anulado", false),
        supabase.from("comprobantes_pago").select("id, expediente_id").in("expediente_id", ids).neq("estado", "anulado"),
        supabase.from("cheques_cobrados").select("comprobante_id").eq("anulado", false),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const conOrden = new Set((ords ?? []).map((x) => x.expediente_id));
  const conConf = new Set((confs ?? []).map((x) => x.expediente_id));
  const cpDe = new Map((cps ?? []).map((x) => [x.expediente_id, x.id]));
  const cobradoSet = new Set((cobrados ?? []).map((x) => x.comprobante_id));

  const filas = (exps ?? []).filter((e) => e.estado !== "anulado").map((e) => {
    const monto = (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0);
    const cp = cpDe.get(e.id);
    const fase = faseGasto({ estado: e.estado, aprobado: e.estado === "aprobado" || e.estado === "rendido", tieneOrden: conOrden.has(e.id), tieneConformidad: conConf.has(e.id), tieneComprobante: !!cp, conciliado: !!cp && cobradoSet.has(cp) });
    return { e, monto, fase: fase === "anulado" ? "requerido" as const : fase };
  });
  // Cada fase suma lo que ya llegó a ella o la pasó
  const resumen = FASES.map((f, i) => {
    const llegaron = filas.filter((x) => indiceFase(x.fase) >= i);
    return { ...f, n: llegaron.length, monto: llegaron.reduce((s, x) => s + x.monto, 0) };
  });
  const mesAnt = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 2, 1);
  const mesSig = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 1);
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return (
    <>
      <div className="titulo-ventana">
        <Link className="btn" href="/reportes">← Volver a reportes</Link>
        <h1>Fases del gasto · {nombrePeriodo(mes)}</h1>
        <span className="espacio" />
        <Link className="btn contorno chico" href={`/reportes/fases-gasto?mes=${ym(mesAnt)}`}>← Mes anterior</Link>
        <Link className="btn contorno chico" href={`/reportes/fases-gasto?mes=${ym(mesSig)}`}>Mes siguiente →</Link>
        <BotonPdf nombre={`Fases del gasto ${mes}`} className="btn primario" horizontal />
        <BotonImprimir texto="Imprimir" />
      </div>
      <div className="fases-resumen no-imprimir">
        {resumen.map((f, i) => (
          <div key={f.clave} className="fase-card" title={f.ayuda}>
            <span className="fase-num">{i + 1}</span>
            <b>{f.texto}</b>
            <span className="fase-monto">S/ {soles(f.monto)}</span>
            <small>{f.n} gasto(s)</small>
          </div>
        ))}
      </div>
      <p className="pequeno tenue no-imprimir" style={{ margin: "6px 0 14px" }}>Cada fase suma lo que ya llegó a ella o la pasó: lo pagado también cuenta como girado, devengado y comprometido.</p>
      <div className="hoja">
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>EJECUCIÓN DEL GASTO POR FASES · {nombrePeriodo(mes).toUpperCase()}</div>
          <div>{ctx.mcp.nombre.toUpperCase()}</div>
        </div>
        <table className="formato">
          <thead><tr><th>N°</th><th>Fecha</th><th>Descripción</th><th className="num">Monto S/</th>{FASES.map((f) => <th key={f.clave} style={{ textAlign: "center" }}>{f.texto}</th>)}</tr></thead>
          <tbody>
            {filas.map(({ e, monto, fase }) => (
              <tr key={e.id}>
                <td>{num3(e.numero)}-{e.anio}</td><td>{fecha(e.fecha)}</td><td>{e.descripcion}</td><td className="num">{soles(monto)}</td>
                {FASES.map((f, i) => <td key={f.clave} style={{ textAlign: "center" }}>{indiceFase(fase) >= i ? "✓" : ""}</td>)}
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={9}>No hay gastos en este mes.</td></tr>}
            <tr><th colSpan={3}>TOTAL DEL MES</th><th className="num">{soles(filas.reduce((s, x) => s + x.monto, 0))}</th><th colSpan={5} />
            </tr>
            {resumen.map((f) => <tr key={f.clave}><td colSpan={3}>Total {f.texto.toLowerCase()}</td><td className="num">{soles(f.monto)}</td><td colSpan={5} /></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
