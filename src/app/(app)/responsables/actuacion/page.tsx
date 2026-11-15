import Link from "next/link";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, nombrePeriodo, periodoActual, rangoPeriodo } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const TABLAS: Record<string, string> = {
  expedientes: "Expedientes (requerimientos)", expediente_items: "Ítems de requerimiento", cotizaciones: "Cotizaciones", ordenes: "Órdenes", conformidades: "Conformidades",
  cajas_chicas: "Cajas chicas", caja_chica_gastos: "Gastos de caja chica", arqueos_caja: "Arqueos de caja chica", planillas_movilidad: "Planillas de movilidad", comisiones_viaje: "Comisiones de servicio",
  comprobantes_pago: "Comprobantes de pago", ingresos: "Recibos de ingreso", depositos_ingresos: "Depósitos de ingresos", rendiciones: "Rendiciones", rendicion_items: "Comprobantes en rendición",
  periodos: "Cierres de mes", periodo_reaperturas: "Reaperturas de mes", proveedores: "Proveedores",
};

/** Constancia de actuación: lo que registró una persona en el sistema durante un mes, tomado de la auditoría. */
export default async function Actuacion({ searchParams }: { searchParams: Promise<{ mes?: string; persona?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "alcalde")) return <div className="aviso info">La constancia la emiten el administrador y el alcalde.</div>;
  const supabase = await supabaseServidor();
  const periodo = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : periodoActual();
  const { data: miembros } = await supabase.from("miembros").select("user_id, rol, cargo, perfiles(nombre, dni)").eq("mcp_id", ctx.mcp.id).order("activo", { ascending: false });
  const personas = new Map<string, { nombre: string; dni: string | null; cargo: string }>();
  (miembros ?? []).forEach((m) => {
    const p = m.perfiles as unknown as { nombre: string; dni: string | null } | null;
    if (p && !personas.has(m.user_id)) personas.set(m.user_id, { nombre: p.nombre, dni: p.dni, cargo: m.cargo ?? m.rol });
  });
  const elegida = sp.persona && personas.has(sp.persona) ? sp.persona : [...personas.keys()][0];
  const r = rangoPeriodo(periodo);
  const { data: filas } = elegida
    ? await supabase.from("auditoria").select("tabla, accion, en").eq("mcp_id", ctx.mcp.id).eq("user_id", elegida).gte("en", `${r.desde}T00:00:00-05:00`).lte("en", `${r.hasta}T23:59:59-05:00`).limit(5000)
    : { data: [] as { tabla: string; accion: string; en: string }[] };
  const resumen = new Map<string, { crear: number; editar: number }>();
  (filas ?? []).filter((f) => TABLAS[f.tabla]).forEach((f) => {
    const x = resumen.get(f.tabla) ?? { crear: 0, editar: 0 };
    if (f.accion === "crear") x.crear += 1;
    else x.editar += 1;
    resumen.set(f.tabla, x);
  });
  const filasTabla = [...resumen].sort((a, b) => (TABLAS[a[0]] > TABLAS[b[0]] ? 1 : -1));
  const total = filasTabla.reduce((s, [, v]) => s + v.crear + v.editar, 0);
  const persona = elegida ? personas.get(elegida) : null;
  const primero = (filas ?? []).map((f) => f.en).sort()[0];
  const ultimo = (filas ?? []).map((f) => f.en).sort().at(-1);

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/responsables">← Volver a responsables</Link>
        <span className="espacio" />
        <BotonPdf nombre={`Constancia de actuacion ${periodo}`} />
        <BotonImprimir />
      </div>
      <form className="barra no-imprimir" method="get">
        <label className="campo">Persona
          <select name="persona" defaultValue={elegida}>
            {[...personas].map(([id, p]) => <option key={id} value={id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Mes<input type="month" name="mes" defaultValue={periodo} /></label>
        <button className="btn" type="submit">Ver</button>
      </form>
      <div className="hoja">
        <Encabezado mcp={ctx.mcp} titulo="CONSTANCIA DE ACTUACIÓN EN EL SISTEMA" numero={nombrePeriodo(periodo).toUpperCase()} />
        <table className="formato">
          <tbody>
            <tr><th style={{ width: 200 }}>Persona</th><td>{persona?.nombre ?? "—"}{persona?.dni ? ` · DNI ${persona.dni}` : ""}</td></tr>
            <tr><th>Cargo</th><td>{persona?.cargo?.toUpperCase() ?? "—"}</td></tr>
            <tr><th>Periodo</th><td>{nombrePeriodo(periodo)}</td></tr>
            <tr><th>Movimientos registrados</th><td>{total}{primero ? ` · del ${fechaHora(primero)} al ${fechaHora(ultimo)}` : ""}</td></tr>
          </tbody>
        </table>
        <table className="formato">
          <thead><tr><th>Qué registró</th><th className="num">Altas</th><th className="num">Modificaciones y anulaciones</th></tr></thead>
          <tbody>
            {filasTabla.length === 0 && <tr><td colSpan={3}>No hay movimientos de esta persona en el mes.</td></tr>}
            {filasTabla.map(([t, v]) => (
              <tr key={t}><td>{TABLAS[t]}</td><td className="num">{v.crear}</td><td className="num">{v.editar}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="pequeno" style={{ marginTop: 10 }}>Esta constancia resume el registro de auditoría del sistema, que no se puede editar ni borrar. Deja constancia de qué operaciones realizó la persona con los fondos y documentos a su cargo en el periodo indicado.</p>
        <Firmas nombres={["ADMINISTRADOR", "ALCALDE"]} />
      </div>
    </>
  );
}
