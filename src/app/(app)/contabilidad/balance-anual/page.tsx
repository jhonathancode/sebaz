import Link from "next/link";
import Avisos from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import BotonPdf from "@/components/BotonPdf";
import { hojasBalance, type FormatoEF, type LineaEF } from "@/lib/balanceAnual";
import BotonImprimir from "@/components/BotonImprimir";
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
  const verApertura = !sp.hoja || sp.hoja === "apertura";
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
        {!verApertura && <BotonPdf nombre={`${h.pestana} ${anio}`} selector=".bal-hoja" texto="Descargar PDF" className="btn primario" horizontal={h.clave !== "ef2"} />}
        {!verApertura && <BotonImprimir texto="Imprimir" />}
      </div>

      <nav className="cfg-tabs no-imprimir" role="tablist" aria-label="Hojas del balance">
        <Link role="tab" aria-selected={verApertura} className={`cfg-tab${verApertura ? " activa" : ""}`} href={enlace("apertura")}>APERTURA</Link>
        {hojas.map((x) => (
          <Link key={x.clave} role="tab" aria-selected={!verApertura && x.clave === h.clave} className={`cfg-tab${!verApertura && x.clave === h.clave ? " activa" : ""}`} href={enlace(x.clave)}>{x.pestana}</Link>
        ))}
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

      {h.ef ? (
        <div className="rep-marco">
          <FormatoEFVista ef={h.ef} nombre={ctx.mcp.nombre} anio={anio} />
        </div>
      ) : (
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
              <tr>{h.columnas.map((c, i) => <th key={i} className={c.tipo === "monto" ? "d" : c.titulo === "N°" ? "bal-n" : undefined}>{c.titulo}</th>)}</tr>
            </thead>
            <tbody>
              {h.filas.map((f, i) =>
                f.tipo === "grupo" ? (
                  <tr key={i} className="bal-titulo"><td colSpan={nCols}>{f.celdas[0]}</td></tr>
                ) : (
                  <tr key={i} className={f.tipo === "total" ? "bal-total" : f.tipo === "destacado" ? "bal-dest" : f.tipo === "grupo4" ? "bal-cuenta" : undefined}>
                    {f.celdas.map((v, j) => (
                      <td key={j} className={monto(j) ? "d" : h.columnas[j]?.titulo === "N°" ? "bal-n" : undefined}>{v === null || v === "" ? "" : typeof v === "number" && monto(j) ? soles(v) : v}</td>
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
      )}
      </>
      )}
    </>
  );
}

const num = (n: number | undefined, neg: boolean) => {
  const v = n ?? 0;
  const t = soles(Math.abs(v));
  return v < 0 ? (neg ? `(S/. ${t})` : `-${t}`) : t;
};

function FilaEF({ l, ef }: { l: LineaEF; ef: FormatoEF }) {
  if (l.tipo === "esp") return <div className="ef-fila esp" />;
  if (l.tipo === "titulo") return <div className="ef-fila ef-tit"><span>{l.texto}</span></div>;
  if (l.tipo === "orden") return <div className="ef-fila ef-orden"><span>{l.texto}</span><i className="ef-caja ef-amarillo" /><i className="ef-caja ef-amarillo" /></div>;
  const negativos = ef.codigo === "EF-2";
  return (
    <div className={`ef-fila ef-${l.tipo}`}>
      <span>{l.texto}</span>
      <i className={`ef-caja${l.tipo === "total" || l.tipo === "gran" ? " ef-amarillo" : ""}`}>{l.texto === "" && !l.a ? "0.00" : num(l.a, negativos && l.tipo !== "gran")}</i>
      <i className={`ef-caja${l.tipo === "total" || l.tipo === "gran" ? " ef-amarillo" : ""}`}>{num(l.b, negativos && l.tipo !== "gran")}</i>
    </div>
  );
}

function Lado({ lineas, ef, anioPrimero }: { lineas: LineaEF[]; ef: FormatoEF; anioPrimero: number }) {
  const cuerpo = lineas.slice(0, -2);
  const pie = lineas.slice(-2);
  const cab = (
    <div className="ef-fila ef-anios"><span /><i className="ef-caja ef-amarillo">{ef.anios[0]}</i><i className="ef-caja ef-amarillo">{ef.anios[1]}</i></div>
  );
  return (
    <div className="ef-lado">
      {cuerpo.map((l, i) => (
        <div key={i} style={{ display: "contents" }}>
          <FilaEF l={l} ef={ef} />
          {i === anioPrimero && cab}
        </div>
      ))}
      <div className="ef-pie-lado">
        {pie.map((l, i) => <FilaEF key={i} l={l} ef={ef} />)}
      </div>
    </div>
  );
}

function FormatoEFVista({ ef, nombre, anio }: { ef: FormatoEF; nombre: string; anio: number }) {
  const mayus = nombre.toUpperCase();
  const dos = ef.der ? ef.codigo === "EF-1" : false;
  return (
    <div className={`hoja bal-hoja ef-hoja ${dos ? "ef-1" : "ef-2"}`}>
      <div className="ef-cab">
        <div className="ef-ent">{mayus.replace(/(CENTRO POBLADO)\s+/, "$1\n")}</div>
        <div className="ef-cod">{ef.codigo}</div>
      </div>
      <div className="ef-titulo">
        <b>{ef.titulo}</b>
        <span>{ef.codigo === "EF-1" ? `01 de Enero al 31 de Diciembre del ${anio}` : `Del 01 de Enero al 31 de Diciembre de ${anio}`}</span>
        <span>(EN SOLES, A VALORES HISTÓRICOS)</span>
      </div>
      <div className="ef-entidad">Entidad: {mayus}</div>
      {dos ? (
        <div className="ef-dos">
          <Lado lineas={ef.izq} ef={ef} anioPrimero={1} />
          <Lado lineas={ef.der!} ef={ef} anioPrimero={1} />
        </div>
      ) : (
        <div className="ef-uno">
          <div className="ef-fila ef-anios"><span /><i className="ef-caja ef-amarillo">{ef.anios[0]}</i><i className="ef-caja ef-amarillo">{ef.anios[1]}</i></div>
          {ef.izq.map((l, i) => <FilaEF key={i} l={l} ef={ef} />)}
        </div>
      )}
      <div className="ef-firmas">
        {ef.firmas.map((f) => <div key={f}><span /><small>{f}</small></div>)}
      </div>
    </div>
  );
}
