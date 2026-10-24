import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { aprobarEnBloque } from "./acciones";

const TIPOS: Record<string, string> = { compra: "Compra de bienes", servicio: "Servicio externo", pago_fijo: "Pago fijo" };

/** Todo lo que espera la firma del alcalde, para aprobar de una vez. */
export default async function Aprobaciones({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "alcalde", "admin");

  const [{ data: exps }, { data: cps }] = await Promise.all([
    supabase
      .from("expedientes")
      .select("id, numero, anio, fecha, tipo, descripcion, area_usuaria, motivo_devolucion, expediente_items(total, anulado)")
      .eq("mcp_id", ctx.mcp.id)
      .eq("estado", "borrador")
      .order("fecha"),
    supabase
      .from("comprobantes_pago")
      .select("id, numero, origen, fecha, beneficiario, concepto, importe, cheque, expediente_id")
      .eq("mcp_id", ctx.mcp.id)
      .eq("estado", "borrador")
      .order("fecha"),
  ]);
  const reqs = (exps ?? []).map((e) => ({
    ...e,
    monto: (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
  }));
  const comps = cps ?? [];
  const totalReq = reqs.reduce((s, e) => s + e.monto, 0);
  const totalCp = comps.reduce((s, c) => s + Number(c.importe), 0);
  const nada = reqs.length + comps.length === 0;

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Por aprobar</h1>
          <div className="sub">Todo lo que espera la firma del alcalde. Revise, deje marcado lo que aprueba y apruebe de una vez.</div>
        </div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {!puede && <div className="aviso info">Solo el alcalde o el administrador pueden aprobar. Aquí puede ver lo que está pendiente.</div>}

      <div className="kpis">
        <div className={`kpi${reqs.length ? " alerta" : ""}`}>
          <span className="k-et">Requerimientos</span>
          <span className="k-val">{reqs.length}</span>
          <span className="k-det">S/ {soles(totalReq)}</span>
        </div>
        <div className={`kpi${comps.length ? " alerta" : ""}`}>
          <span className="k-et">Comprobantes de pago</span>
          <span className="k-val">{comps.length}</span>
          <span className="k-det">S/ {soles(totalCp)}</span>
        </div>
      </div>

      {nada ? (
        <div className="filas"><div className="vacio">✓ No hay nada por aprobar.</div></div>
      ) : (
        <form action={aprobarEnBloque} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {reqs.length > 0 && (
            <section>
              <h2 style={{ marginBottom: 8 }}>Requerimientos ({reqs.length})</h2>
              <div className="filas">
                {reqs.map((e) => (
                  <label key={e.id} className="cp-sel marcable">
                    <input type="checkbox" name="exp" value={e.id} defaultChecked disabled={!puede} aria-label={`Aprobar ${num3(e.numero)}-${e.anio}`} />
                    <div className="f-num" style={{ fontWeight: 700 }}>
                      {num3(e.numero)}-{e.anio}
                      <small style={{ display: "block", fontWeight: 400, color: "var(--tenue)", fontSize: 12 }}>{fecha(e.fecha)}</small>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{e.descripcion}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12.5, color: "var(--tenue)", marginTop: 3 }}>
                        <span className="etq">{TIPOS[e.tipo] ?? e.tipo}</span>
                        {e.area_usuaria && <span>{e.area_usuaria}</span>}
                        {e.motivo_devolucion && <span className="no">Devuelto antes: {e.motivo_devolucion}</span>}
                      </div>
                    </div>
                    <div className="c-monto">S/ {soles(e.monto)}</div>
                    <div className="c-estado"><Link className="btn chico contorno" href={`/expedientes/${e.id}`}>Ver</Link></div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {comps.length > 0 && (
            <section>
              <h2 style={{ marginBottom: 8 }}>Comprobantes de pago ({comps.length})</h2>
              <div className="filas">
                {comps.map((c) => (
                  <label key={c.id} className="cp-sel marcable">
                    <input type="checkbox" name="cp" value={c.id} defaultChecked disabled={!puede} aria-label={`Aprobar ${codigoCP(c.numero, c.origen)}`} />
                    <div className="f-num" style={{ fontWeight: 700 }}>
                      {codigoCP(c.numero, c.origen)}
                      <small style={{ display: "block", fontWeight: 400, color: "var(--tenue)", fontSize: 12 }}>{fecha(c.fecha)}</small>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{c.beneficiario}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12.5, color: "var(--tenue)", marginTop: 3 }}>
                        <span>{c.concepto}</span>
                        {c.cheque ? <span className="etq">Cheque {c.cheque}</span> : <span className="etq">Sin cheque</span>}
                      </div>
                    </div>
                    <div className="c-monto">S/ {soles(c.importe)}</div>
                    <div className="c-estado"><Link className="btn chico contorno" href={`/comprobantes/${c.id}`}>Ver</Link></div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {puede && (
            <div className="kpi azul" style={{ flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap", position: "sticky", bottom: 12 }}>
              <span style={{ flex: 1 }} className="k-det">
                Se aprueba lo marcado. Los pagos fijos de la lista generan solos su comprobante de pago, que luego se aprueba aquí mismo. Para quitar uno, desmárquelo.
              </span>
              <BotonConfirmar pin className="btn primario grande" pregunta="¿Aprobar todo lo marcado?" detalle="Después de aprobar ya no se pueden cambiar los montos, salvo que se devuelvan a borrador." textoConfirmar="Sí, aprobar">
                Aprobar lo marcado
              </BotonConfirmar>
            </div>
          )}
        </form>
      )}
    </>
  );
}
