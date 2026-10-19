import Link from "next/link";
import Estado from "@/components/Estado";
import { contextoMcp, NOMBRE_ROL, tiene } from "@/lib/contexto";
import { nombrePeriodo, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function Inicio() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = periodoActual();
  const { desde, hasta } = rangoPeriodo(periodo);
  const mcpId = ctx.mcp.id;

  const [{ data: cps }, { count: reqPorAprobar }, { data: rendiciones }, { data: cajas }, { data: ingresos }] = await Promise.all([
    supabase.from("comprobantes_pago").select("estado, cheque, importe, fuente_id").eq("mcp_id", mcpId).in("estado", ["borrador", "aprobado", "rendido"]).lte("fecha", hasta),
    supabase.from("expedientes").select("id", { count: "exact", head: true }).eq("mcp_id", mcpId).eq("estado", "borrador"),
    supabase.from("rendiciones").select("id, fuente_id, estado, numero, anio").eq("mcp_id", mcpId).eq("periodo", periodo).neq("estado", "anulada"),
    supabase.from("cajas_chicas").select("id, monto_fondo, estado, fuente_id, caja_chica_gastos(monto, anulado)").eq("mcp_id", mcpId).eq("periodo", periodo).neq("estado", "anulada"),
    supabase.from("ingresos").select("monto").eq("mcp_id", mcpId).eq("estado", "emitido").gte("fecha", desde).lte("fecha", hasta),
  ]);

  const lista = cps ?? [];
  const cpPorAprobar = lista.filter((c) => c.estado === "borrador").length;
  const cpSinCheque = lista.filter((c) => c.estado === "aprobado" && !c.cheque).length;
  const totalIngresos = (ingresos ?? []).reduce((s, i) => s + Number(i.monto), 0);
  const caja = (cajas ?? [])[0];
  const gastadoCaja = caja
    ? (caja.caja_chica_gastos as { monto: number; anulado: boolean }[]).filter((g) => !g.anulado).reduce((s, g) => s + Number(g.monto), 0)
    : 0;
  const alcalde = tiene(ctx, "alcalde");

  const faltaConfigurar = !ctx.mcp.ruc || !Object.values(ctx.mcp.capitulo1 ?? {}).some(Boolean);

  return (
    <>
      <div className="titulo-ventana">
        <h1>Inicio · {nombrePeriodo(periodo)}</h1>
        <p className="descripcion">
          {ctx.nombre}
          {ctx.roles.length > 0 && ` · ${ctx.roles.map((r) => NOMBRE_ROL[r]).join(", ")}`}
        </p>
      </div>

      {faltaConfigurar && tiene(ctx, "admin") && (
        <div className="aviso info">
          Faltan datos de la MCP (RUC o capítulo I del informe). <Link href="/configuracion">Completar en Configuración</Link>
        </div>
      )}

      <section aria-label="Rendición del mes">
        <h2 style={{ marginBottom: 10 }}>Rendición del mes</h2>
        <div className="tarjetas">
          {ctx.fuentes.map((f) => {
            const deLaFuente = lista.filter((c) => c.fuente_id === f.id);
            const listo = deLaFuente.filter((c) => c.estado === "aprobado" && c.cheque).reduce((s, c) => s + Number(c.importe), 0);
            const rendicion = (rendiciones ?? []).find((r) => r.fuente_id === f.id);
            const transferencia = Number(f.monto_mensual);
            const pct = transferencia ? Math.min(100, Math.round((listo / transferencia) * 100)) : 0;
            return (
              <Link key={f.id} className="tarjeta" href={`/rendicion?fuente=${f.id}`}>
                <span className="etiqueta">{f.tipo === "distrito" ? "Distrito" : "Provincia"} · {f.municipalidad}</span>
                {rendicion ? (
                  <>
                    <span className="valor">Rendición {String(rendicion.numero).padStart(3, "0")}</span>
                    <span><Estado valor={rendicion.estado} /></span>
                  </>
                ) : (
                  <>
                    <span className="valor">S/ {soles(listo)}</span>
                    <span className="detalle">listo para rendir de S/ {soles(transferencia)}</span>
                    <div className="barra-progreso" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-label="Pendientes">
        <h2 style={{ marginBottom: 10 }}>Pendientes</h2>
        <div className="tarjetas">
          <Link className="tarjeta" href="/expedientes?estado=borrador">
            <span className="etiqueta">Requerimientos por aprobar</span>
            <span className="valor" style={{ color: alcalde && reqPorAprobar ? "var(--ambar)" : undefined }}>{reqPorAprobar ?? 0}</span>
            <span className="detalle">{alcalde ? "Esperan su aprobación" : "Esperan al alcalde"}</span>
          </Link>
          <Link className="tarjeta" href="/comprobantes?estado=borrador">
            <span className="etiqueta">Comprobantes por aprobar</span>
            <span className="valor" style={{ color: alcalde && cpPorAprobar ? "var(--ambar)" : undefined }}>{cpPorAprobar}</span>
            <span className="detalle">En borrador</span>
          </Link>
          <Link className="tarjeta" href="/comprobantes?estado=aprobado">
            <span className="etiqueta">Comprobantes sin cheque</span>
            <span className="valor" style={{ color: cpSinCheque ? "var(--ambar)" : undefined }}>{cpSinCheque}</span>
            <span className="detalle">Sin cheque no entran en la rendición</span>
          </Link>
          <Link className="tarjeta" href="/caja-chica">
            <span className="etiqueta">Caja chica</span>
            {caja ? (
              <>
                <span className="valor">S/ {soles(Number(caja.monto_fondo) - gastadoCaja)}</span>
                <span className="detalle">saldo de S/ {soles(caja.monto_fondo)} · <Estado valor={caja.estado} /></span>
              </>
            ) : (
              <>
                <span className="valor">—</span>
                <span className="detalle">Aún no se abre el fondo del mes</span>
              </>
            )}
          </Link>
          <Link className="tarjeta" href="/ingresos">
            <span className="etiqueta">Ingresos propios del mes</span>
            <span className="valor">S/ {soles(totalIngresos)}</span>
            <span className="detalle">{(ingresos ?? []).length} recibos emitidos</span>
          </Link>
        </div>
      </section>

      <section aria-label="Accesos rápidos">
        <h2 style={{ marginBottom: 10 }}>Accesos rápidos</h2>
        <div className="accesos">
          <Link className="btn primario" href="/expedientes/nuevo">Nuevo requerimiento</Link>
          <Link className="btn" href="/comprobantes/nuevo">Comprobante directo</Link>
          <Link className="btn" href="/caja-chica">Registrar gasto de caja chica</Link>
          <Link className="btn" href="/ingresos">Emitir recibo de ingreso</Link>
          <Link className="btn" href="/rendicion">Armar rendición</Link>
        </div>
      </section>
    </>
  );
}
