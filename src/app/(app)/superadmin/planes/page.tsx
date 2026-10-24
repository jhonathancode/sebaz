import Avisos, { type ParamsAviso } from "@/components/Avisos";
import VentanaFlotante from "@/components/VentanaFlotante";
import { obtenerContexto } from "@/lib/contexto";
import { soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarPlan } from "../acciones";
import Pestanas from "../Pestanas";

type Plan = { id: string; nombre: string; descripcion: string | null; precio_mensual: number; precio_anual: number | null; activo: boolean };

function Campos({ p }: { p?: Plan }) {
  return (
    <div className="rejilla-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="campo">Nombre del plan<input name="nombre" required defaultValue={p?.nombre ?? ""} placeholder="Ej.: Plan MCP, Plan completo" /></label>
      <label className="campo">Precio mensual S/<input name="precio_mensual" inputMode="decimal" required defaultValue={p ? String(p.precio_mensual) : ""} /></label>
      <label className="campo">Precio anual S/ (opcional)<input name="precio_anual" inputMode="decimal" defaultValue={p?.precio_anual != null ? String(p.precio_anual) : ""} /></label>
      <label className="campo">
        Estado
        <select name="activo" defaultValue={p?.activo === false ? "0" : "1"}>
          <option value="1">Activo (se puede asignar)</option>
          <option value="0">Inactivo</option>
        </select>
      </label>
      <label className="campo" style={{ gridColumn: "1 / -1" }}>Qué incluye<input name="descripcion" defaultValue={p?.descripcion ?? ""} /></label>
    </div>
  );
}

export default async function Planes({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const [{ data: planes }, { data: susc }] = await Promise.all([
    supabase.from("planes").select("*").order("precio_mensual"),
    supabase.from("suscripciones").select("plan_id"),
  ]);
  return (
    <>
      <div className="cab-vista">
        <div><h1>Planes</h1><div className="sub">Lo que cobra por el sistema. El precio de cada cliente se puede ajustar en su ficha.</div></div>
        <span className="espacio" />
        <VentanaFlotante boton="+ Nuevo plan" titulo="Nuevo plan" accion={guardarPlan} textoGuardar="Crear plan" claseBoton="btn primario grande">
          <Campos />
        </VentanaFlotante>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <Pestanas activa="/superadmin/planes" />
      <div className="filas">
        {(planes ?? []).map((p: Plan) => (
          <div key={p.id} className={`fila${p.activo ? "" : " anulada"}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
            <div className="f-desc">
              <span className="f-titulo">{p.nombre}</span>
              <div className="f-meta">
                <span>{p.descripcion ?? ""}</span>
                <span className="etq">{(susc ?? []).filter((s) => s.plan_id === p.id).length} cliente(s)</span>
                {Number(p.precio_mensual) === 0 && <span className="no">Defina el precio</span>}
              </div>
            </div>
            <div className="f-monto">
              S/ {soles(p.precio_mensual)}<span className="tenue pequeno" style={{ fontWeight: 400 }}> /mes</span>
              {p.precio_anual != null && <small className="tenue">S/ {soles(p.precio_anual)} al año</small>}
            </div>
            <div className="f-acc">
              <VentanaFlotante boton="Editar" titulo={`Editar · ${p.nombre}`} accion={guardarPlan} textoGuardar="Guardar" claseBoton="btn chico contorno">
                <Campos p={p} />
              </VentanaFlotante>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
