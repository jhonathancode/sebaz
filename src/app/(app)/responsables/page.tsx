import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import InputFecha from "@/components/InputFecha";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, NOMBRE_ROL, tiene, type Rol } from "@/lib/contexto";
import { anularDesignacion, registrarDesignacion } from "./acciones";
import { fecha } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function Responsables({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data } = await supabase
    .from("miembros")
    .select("id, rol, cargo, desde, hasta, activo, perfiles(nombre, dni)")
    .eq("mcp_id", ctx.mcp.id)
    .order("activo", { ascending: false })
    .order("desde", { ascending: false });
  const { data: designaciones } = await supabase.from("designaciones_responsables").select("*").eq("mcp_id", ctx.mcp.id).order("desde", { ascending: false });
  const admin = tiene(ctx, "admin");
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="titulo-ventana">
        <h1>Responsables y relevos</h1>
        <span className="espacio" />
        {tiene(ctx, "admin", "alcalde") && <Link className="btn contorno" href="/responsables/actuacion">Constancia de actuación</Link>}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
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
            <div className="panel-cab">
              Designaciones (resolución)
              {admin && (
                <VentanaFlotante boton="+ Registrar" titulo="Designación de responsable de fondos" accion={registrarDesignacion} textoGuardar="Guardar designación" claseBoton="btn chico contorno">
                  <p className="pequeno tenue" style={{ margin: "0 0 10px" }}>Deje constancia de quién maneja los fondos y con qué resolución fue designado (alcalde, administrador, tesorero).</p>
                  <div className="rejilla-2">
                    <label className="campo">Cargo<input name="cargo" required placeholder="TESORERA" style={{ textTransform: "uppercase" }} /></label>
                    <label className="campo">Nombre completo<input name="nombre" required style={{ textTransform: "uppercase" }} /></label>
                    <label className="campo">DNI<input name="documento" inputMode="numeric" maxLength={11} /></label>
                    <label className="campo">N° de resolución<input name="resolucion" required placeholder="RESOLUCIÓN DE ALCALDÍA N° 012-2026" style={{ textTransform: "uppercase" }} /></label>
                    <label className="campo">Fecha de la resolución<InputFecha name="fecha_resolucion" required /></label>
                    <label className="campo">Rige desde<InputFecha name="desde" required /></label>
                    <label className="campo">Hasta (si ya terminó)<InputFecha name="hasta" /></label>
                    <label className="campo ancho">Observación<input name="observacion" style={{ textTransform: "uppercase" }} /></label>
                  </div>
                </VentanaFlotante>
              )}
            </div>
            <div className="panel-cuerpo">
              {(designaciones ?? []).length === 0 ? (
                <p className="pequeno tenue" style={{ margin: 0 }}>Aún no hay designaciones registradas. Son la constancia de quién estaba a cargo de los fondos y desde cuándo; sirven en el relevo y ante una fiscalización.</p>
              ) : (
                <div className="filas">
                  {(designaciones ?? []).map((d) => (
                    <div key={d.id} className="fila" style={{ flexWrap: "wrap", opacity: d.anulado ? 0.55 : 1 }}>
                      <span><b>{d.cargo}</b> · {d.nombre}<br /><span className="tenue pequeno">{d.resolucion} ({fecha(d.fecha_resolucion)}) · {fecha(d.desde)} al {d.hasta ? fecha(d.hasta) : "vigente"}{d.anulado ? ` · ANULADA: ${d.anulado_motivo}` : ""}</span></span>
                      <span className="espacio" />
                      {admin && !d.anulado && <Motivo chico accion={anularDesignacion} boton="Anular" ayuda="Motivo" campos={{ id: d.id }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
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
