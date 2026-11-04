import Link from "next/link";
import ActivarAvisos from "@/components/ActivarAvisos";
import { codigoCP, fecha, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const TIPOS: Record<string, string> = { compra: "Compra de bienes", servicio: "Servicio externo", pago_fijo: "Pago fijo" };

/** Inicio del alcalde en el celular: solo lo que espera su firma, con un botón grande para revisar y aprobar. */
export default async function InicioAlcalde({ mcpId, saludo, nombre }: { mcpId: string; saludo: string; nombre: string }) {
  const supabase = await supabaseServidor();
  const [{ data: exps }, { data: cps }] = await Promise.all([
    supabase.from("expedientes").select("id, numero, anio, fecha, tipo, descripcion, expediente_items(total, anulado)").eq("mcp_id", mcpId).eq("estado", "borrador").order("fecha"),
    supabase.from("comprobantes_pago").select("id, numero, origen, fecha, beneficiario, concepto, importe").eq("mcp_id", mcpId).eq("estado", "borrador").order("fecha"),
  ]);
  const reqs = (exps ?? []).map((e) => ({
    ...e,
    monto: (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
  }));
  const comps = cps ?? [];
  const total = reqs.length + comps.length;
  const monto = reqs.reduce((s, e) => s + e.monto, 0) + comps.reduce((s, c) => s + Number(c.importe), 0);

  type Fila = { clave: string; href: string; titulo: string; detalle: string; monto: number };
  const filas: Fila[] = [
    ...reqs.map((e) => ({ clave: `e${e.id}`, href: `/expedientes/${e.id}`, titulo: e.descripcion, detalle: `${TIPOS[e.tipo] ?? e.tipo} · ${num3(e.numero)}-${e.anio} · ${fecha(e.fecha)}`, monto: e.monto })),
    ...comps.map((c) => ({ clave: `c${c.id}`, href: `/comprobantes/${c.id}`, titulo: c.beneficiario, detalle: `Pago · ${codigoCP(c.numero, c.origen)} · ${fecha(c.fecha)}`, monto: Number(c.importe) })),
  ];

  return (
    <>
      <section className="saludo">
        <div>
          <h1>{saludo}, {nombre}</h1>
          <div className="tenue">{total === 0 ? "No tiene nada pendiente" : `Tiene ${total} ${total === 1 ? "cosa" : "cosas"} esperando su aprobación`}</div>
        </div>
      </section>

      <ActivarAvisos invitar />

      <section className="alc-hero" aria-label="Por aprobar">
        <span className="alc-et">{total === 0 ? "Todo al día" : "Por aprobar"}</span>
        <strong className="alc-cifra">{total === 0 ? "✓" : total}</strong>
        <span className="alc-sub">{total === 0 ? "Cuando el tesorero envíe algo, aparecerá aquí." : `Suman S/ ${soles(monto)}`}</span>
        {total > 0 && <Link className="alc-boton" href="/aprobaciones">Revisar y aprobar</Link>}
      </section>

      {filas.length > 0 && (
        <section className="ini-panel" aria-label="Pendientes">
          <div className="ini-panel-cab"><span>Lo más antiguo primero</span></div>
          <div className="alc-lista">
            {filas.slice(0, 6).map((f) => (
              <Link key={f.clave} href={f.href} className="alc-fila">
                <span className="alc-fila-txt">
                  <b>{f.titulo}</b>
                  <small>{f.detalle}</small>
                </span>
                <span className="alc-fila-monto">S/ {soles(f.monto)}</span>
              </Link>
            ))}
          </div>
          {filas.length > 6 && <Link className="btn contorno" href="/aprobaciones" style={{ marginTop: 10 }}>Ver los {filas.length}</Link>}
        </section>
      )}
    </>
  );
}
