import Link from "next/link";
import { notFound } from "next/navigation";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import { contextoMcp } from "@/lib/contexto";
import { reportePorClave } from "@/lib/catalogoReportes";
import { hoyISO, periodoActual, soles } from "@/lib/formato";
import { tieneModulo } from "@/lib/modulos";
import { construirHoja } from "@/lib/reportes";
import { supabaseServidor } from "@/lib/supabase/server";

const fechaPe = (f: string) => f.split("-").reverse().join("/");
const cantidad = (n: number) => new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(n);

export default async function VerReporte({ params, searchParams }: { params: Promise<{ clave: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { clave } = await params;
  const sp = await searchParams;
  const r = reportePorClave(clave);
  if (!r) notFound();
  const ctx = await contextoMcp();
  if (r.modulo && !(r.modulo === "registro_civil" || r.modulo === "secretaria" ? ctx.mcp.modulos?.includes(r.modulo) : tieneModulo(ctx.mcp, r.modulo))) notFound();

  const hoy = hoyISO();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : periodoActual();
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? sp.anio! : hoy.slice(0, 4);
  const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const estado = r.estados?.some((e) => e.v === sp.estado) ? sp.estado! : "";
  const tipo = r.tipos?.some((t) => t.v === sp.tipo) ? sp.tipo! : "";

  // Parámetros que entienden la pantalla, el Excel y el PDF
  const qs = new URLSearchParams(r.fijo ?? {});
  if (r.periodo === "mes") {
    if (esFecha(sp.desde) && esFecha(sp.hasta)) { qs.set("mes", sp.desde!.slice(0, 7)); qs.set("desde", sp.desde!); qs.set("hasta", sp.hasta!); }
    else qs.set("mes", mes);
  } else if (r.periodo === "anio") {
    qs.set("mes", `${anio}-01`); qs.set("desde", `${anio}-01-01`); qs.set("hasta", `${anio}-12-31`);
  } else if (r.periodo === "rango") {
    if (esFecha(sp.desde)) qs.set("desde", sp.desde!);
    if (esFecha(sp.hasta)) qs.set("hasta", sp.hasta!);
  }
  if (estado) qs.set("estado", estado);
  if (tipo) qs.set("tipo", tipo);

  const supabase = await supabaseServidor();
  const res = await construirHoja(r.lista, ctx, supabase, qs);
  if ("error" in res) notFound();
  const hoja = res;
  const filas = hoja.filas;
  const excel = `/exportar/${r.lista}?${qs.toString()}`;
  const archivo = `${r.titulo} ${r.periodo === "anio" ? anio : r.periodo === "mes" ? qs.get("mes") : ""}`.trim();
  const celda = (v: string | number | null, t?: string) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number" && t === "monto") return soles(v);
    if (typeof v === "number" && t === "cantidad") return cantidad(v);
    return String(v);
  };

  return (
    <>
      <nav className="sec-ruta no-imprimir" aria-label="Ubicación"><Link href="/reportes">Reportes</Link><span>›</span><b>{r.titulo}</b></nav>
      <div className="titulo-ventana no-imprimir">
        <h1>{r.titulo}</h1>
        <span className="espacio" />
        <a className="btn" href={excel}>Descargar Excel</a>
        <BotonPdf nombre={archivo} selector=".rep-hoja" texto="Descargar PDF" className="btn primario" horizontal />
        <BotonImprimir texto="Imprimir" />
      </div>

      <form className="ing-filtros rep-filtros no-imprimir" method="get">
        {r.periodo === "mes" && (
          <>
            <label className="campo">Mes<input type="month" name="mes" defaultValue={qs.get("mes") ?? mes} /></label>
            <label className="campo">o del<input type="date" name="desde" defaultValue={sp.desde ?? ""} /></label>
            <label className="campo">al<input type="date" name="hasta" defaultValue={sp.hasta ?? ""} /></label>
          </>
        )}
        {r.periodo === "anio" && <label className="campo">Año<input type="number" name="anio" min={2000} max={2100} defaultValue={anio} /></label>}
        {r.periodo === "rango" && (
          <>
            <label className="campo">Fecha del acto, desde<input type="date" name="desde" defaultValue={sp.desde ?? ""} /></label>
            <label className="campo">hasta<input type="date" name="hasta" defaultValue={sp.hasta ?? ""} /></label>
          </>
        )}
        {r.tipos && (
          <label className="campo">{r.nombreTipo ?? "Tipo"}
            <select name="tipo" defaultValue={tipo}><option value="">Todos</option>{r.tipos.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}</select>
          </label>
        )}
        {r.estados && (
          <label className="campo">Estado
            <select name="estado" defaultValue={estado}><option value="">Todos</option>{r.estados.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}</select>
          </label>
        )}
        <button className="btn" type="submit">Ver reporte</button>
      </form>

      <div className="rep-marco">
        <div className="hoja rep-hoja">
          <header className="rep-cab">
            <b>{ctx.mcp.nombre.toUpperCase()}</b>
            <span>{ctx.mcp.ruc ? `RUC ${ctx.mcp.ruc}` : ""}</span>
            <h2>{hoja.titulo}</h2>
          </header>
          <table className="rep-tabla">
            <thead>
              <tr>{hoja.columnas.map((c) => <th key={c.titulo} className={c.tipo === "monto" || c.tipo === "cantidad" ? "d" : undefined}>{c.titulo}</th>)}</tr>
            </thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={hoja.columnas.length} className="rep-vacio">No hay datos para el período elegido.</td></tr>}
              {filas.map((f, i) => (
                <tr key={i}>{f.map((v, j) => { const t = hoja.columnas[j]?.tipo; return <td key={j} className={t === "monto" || t === "cantidad" ? "d" : undefined}>{celda(v, t)}</td>; })}</tr>
              ))}
            </tbody>
            {hoja.totales && filas.length > 0 && (
              <tfoot>
                <tr>{hoja.totales.map((v, j) => { const t = hoja.columnas[j]?.tipo; return <td key={j} className={t === "monto" || t === "cantidad" ? "d" : undefined}>{celda(v, t)}</td>; })}</tr>
              </tfoot>
            )}
          </table>
          <footer className="rep-pie">Emitido el {fechaPe(hoy)} · {filas.length} {filas.length === 1 ? "fila" : "filas"}</footer>
        </div>
      </div>
    </>
  );
}
