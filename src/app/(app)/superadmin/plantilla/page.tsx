import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { nombreAdjunto } from "@/lib/adjuntosExpediente";
import { obtenerContexto } from "@/lib/contexto";
import { fechaHora } from "@/lib/formato";
import { leerPlantilla } from "@/lib/plantilla";
import { GASTOS_SUSTENTO, SUSTENTOS_ELEGIBLES } from "@/lib/sustentos";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function PlantillaConfiguracion({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const [pl, { data: clientes }] = await Promise.all([leerPlantilla(), supabase.from("mcps").select("id, nombre").order("nombre")]);
  const nombreSust = (c: string) => SUSTENTOS_ELEGIBLES.find((x) => x.codigo === c)?.nombre ?? c;

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Plantilla de configuración</h1>
          <div className="sub">Lo que comparten todas las municipalidades. Cada cliente nuevo nace con una copia y luego la ajusta por su cuenta.</div>
        </div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      {!pl ? (
        <section className="panel">
          <div className="panel-cuerpo">
            <span className="pequeno tenue">Todavía no hay plantilla. Abra la ficha de un cliente que ya tenga bien configurados sus pagos fijos y comprobantes, y use «Usar este cliente como plantilla». Si nunca corrió SUPERADMIN_PLANTILLA.sql en Supabase, hágalo primero.</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(clientes ?? []).map((c) => <Link key={c.id} className="btn contorno" href={`/superadmin/clientes/${c.id}`}>{c.nombre}</Link>)}
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="barra" style={{ display: "block" }}>
            Tomada de <b>{pl.origen ?? "—"}</b> · {fechaHora(pl.actualizado_en)}. Para cambiarla, ajuste ese cliente (o abra otro) y use «Usar este cliente como plantilla» en su ficha.
          </div>
          <section className="panel">
            <div className="panel-cab">Pagos fijos tipo ({pl.pagos.length})</div>
            <div className="filas" style={{ border: "none", borderRadius: 0 }}>
              {pl.pagos.length === 0 && <div className="vacio">La plantilla no tiene pagos fijos.</div>}
              {pl.pagos.map((p) => (
                <div key={p.concepto} className="fila" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                  <div className="f-desc">
                    <span className="f-titulo">{p.concepto}</span>
                    <div className="f-meta">
                      <span className="etq">{p.expediente_completo ? "Expediente completo" : "Solo requerimiento y comprobante"}</span>
                      {p.sustentos.length > 0 && <span>Comprobante: {p.sustentos.map(nombreSust).join(", ")}</span>}
                      {p.documentos.length > 0 && <span>Documentos: {p.documentos.map((d) => (d === "planilla" ? "Planilla del mes" : nombreAdjunto(d))).join(", ")}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-cab">Comprobante que entrega el proveedor según el gasto</div>
            <div className="filas" style={{ border: "none", borderRadius: 0 }}>
              {Object.keys(pl.sustentos_gasto).length === 0 && <div className="vacio">Sin reglas propias: cada cliente usa las predeterminadas.</div>}
              {Object.entries(pl.sustentos_gasto).map(([gasto, lista]) => (
                <div key={gasto} className="fila" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                  <div className="f-desc">
                    <span className="f-titulo">{GASTOS_SUSTENTO.find((g) => g.clave === gasto)?.texto ?? gasto}</span>
                    <div className="f-meta"><span>{lista.map(nombreSust).join(", ")}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <p className="pequeno tenue">Los pagos de la plantilla se crean en cada cliente nuevo desactivados y con monto S/ 0.01: la municipalidad completa beneficiario y monto y los activa. No se copian identidad, logo, cuentas, numeración de cheques ni archivos subidos (DNI, credencial).</p>
        </>
      )}
    </>
  );
}
