import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import VentanaFlotante from "@/components/VentanaFlotante";
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
  const [{ data }, { data: ultimo }] = await Promise.all([
    supabase.from("ingresos").select("*").eq("mcp_id", ctx.mcp.id).gte("fecha", desde).lte("fecha", hasta).order("numero", { ascending: false }),
    supabase.from("ingresos").select("numero, anio").eq("mcp_id", ctx.mcp.id).order("anio", { ascending: false }).order("numero", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const delMes = data ?? [];
  const vigentes = delMes.filter((f) => f.estado !== "anulado");
  const total = vigentes.reduce((s, f) => s + Number(f.monto), 0);
  const anulados = delMes.length - vigentes.length;
  const porRubro = RUBROS_INGRESO.map((r) => ({
    ...r,
    total: vigentes.filter((f) => f.rubro === r.codigo).reduce((s, f) => s + Number(f.monto), 0),
    n: vigentes.filter((f) => f.rubro === r.codigo).length,
  })).filter((r) => r.n > 0);
  const maximo = Math.max(1, ...porRubro.map((r) => r.total));

  const q = (sp.q ?? "").toLowerCase();
  const filas = delMes.filter(
    (f) =>
      (!sp.rubro || f.rubro === sp.rubro) &&
      (!sp.estado || f.estado === sp.estado) &&
      (!q || `${f.pagador_nombre} ${f.concepto} ${f.pagador_doc ?? ""} ${f.numero}`.toLowerCase().includes(q)),
  );
  const siguiente = ultimo ? (ultimo.anio === Number(periodo.slice(0, 4)) ? ultimo.numero + 1 : 1) : 1;
  const puede = tiene(ctx, "admin", "tesorero", "contador");

  return (
    <>
      <div className="titulo-ventana">
        <h1>Ingresos propios · {nombrePeriodo(periodo)}</h1>
        <span className="espacio" />
        {puede && (
          <VentanaFlotante boton="Nuevo recibo de ingreso" titulo={`Nuevo recibo de ingreso · N° ${String(siguiente).padStart(4, "0")}`} accion={emitirRecibo} textoGuardar="Emitir recibo" abierta={sp.nuevo === "1"}>
            <div className="rejilla">
              <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
              <label className="campo">
                Rubro
                <select name="rubro" defaultValue="servicio">
                  {RUBROS_INGRESO.map((r) => (
                    <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="campo">DNI o RUC del pagador<input name="pagador_doc" inputMode="numeric" maxLength={11} placeholder="8 u 11 dígitos" /></label>
              <label className="campo">Nombre o razón social<input name="pagador_nombre" required /></label>
              <label className="campo ancho">Concepto<input name="concepto" required placeholder="Tipeo, copias e impresión de documentos" /></label>
              <label className="campo">Monto S/<input name="monto" required inputMode="decimal" placeholder="0.00" /></label>
            </div>
            <p className="pequeno tenue" style={{ margin: 0 }}>
              El número lo pone el sistema. Un recibo emitido no se edita: si hay un error, se anula con motivo y se emite otro.
            </p>
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="tarjetas">
        <div className="tarjeta">
          <span className="etiqueta">Total del mes</span>
          <span className="valor">S/ {soles(total)}</span>
          <span className="detalle">Recursos directamente recaudados</span>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">Recibos emitidos</span>
          <span className="valor">{vigentes.length}</span>
          <span className="detalle">{anulados ? `${anulados} anulado(s) con motivo` : "Ninguno anulado"}</span>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">Promedio por recibo</span>
          <span className="valor">S/ {soles(vigentes.length ? total / vigentes.length : 0)}</span>
          <span className="detalle">En {nombrePeriodo(periodo)}</span>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">Siguiente recibo</span>
          <span className="valor">N° {String(siguiente).padStart(4, "0")}</span>
          <span className="detalle">{ultimo ? `Último emitido: ${String(ultimo.numero).padStart(4, "0")}-${ultimo.anio}` : "Aún no hay recibos"}</span>
        </div>
      </div>

      <div className="columnas">
        <div className="principal">
          <form className="barra" method="get">
            <label className="campo">Mes<input type="month" name="mes" defaultValue={periodo} /></label>
            <label className="campo">
              Rubro
              <select name="rubro" defaultValue={sp.rubro ?? ""}>
                <option value="">Todos</option>
                {RUBROS_INGRESO.map((r) => (
                  <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              Estado
              <select name="estado" defaultValue={sp.estado ?? ""}>
                <option value="">Todos</option>
                <option value="emitido">Emitidos</option>
                <option value="anulado">Anulados</option>
              </select>
            </label>
            <label className="campo" style={{ flex: "1 1 180px" }}>Buscar<input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, DNI, concepto o N°" /></label>
            <button className="btn" type="submit">Filtrar</button>
          </form>

          <div className="tabla-marco">
            <table className="tabla" style={{ minWidth: 820 }}>
              <thead>
                <tr><th>N° recibo</th><th>Fecha</th><th>Rubro</th><th>Pagador</th><th>Concepto</th><th>Estado</th><th className="num">Monto S/</th><th className="num">Acciones</th></tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr><td colSpan={8} className="tenue">{delMes.length ? "Ningún recibo coincide con el filtro." : "No hay recibos este mes."}</td></tr>
                )}
                {filas.map((r) => (
                  <tr key={r.id} className={r.estado === "anulado" ? "anulado" : undefined}>
                    <td style={{ fontWeight: 600 }}>{String(r.numero).padStart(4, "0")}</td>
                    <td>{fecha(r.fecha)}</td>
                    <td>{RUBRO[r.rubro]}</td>
                    <td>
                      {r.pagador_nombre}
                      {r.pagador_doc && <div className="pequeno tenue">{r.pagador_doc}</div>}
                    </td>
                    <td className="envolver tachar">
                      {r.concepto}
                      {r.estado === "anulado" && <div className="pequeno">Motivo: {r.anulado_motivo}</div>}
                    </td>
                    <td><Estado valor={r.estado} /></td>
                    <td className="num tachar">{soles(r.monto)}</td>
                    <td><div className="acciones-fila"><Link className="btn chico contorno" href={`/ingresos/${r.id}`}>Ver recibo</Link></div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={6}>Total vigente mostrado</td><td className="num">{soles(filas.filter((f) => f.estado !== "anulado").reduce((s, f) => s + Number(f.monto), 0))}</td><td></td></tr>
              </tfoot>
            </table>
          </div>
        </div>

        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">Por rubro</div>
            <div className="panel-cuerpo">
              {porRubro.length === 0 && <span className="tenue">Sin ingresos este mes.</span>}
              <div className="barras">
                {porRubro.map((r) => (
                  <div key={r.codigo} className="fila" title={`${r.nombre}: S/ ${soles(r.total)} en ${r.n} recibo(s)`}>
                    <span>{r.nombre} <span className="tenue pequeno">· {r.n}</span></span>
                    <span className="monto">{soles(r.total)}</span>
                    <div className="pista" aria-hidden="true"><div style={{ width: `${(r.total / maximo) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-cab">En la rendición</div>
            <div className="panel-cuerpo">
              <ul className="lista-reglas">
                <li>A Perené salen como recursos directamente recaudados (capítulo II, 2.2).</li>
                <li>A Chanchamayo salen por rubro: venta de bienes, servicios, alquileres y otros.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
