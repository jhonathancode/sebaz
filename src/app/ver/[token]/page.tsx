import type { Metadata } from "next";
import { enlaceVigente } from "@/lib/enlaceLectura";
import { codigoCP, fecha, nombrePeriodo, soles } from "@/lib/formato";
import { supabaseServicio } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Consulta de la municipalidad", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Consulta de solo lectura con enlace propio: no hay sesión ni botones que cambien nada. */
export default async function Ver({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const enlace = await enlaceVigente(token);
  if (!enlace)
    return (
      <main className="login">
        <div className="caja caja-login">
          <h1>Enlace no válido</h1>
          <p className="tenue">Este enlace no existe o fue revocado. Pida uno nuevo a la tesorería.</p>
        </div>
      </main>
    );
  const sb = supabaseServicio();
  const m = enlace.mcpId;
  const [{ data: rendiciones }, { data: cps }, { data: ingresos }, { data: fuentes }] = await Promise.all([
    sb.from("rendiciones").select("numero, anio, periodo, transferencia, estado, fuente_id").eq("mcp_id", m).neq("estado", "anulada").order("periodo", { ascending: false }).limit(24),
    sb.from("comprobantes_pago").select("numero, origen, fecha, cheque, beneficiario, concepto, importe, estado").eq("mcp_id", m).not("estado", "in", "(anulado,borrador)").order("fecha", { ascending: false }).order("numero", { ascending: false }).limit(60),
    sb.from("ingresos").select("fecha, monto").eq("mcp_id", m).eq("estado", "emitido").order("fecha", { ascending: false }).limit(2000),
    sb.from("fuentes").select("id, municipalidad").eq("mcp_id", m),
  ]);
  const nomFuente = new Map((fuentes ?? []).map((f) => [f.id, f.municipalidad as string]));
  const porMes = new Map<string, number>();
  for (const i of ingresos ?? []) porMes.set(String(i.fecha).slice(0, 7), (porMes.get(String(i.fecha).slice(0, 7)) ?? 0) + Number(i.monto));
  const meses = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>{enlace.mcp.nombre}</h1>
        <p className="tenue" style={{ margin: "4px 0 0" }}>{enlace.mcp.ruc ? `RUC ${enlace.mcp.ruc} · ` : ""}Consulta de solo lectura para {enlace.nombre}. No se puede modificar nada desde aquí.</p>
      </header>
      <section className="panel">
        <div className="panel-cab">Rendiciones</div>
        <div className="panel-cuerpo" style={{ overflowX: "auto" }}>
          <table className="formato">
            <thead><tr><th>N°</th><th>Mes</th><th>Fuente</th><th className="num">Transferencia S/</th><th>Estado</th></tr></thead>
            <tbody>
              {(rendiciones ?? []).map((r) => (
                <tr key={`${r.anio}-${r.numero}-${r.periodo}-${r.fuente_id}`}>
                  <td>{String(r.numero ?? "").padStart(3, "0")}-{r.anio}</td><td>{nombrePeriodo(r.periodo)}</td><td>{nomFuente.get(r.fuente_id) ?? ""}</td><td className="num">{soles(r.transferencia)}</td><td>{r.estado}</td>
                </tr>
              ))}
              {(rendiciones ?? []).length === 0 && <tr><td colSpan={5}>Aún no hay rendiciones.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-cab">Ingresos propios por mes</div>
        <div className="panel-cuerpo" style={{ overflowX: "auto" }}>
          <table className="formato">
            <thead><tr><th>Mes</th><th className="num">Total S/</th></tr></thead>
            <tbody>{meses.map(([mes, t]) => <tr key={mes}><td>{nombrePeriodo(mes)}</td><td className="num">{soles(t)}</td></tr>)}{meses.length === 0 && <tr><td colSpan={2}>Sin ingresos registrados.</td></tr>}</tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-cab">Últimos comprobantes de pago</div>
        <div className="panel-cuerpo" style={{ overflowX: "auto" }}>
          <table className="formato">
            <thead><tr><th>N° CP</th><th>Fecha</th><th>Cheque</th><th>Beneficiario</th><th>Concepto</th><th className="num">Importe S/</th></tr></thead>
            <tbody>
              {(cps ?? []).map((c) => (
                <tr key={`${c.origen}-${c.numero}-${c.fecha}`}>
                  <td>{codigoCP(c.numero, c.origen)}</td><td>{fecha(c.fecha)}</td><td>{c.cheque}</td><td>{c.beneficiario}</td><td>{c.concepto}</td><td className="num">{soles(c.importe)}</td>
                </tr>
              ))}
              {(cps ?? []).length === 0 && <tr><td colSpan={6}>Aún no hay comprobantes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
