import Link from "next/link";
import BotonPdf from "@/components/BotonPdf";
import { hojasBalance } from "@/lib/balanceAnual";
import { contextoMcp } from "@/lib/contexto";
import { hoyISO, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const fechaPe = (f: string) => f.split("-").reverse().join("/");

export default async function BalanceAnual({ searchParams }: { searchParams: Promise<{ anio?: string; hoja?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? Number(sp.anio) : Number(hoyISO().slice(0, 4));
  const hojas = await hojasBalance(ctx, supabase, anio);
  const h = hojas.find((x) => x.clave === sp.hoja) ?? hojas[4];
  const enlace = (clave: string, a = anio) => `/contabilidad/balance-anual?anio=${a}&hoja=${clave}`;
  const nCols = h.columnas.length;
  const monto = (i: number) => h.columnas[i]?.tipo === "monto";

  return (
    <>
      <div className="cab-vista no-imprimir">
        <div>
          <h1>Balance anual</h1>
          <div className="sub">Se arma solo con lo registrado en {anio}</div>
        </div>
        <span className="espacio" />
        <div className="cc-anio">
          <Link className="cc-flecha" href={enlace(h.clave, anio - 1)} aria-label={`Año ${anio - 1}`}>‹</Link>
          <b>{anio}</b>
          <Link className="cc-flecha" href={enlace(h.clave, anio + 1)} aria-label={`Año ${anio + 1}`}>›</Link>
        </div>
        <a className="btn contorno" href={`/exportar/balance-anual?anio=${anio}`}>Descargar Excel (todas las hojas)</a>
        <BotonPdf nombre={`${h.pestana} ${anio}`} selector=".bal-hoja" texto="Descargar PDF" className="btn primario" horizontal />
      </div>

      <nav className="cfg-tabs no-imprimir" role="tablist" aria-label="Hojas del balance">
        {hojas.map((x) => (
          <Link key={x.clave} role="tab" aria-selected={x.clave === h.clave} className={`cfg-tab${x.clave === h.clave ? " activa" : ""}`} href={enlace(x.clave)}>{x.pestana}</Link>
        ))}
      </nav>

      <div className="rep-marco">
        <div className="hoja bal-hoja bal-ancha">
          <header className="rep-cab">
            <b>{ctx.mcp.nombre.toUpperCase()}</b>
            <span>{ctx.mcp.ruc ? `RUC ${ctx.mcp.ruc}` : ""}</span>
            <h2>{h.titulo}</h2>
          </header>
          <table className="rep-tabla">
            <thead>
              {h.grupos && (
                <tr>{h.grupos.map((g, i) => <th key={i} colSpan={g.hasta - g.desde + 1} style={{ textAlign: "center" }}>{g.titulo}</th>)}</tr>
              )}
              <tr>{h.columnas.map((c, i) => <th key={i} className={c.tipo === "monto" ? "d" : undefined}>{c.titulo}</th>)}</tr>
            </thead>
            <tbody>
              {h.filas.map((f, i) =>
                f.tipo === "grupo" ? (
                  <tr key={i} className="bal-titulo"><td colSpan={nCols}>{f.celdas[0]}</td></tr>
                ) : (
                  <tr key={i} className={f.tipo === "total" ? "bal-total" : f.tipo === "destacado" ? "bal-dest" : undefined}>
                    {f.celdas.map((v, j) => (
                      <td key={j} className={monto(j) ? "d" : undefined}>{v === null || v === "" ? "" : typeof v === "number" && monto(j) ? soles(v) : v}</td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {h.nota && <p className={`bal-cuadre${h.nota.startsWith("⚠") ? "" : " ok"}`}>{h.nota}</p>}
          <footer className="rep-pie">Emitido el {fechaPe(hoyISO())}</footer>
        </div>
      </div>
    </>
  );
}
