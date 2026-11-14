import Link from "next/link";
import BotonPdf from "@/components/BotonPdf";
import { contextoMcp } from "@/lib/contexto";
import { balanceAnual, cargarContabilidad } from "@/lib/contabilidad";
import { fecha, hoyISO, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function BalanceAnual({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? Number(sp.anio) : Number(hoyISO().slice(0, 4));
  const d = await cargarContabilidad(supabase, ctx.mcp.id, anio, ctx.fuentes);
  if (d.faltaActualizacion) return <div className="aviso error">La contabilidad aún no está activa: falta la actualización de la base de datos. Avise a soporte.</div>;
  const b = balanceAnual(d);
  return (
    <>
      <div className="cab-vista no-imprimir">
        <div>
          <h1>Balance anual</h1>
          <div className="sub">Se arma solo con lo registrado en {anio}</div>
        </div>
        <span className="espacio" />
        <div className="cc-anio">
          <Link className="cc-flecha" href={`/contabilidad/balance-anual?anio=${anio - 1}`} aria-label={`Año ${anio - 1}`}>‹</Link>
          <b>{anio}</b>
          <Link className="cc-flecha" href={`/contabilidad/balance-anual?anio=${anio + 1}`} aria-label={`Año ${anio + 1}`}>›</Link>
        </div>
        <a className="btn contorno" href={`/exportar/contabilidad?ver=balance&mes=${anio}-12`}>Descargar Excel</a>
        <BotonPdf nombre={`Balance anual ${anio}`} selector=".bal-hoja" texto="Descargar PDF" className="btn primario" />
      </div>
          {!d.hayDatosIniciales && (
            <div className="aviso alerta aviso-accion"><span>Falta el <b>saldo inicial {anio}</b>; sin él el activo no refleja el dinero con que empezó el año.</span><Link className="btn chico primario" href="/contabilidad?ver=datos">Completar datos</Link></div>
          )}
          <div className="bal-kpis no-imprimir">
            <div className="kpi azul"><span className="k-et">Ingresos {anio}</span><span className="k-val">S/ {soles(b.totalIngresos)}</span></div>
            <div className="kpi"><span className="k-et">Gastos {anio}</span><span className="k-val">S/ {soles(b.totalGastos)}</span></div>
            <div className={`kpi${b.resultado < 0 ? " alerta" : ""}`}><span className="k-et">{b.resultado >= 0 ? "Superávit" : "Déficit"}</span><span className="k-val">S/ {soles(Math.abs(b.resultado))}</span></div>
            <div className="kpi"><span className="k-et">Bancos + caja</span><span className="k-val">S/ {soles(b.activo)}</span></div>
          </div>
          <div className="hoja bal-hoja">
            <header className="rep-cab"><b>{ctx.mcp.nombre.toUpperCase()}</b><span>{ctx.mcp.ruc ? `RUC ${ctx.mcp.ruc}` : ""}</span><h2>BALANCE ANUAL {anio}</h2></header>
            <table className="rep-tabla">
              <tbody>
                {b.lineas.map((x, i) =>
                  x.tipo === "titulo" ? (
                    <tr key={i} className="bal-titulo"><td colSpan={2}>{x.texto}</td></tr>
                  ) : (
                    <tr key={i} className={x.tipo === "total" ? "bal-total" : x.tipo === "destacado" ? "bal-dest" : undefined}>
                      <td>{x.texto}</td>
                      <td className="d">{soles(x.monto ?? 0)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p className={`bal-cuadre${b.cuadra ? " ok" : ""}`}>{b.cuadra ? "✓ El balance cuadra: activo = pasivo + patrimonio." : "⚠ El balance no cuadra; revise los datos contables."}</p>
            {b.transito > 0 && <p className="pequeno tenue" style={{ margin: "4px 0 0" }}>Hay S/ {soles(b.transito)} en cheques girados que el banco aún no cobra al cierre (ya están descontados de Bancos).</p>}
            <footer className="rep-pie">Emitido el {fecha(hoyISO())}</footer>
          </div>
    </>
  );
}

