import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import { RUBROS_INGRESO } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, hoyISO, nombrePeriodo, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { emitirRecibo } from "./acciones";

const RUBRO = Object.fromEntries(RUBROS_INGRESO.map((r) => [r.codigo, r.nombre]));

export default async function Ingresos({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = sp.mes ?? periodoActual();
  const { desde, hasta } = rangoPeriodo(periodo);
  const { data } = await supabase
    .from("ingresos")
    .select("*")
    .eq("mcp_id", ctx.mcp.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("numero", { ascending: false });
  const filas = data ?? [];
  const vigentes = filas.filter((f) => f.estado !== "anulado");
  const total = vigentes.reduce((s, f) => s + Number(f.monto), 0);
  const porRubro = new Map<string, number>();
  vigentes.forEach((f) => porRubro.set(f.rubro, (porRubro.get(f.rubro) ?? 0) + Number(f.monto)));

  return (
    <>
      <div className="titulo-ventana"><h1>Ingresos propios · {nombrePeriodo(periodo)}</h1></div>
      <Avisos ok={sp.ok} error={sp.error} />
      <form className="barra" method="get">
        <label className="campo">Mes<input type="month" name="mes" defaultValue={periodo} /></label>
        <button className="btn" type="submit">Ver</button>
      </form>
      <div className="columnas">
        <div className="principal">
          <div className="tabla-marco">
            <table className="tabla" style={{ minWidth: 820 }}>
              <thead>
                <tr><th>N° recibo</th><th>Fecha</th><th>Rubro</th><th>Concepto</th><th>Pagador</th><th>Estado</th><th className="num">Monto S/</th></tr>
              </thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={7} className="tenue">No hay recibos este mes.</td></tr>}
                {filas.map((r) => (
                  <tr key={r.id} className={r.estado === "anulado" ? "anulado" : undefined}>
                    <td><Link href={`/ingresos/${r.id}`}>{String(r.numero).padStart(4, "0")}</Link></td>
                    <td>{fecha(r.fecha)}</td>
                    <td>{RUBRO[r.rubro]}</td>
                    <td className="envolver tachar">
                      {r.concepto}
                      {r.estado === "anulado" && <div className="pequeno">Motivo: {r.anulado_motivo}</div>}
                    </td>
                    <td>{r.pagador_nombre}</td>
                    <td><Estado valor={r.estado} /></td>
                    <td className="num tachar">{soles(r.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6}>Total vigente</td><td className="num">{soles(total)}</td></tr></tfoot>
            </table>
          </div>
          {tiene(ctx, "admin", "tesorero", "contador") && (
            <form action={emitirRecibo} className="panel">
              <div className="panel-cab">Nuevo recibo de ingreso</div>
              <div className="panel-cuerpo rejilla">
                <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
                <label className="campo">
                  Rubro
                  <select name="rubro" defaultValue="servicio">
                    {RUBROS_INGRESO.map((r) => (
                      <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="campo">DNI o RUC<input name="pagador_doc" inputMode="numeric" /></label>
                <label className="campo">Nombre del pagador<input name="pagador_nombre" required /></label>
                <label className="campo ancho">Concepto<input name="concepto" required placeholder="Tipeo, copias e impresión" /></label>
                <label className="campo">Monto S/<input name="monto" required inputMode="decimal" /></label>
                <div style={{ display: "flex", alignItems: "flex-end" }}><button className="btn primario" type="submit">Emitir recibo</button></div>
              </div>
            </form>
          )}
        </div>
        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">Resumen del mes</div>
            <table className="tabla">
              <tbody>
                {[...porRubro].map(([r, v]) => (
                  <tr key={r}><td>{RUBRO[r]}</td><td className="num">{soles(v)}</td></tr>
                ))}
                <tr style={{ fontWeight: 600 }}><td>Total</td><td className="num">{soles(total)}</td></tr>
              </tbody>
            </table>
          </section>
          <section className="panel">
            <div className="panel-cab">Reglas</div>
            <div className="panel-cuerpo">
              <ul className="lista-reglas">
                <li>El número del recibo lo pone el sistema.</li>
                <li>Un recibo emitido no se edita: se anula con motivo y se emite otro.</li>
                <li>Estos ingresos salen en la rendición como recursos directamente recaudados.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
