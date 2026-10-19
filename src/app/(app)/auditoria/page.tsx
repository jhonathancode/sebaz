import { type ParamsAviso } from "@/components/Avisos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const TABLAS: Record<string, string> = {
  mcps: "Datos de la MCP",
  fuentes: "Municipalidad que transfiere",
  miembros: "Responsables",
  proveedores: "Proveedor",
  expedientes: "Expediente",
  expediente_items: "Ítem del requerimiento",
  cotizaciones: "Cotización",
  ordenes: "Orden",
  conformidades: "Conformidad",
  cajas_chicas: "Caja chica",
  caja_chica_gastos: "Gasto de caja chica",
  comprobantes_pago: "Comprobante de pago",
  ingresos: "Recibo de ingreso",
  rendiciones: "Rendición",
  rendicion_items: "Comprobante en rendición",
  periodos: "Cierre de mes",
  periodo_reaperturas: "Reapertura de mes",
  sesion: "Sesión",
};

/** Qué cambió entre antes y después, sin campos técnicos. */
function cambios(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null): string {
  if (!antes || !despues) return "";
  const ignorar = new Set(["actualizado_en", "actualizado_por", "creado_en"]);
  return Object.keys(despues)
    .filter((k) => !ignorar.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    .map((k) => `${k}: ${antes[k] ?? "—"} → ${despues[k] ?? "—"}`)
    .join(" · ");
}

export default async function Auditoria({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "alcalde")) {
    return <div className="aviso info">La auditoría la ven el administrador y el alcalde de la MCP.</div>;
  }
  const supabase = await supabaseServidor();
  let q = supabase.from("auditoria").select("*").eq("mcp_id", ctx.mcp.id).order("en", { ascending: false }).limit(300);
  if (sp.tabla) q = q.eq("tabla", sp.tabla);
  const { data } = await q;
  const ids = [...new Set((data ?? []).map((a) => a.user_id).filter(Boolean))];
  const { data: personas } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = new Map((personas ?? []).map((p) => [p.id, p.nombre]));

  return (
    <>
      <div className="titulo-ventana"><h1>Auditoría</h1></div>
      <form className="barra" method="get">
        <label className="campo">
          Qué
          <select name="tabla" defaultValue={sp.tabla ?? ""}>
            <option value="">Todo</option>
            {Object.entries(TABLAS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">Filtrar</button>
        <span className="pequeno tenue" style={{ alignSelf: "center" }}>Últimos 300 movimientos. Nadie puede editar ni borrar este registro.</span>
      </form>
      <div className="tabla-marco">
        <table className="tabla" style={{ minWidth: 900 }}>
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Qué</th><th>Cambios</th></tr></thead>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id}>
                <td>{fechaHora(a.en)}</td>
                <td>{nombre.get(a.user_id) ?? "Sistema"}</td>
                <td>{a.accion === "crear" ? "Registró" : a.accion === "editar" ? "Modificó" : a.accion}</td>
                <td>{TABLAS[a.tabla] ?? a.tabla}</td>
                <td className="envolver pequeno">{a.accion === "editar" ? cambios(a.antes, a.despues) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
