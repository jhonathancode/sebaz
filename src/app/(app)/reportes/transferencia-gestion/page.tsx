import Link from "next/link";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import Firmas from "@/components/Firmas";
import { contextoMcp } from "@/lib/contexto";
import { codigoCP, fecha, nombrePeriodo, soles } from "@/lib/formato";
import { NUMERACIONES, ultimoEmitido } from "@/lib/numeracion";
import { supabaseServidor } from "@/lib/supabase/server";

/**
 * Informe de transferencia de gestión: lo que el tesorero y el alcalde entrantes reciben, armado solo con lo que hay
 * en el sistema (saldos de estado, pendientes, compromisos, almacén, numeración y cuentas).
 */
export default async function TransferenciaGestion() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const m = ctx.mcp.id;
  const hoy = new Date().toISOString().slice(0, 10);
  const anio = Number(hoy.slice(0, 4));
  const [{ data: miembros }, { data: rendiciones }, { data: pendientes }, { data: cps }, { data: cobrados }, { data: pagosFijos }, { data: stock }, { data: cuentas }, { data: ing }, ...ultimos] = await Promise.all([
    supabase.from("miembros").select("rol, cargo, perfiles(nombre)").eq("mcp_id", m).eq("activo", true).in("rol", ["alcalde", "tesorero", "regidor"]),
    supabase.from("rendiciones").select("numero, anio, periodo, estado").eq("mcp_id", m).neq("estado", "anulada").order("periodo", { ascending: false }).limit(12),
    supabase.from("expedientes").select("numero, anio, descripcion, estado, fecha").eq("mcp_id", m).in("estado", ["borrador", "aprobado"]).order("fecha"),
    supabase.from("comprobantes_pago").select("id, numero, origen, fecha, cheque, beneficiario, importe").eq("mcp_id", m).eq("estado", "emitido").order("fecha"),
    supabase.from("cheques_cobrados").select("comprobante_id").eq("anulado", false),
    supabase.from("pagos_fijos").select("concepto, beneficiario, monto").eq("mcp_id", m).eq("activo", true).order("concepto"),
    supabase.from("almacen_stock").select("codigo, descripcion, unidad, stock, valor").eq("mcp_id", m).eq("activo", true).gt("stock", 0).order("descripcion"),
    supabase.from("cuentas_bancarias").select("banco, numero, alias").eq("mcp_id", m).eq("activo", true),
    supabase.from("ingresos").select("monto").eq("mcp_id", m).eq("estado", "emitido").gte("fecha", `${anio}-01-01`),
    ...NUMERACIONES.map((n) => ultimoEmitido(supabase, m, n.tipo, anio)),
  ]);
  const nombre = (x: { perfiles: unknown }) => (x.perfiles as { nombre: string } | null)?.nombre ?? "";
  const cargoDe = (rol: string) => (miembros ?? []).filter((x) => x.rol === rol).map(nombre).join(", ") || "—";
  const cobradosSet = new Set((cobrados ?? []).map((c) => c.comprobante_id));
  const sinCobrar = (cps ?? []).filter((c) => !cobradosSet.has(c.id));
  const totalSinCobrar = sinCobrar.reduce((s, c) => s + Number(c.importe), 0);
  const totalFijos = (pagosFijos ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const totalIngresos = (ing ?? []).reduce((s, i) => s + Number(i.monto), 0);
  const entregadas = (rendiciones ?? []).filter((r) => r.estado === "entregada").length;
  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/reportes">← Volver a reportes</Link>
        <h1>Informe de transferencia de gestión</h1>
        <span className="espacio" />
        <BotonPdf nombre={`Transferencia de gestion ${hoy}`} className="btn primario" />
        <BotonImprimir texto="Imprimir" />
      </div>
      <div className="hoja">
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>INFORME DE TRANSFERENCIA DE GESTIÓN · TESORERÍA</div>
          <div>{ctx.mcp.nombre.toUpperCase()}{ctx.mcp.ruc ? ` · RUC ${ctx.mcp.ruc}` : ""}</div>
          <div className="pequeno tenue">Situación al {fecha(hoy)}</div>
        </div>
        <table className="formato">
          <tbody>
            <tr><th style={{ width: 240 }}>Alcalde</th><td>{cargoDe("alcalde")}</td></tr>
            <tr><th>Tesorero(a)</th><td>{cargoDe("tesorero")}</td></tr>
            <tr><th>Regidores</th><td>{cargoDe("regidor")}</td></tr>
          </tbody>
        </table>

        <h3>1. Cuentas bancarias</h3>
        <table className="formato">
          <thead><tr><th>Banco</th><th>N° de cuenta</th><th>Alias</th></tr></thead>
          <tbody>
            {ctx.mcp.banco_cuenta && <tr><td>{ctx.mcp.banco_nombre ?? ""}</td><td>{ctx.mcp.banco_cuenta}</td><td>Cuenta principal</td></tr>}
            {(cuentas ?? []).map((c) => <tr key={c.numero}><td>{c.banco}</td><td>{c.numero}</td><td>{c.alias ?? ""}</td></tr>)}
            {!ctx.mcp.banco_cuenta && (cuentas ?? []).length === 0 && <tr><td colSpan={3}>Sin cuentas registradas.</td></tr>}
          </tbody>
        </table>

        <h3>2. Ingresos propios del {anio}</h3>
        <p>Total recaudado en el año: <b>S/ {soles(totalIngresos)}</b>.</p>

        <h3>3. Rendiciones</h3>
        <table className="formato">
          <thead><tr><th>N°</th><th>Mes</th><th>Estado</th></tr></thead>
          <tbody>
            {(rendiciones ?? []).map((r) => <tr key={`${r.anio}-${r.numero}-${r.periodo}`}><td>{String(r.numero ?? "").padStart(3, "0")}-{r.anio}</td><td>{nombrePeriodo(r.periodo)}</td><td>{r.estado === "entregada" ? "Entregada" : "Generada, falta entregar"}</td></tr>)}
            {(rendiciones ?? []).length === 0 && <tr><td colSpan={3}>No hay rendiciones.</td></tr>}
          </tbody>
        </table>
        <p className="pequeno">Entregadas: {entregadas} de {(rendiciones ?? []).length} (últimas 12).</p>

        <h3>4. Cheques emitidos que el banco aún no cobra</h3>
        <table className="formato">
          <thead><tr><th>N° CP</th><th>Fecha</th><th>Cheque</th><th>Beneficiario</th><th className="num">Importe S/</th></tr></thead>
          <tbody>
            {sinCobrar.map((c) => <tr key={c.id}><td>{codigoCP(c.numero, c.origen)}</td><td>{fecha(c.fecha)}</td><td>{c.cheque}</td><td>{c.beneficiario}</td><td className="num">{soles(c.importe)}</td></tr>)}
            {sinCobrar.length === 0 && <tr><td colSpan={5}>No hay cheques pendientes de cobro.</td></tr>}
            <tr><th colSpan={4}>Total pendiente de cobro</th><th className="num">{soles(totalSinCobrar)}</th></tr>
          </tbody>
        </table>

        <h3>5. Requerimientos en trámite (sin comprobante emitido)</h3>
        <table className="formato">
          <thead><tr><th>N°</th><th>Fecha</th><th>Descripción</th><th>Estado</th></tr></thead>
          <tbody>
            {(pendientes ?? []).map((e) => <tr key={`${e.anio}-${e.numero}`}><td>{String(e.numero ?? "").padStart(3, "0")}-{e.anio}</td><td>{fecha(e.fecha)}</td><td>{e.descripcion}</td><td>{e.estado === "borrador" ? "Por aprobar" : "Aprobado"}</td></tr>)}
            {(pendientes ?? []).length === 0 && <tr><td colSpan={4}>No hay requerimientos en trámite.</td></tr>}
          </tbody>
        </table>

        <h3>6. Compromisos mensuales vigentes (pagos fijos)</h3>
        <table className="formato">
          <thead><tr><th>Concepto</th><th>Beneficiario</th><th className="num">Monto S/</th></tr></thead>
          <tbody>
            {(pagosFijos ?? []).map((p) => <tr key={p.concepto + p.beneficiario}><td>{p.concepto}</td><td>{p.beneficiario ?? ""}</td><td className="num">{soles(p.monto)}</td></tr>)}
            <tr><th colSpan={2}>Total mensual</th><th className="num">{soles(totalFijos)}</th></tr>
          </tbody>
        </table>

        {(stock ?? []).length > 0 && (
          <>
            <h3>7. Existencias en almacén</h3>
            <table className="formato">
              <thead><tr><th>Cód.</th><th>Bien</th><th>Unidad</th><th className="num">Stock</th><th className="num">Valor S/</th></tr></thead>
              <tbody>
                {(stock ?? []).map((b) => <tr key={b.codigo}><td>{b.codigo}</td><td>{b.descripcion}</td><td>{b.unidad}</td><td className="num">{Number(b.stock)}</td><td className="num">{soles(b.valor)}</td></tr>)}
              </tbody>
            </table>
          </>
        )}

        <h3>{(stock ?? []).length > 0 ? "8" : "7"}. Último número emitido en {anio} (para continuar la numeración)</h3>
        <table className="formato">
          <tbody>
            {NUMERACIONES.map((n, i) => <tr key={n.tipo}><td>{n.nombre}</td><td className="num" style={{ width: 120 }}>{ultimos[i] ? String(ultimos[i]).padStart(3, "0") : "—"}</td></tr>)}
          </tbody>
        </table>

        <Firmas nombres={["TESORERO(A) SALIENTE", "TESORERO(A) ENTRANTE", "ALCALDE"]} />
      </div>
    </>
  );
}
