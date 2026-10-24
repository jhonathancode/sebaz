import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { obtenerContexto } from "@/lib/contexto";
import { fecha, nombrePeriodo, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import Pestanas from "../Pestanas";

/** Todos los pagos de clientes de un mes. */
export default async function Pagos({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const mes = sp.mes ?? periodoActual();
  const { desde, hasta } = rangoPeriodo(mes);
  const { data: pagos } = await supabase
    .from("pagos_clientes")
    .select("*, mcps(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });
  const vigentes = (pagos ?? []).filter((p) => !p.anulado);
  const total = vigentes.reduce((s, p) => s + Number(p.monto), 0);

  return (
    <>
      <div className="cab-vista">
        <div><h1>Pagos de clientes</h1><div className="sub">{nombrePeriodo(mes)}</div></div>
        <form className="selector-mes" method="get"><input type="month" name="mes" defaultValue={mes} aria-label="Mes" /><button className="btn chico" type="submit">Ver</button></form>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <Pestanas activa="/superadmin/pagos" />
      <div className="kpis">
        <div className="kpi azul"><span className="k-et">Cobrado en {nombrePeriodo(mes)}</span><span className="k-val">S/ {soles(total)}</span><span className="k-det">{vigentes.length} pago(s)</span></div>
      </div>
      <div className="filas">
        {(pagos ?? []).length === 0 && <div className="vacio">Sin pagos en este mes. Los pagos se registran desde la ficha de cada cliente.</div>}
        {(pagos ?? []).map((p) => (
          <div key={p.id} className={`fila${p.anulado ? " anulada" : ""}`}>
            <div className="f-num">{fecha(p.fecha)}<small>{p.meses} mes(es)</small></div>
            <div className="f-desc">
              <Link href={`/superadmin/clientes/${p.mcp_id}`}>{(p.mcps as unknown as { nombre: string } | null)?.nombre}</Link>
              <div className="f-meta">
                <span className="etq">{p.medio}</span>
                <span>Cubre {fecha(p.desde)} al {fecha(p.hasta)}</span>
                {p.operacion && <span>Op. {p.operacion}</span>}
                {p.comprobante && <span>{p.comprobante}</span>}
              </div>
            </div>
            <div className="f-monto">S/ {soles(p.monto)}</div>
            <div className="f-acc"><Link className="btn chico contorno" href={`/superadmin/clientes/${p.mcp_id}`}>Cliente</Link></div>
          </div>
        ))}
      </div>
    </>
  );
}
