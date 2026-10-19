import { contextoMcp, NOMBRE_ROL, type Rol } from "@/lib/contexto";
import { fecha } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function Responsables() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data } = await supabase
    .from("miembros")
    .select("id, rol, cargo, desde, hasta, activo, perfiles(nombre, dni)")
    .eq("mcp_id", ctx.mcp.id)
    .order("activo", { ascending: false })
    .order("desde", { ascending: false });
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="titulo-ventana"><h1>Responsables y relevos</h1></div>
      <div className="columnas">
        <div className="principal">
          <div className="tabla-marco">
            <table className="tabla" style={{ minWidth: 760 }}>
              <thead><tr><th>Nombre</th><th>Cargo</th><th>Desde</th><th>Hasta</th><th>Acceso al sistema</th></tr></thead>
              <tbody>
                {(data ?? []).map((m) => {
                  const vigente = m.activo && m.desde <= hoy && (!m.hasta || m.hasta >= hoy);
                  const p = m.perfiles as unknown as { nombre: string } | null;
                  return (
                    <tr key={m.id} className={!vigente ? "anulado" : undefined}>
                      <td>{p?.nombre}</td>
                      <td>{m.cargo ?? NOMBRE_ROL[m.rol as Rol]}</td>
                      <td>{fecha(m.desde)}</td>
                      <td>{m.hasta ? fecha(m.hasta) : "Vigente"}</td>
                      <td>{vigente ? <span className="si">Con acceso</span> : <span className="tenue">Sin acceso · historial conservado</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">Cambio de tesorera u otro cargo</div>
            <div className="panel-cuerpo">
              <ul className="lista-reglas">
                <li>El administrador de la MCP pide el cambio a soporte, con el acta de relevo.</li>
                <li>Soporte crea el acceso nuevo y cierra el anterior desde la fecha del acta.</li>
                <li>Quien sale pierde el acceso; todo lo que registró queda con su nombre.</li>
                <li>Los meses cerrados siguen bloqueados para todos.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
