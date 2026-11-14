import Link from "next/link";
import Avisos from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import BotonPdf from "@/components/BotonPdf";
import { hojasBalance } from "@/lib/balanceAnual";
import { contextoMcp, tiene } from "@/lib/contexto";
import { HOJAS } from "@/lib/planCuentas";
import { hoyISO, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { copiarCierreAnterior, guardarApertura } from "./acciones";

const fechaPe = (f: string) => f.split("-").reverse().join("/");

export default async function BalanceAnual({ searchParams }: { searchParams: Promise<{ anio?: string; hoja?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? Number(sp.anio) : Number(hoyISO().slice(0, 4));
  const hojas = await hojasBalance(ctx, supabase, anio);
  const verApertura = sp.hoja === "apertura";
  const h = hojas.find((x) => x.clave === sp.hoja) ?? hojas[4];
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const { data: apertura } = verApertura ? await supabase.from("saldos_apertura").select("cuenta, debe, haber").eq("mcp_id", ctx.mcp.id).eq("anio", anio).order("cuenta") : { data: [] as { cuenta: string; debe: number; haber: number }[] };
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
        <Link role="tab" aria-selected={verApertura} className={`cfg-tab${verApertura ? " activa" : ""}`} href={enlace("apertura")}>APERTURA</Link>
      </nav>
      <Avisos ok={sp.ok} error={sp.error} />

      {verApertura ? (
        <section className="panel">
          <div className="panel-cab">Apertura al 1 de enero de {anio}</div>
          <div className="panel-cuerpo">
            <p className="tenue pequeno" style={{ margin: 0 }}>Es el dinero y las deudas con que empezó el año, cuenta por cuenta (cuentas por cobrar, entregas a rendir, edificios, vehículos, cuentas por pagar, hacienda). El banco y la caja salen de «Datos contables → saldo inicial», y los resultados acumulados se calculan solos para que cuadre.</p>
            {puede && (
              <form action={copiarCierreAnterior}>
                <input type="hidden" name="anio" value={anio} />
                <BotonConfirmar className="btn contorno" pregunta={`¿Copiar el cierre de ${anio - 1} como apertura de ${anio}?`} detalle="Se anotan los saldos al 31 de diciembre del año anterior. Después puede corregir cualquier cuenta." textoConfirmar="Sí, copiar">
                  Copiar el cierre de {anio - 1}
                </BotonConfirmar>
              </form>
            )}
            {puede && (
              <form action={guardarApertura} className="ing-filtros" style={{ alignItems: "flex-end" }}>
                <input type="hidden" name="anio" value={anio} />
                <label className="campo" style={{ flex: "2 1 280px" }}>Cuenta
                  <select name="cuenta" required defaultValue="">
                    <option value="" disabled>Elija la cuenta…</option>
                    {HOJAS.filter((x) => /^(1|2|3201)/.test(x.codigo) && !x.codigo.startsWith("1101")).map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}
                  </select>
                </label>
                <label className="campo">Debe (deudor)<input name="debe" inputMode="decimal" placeholder="0.00" /></label>
                <label className="campo">Haber (acreedor)<input name="haber" inputMode="decimal" placeholder="0.00" /></label>
                <button className="btn primario" type="submit">Guardar</button>
              </form>
            )}
            <div className="tabla-marco">
              <table className="tabla">
                <thead><tr><th>Cuenta</th><th>Nombre</th><th className="num">Debe</th><th className="num">Haber</th></tr></thead>
                <tbody>
                  {(apertura ?? []).length === 0 && <tr><td colSpan={4} className="tenue">Aún no hay saldos de apertura anotados.</td></tr>}
                  {(apertura ?? []).map((x) => (
                    <tr key={x.cuenta}><td>{x.cuenta}</td><td>{HOJAS.find((y) => y.codigo === x.cuenta)?.nombre ?? ""}</td><td className="num">{soles(Number(x.debe))}</td><td className="num">{soles(Number(x.haber))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
      <>

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
                  <tr key={i} className={f.tipo === "total" ? "bal-total" : f.tipo === "destacado" ? "bal-dest" : f.tipo === "grupo4" ? "bal-cuenta" : undefined}>
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
      )}
    </>
  );
}
