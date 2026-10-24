import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import { cambiarSoporte } from "../acciones";
import Pestanas from "../Pestanas";

/** Equipo de soporte: activa MCP, capacita y ayuda; no ve gastos ni rendiciones. */
export default async function Equipo({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const { data: equipo } = await supabase.from("perfiles").select("*").or("es_soporte.eq.true,es_superadmin.eq.true").order("nombre");
  return (
    <>
      <div className="cab-vista">
        <div><h1>Equipo de soporte</h1><div className="sub">Activan las MCP, crean accesos, registran relevos y responden dudas. No ven gastos ni rendiciones.</div></div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <Pestanas activa="/superadmin/equipo" />
      <form action={cambiarSoporte} className="barra" style={{ maxWidth: 640 }}>
        <input type="hidden" name="dar" value="1" />
        <label className="campo" style={{ flex: 1 }}>Correo de la persona (ya debe tener usuario)<input name="correo" type="email" required /></label>
        <BotonConfirmar className="btn primario" pregunta="¿Dar acceso de soporte a esta persona?" detalle="Podrá dar de alta MCP, crear usuarios y registrar relevos." textoConfirmar="Sí, dar acceso">Dar acceso de soporte</BotonConfirmar>
      </form>
      <div className="filas">
        {(equipo ?? []).map((p) => (
          <div key={p.id} className="fila" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <div className="f-desc">
              <span className="f-titulo">{p.nombre || "Sin nombre"}</span>
              <div className="f-meta">{p.es_superadmin ? <span className="etq azul">Superadmin (dueño)</span> : <span className="etq">Soporte</span>}</div>
            </div>
            <div className="f-acc">
              {!p.es_superadmin && (
                <form action={cambiarSoporte}>
                  <input type="hidden" name="user_id" value={p.id} />
                  <input type="hidden" name="dar" value="0" />
                  <BotonConfirmar className="btn chico peligro" peligro pregunta="¿Quitar el acceso de soporte?" textoConfirmar="Sí, quitar">Quitar acceso</BotonConfirmar>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
