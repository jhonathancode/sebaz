import { cookies } from "next/headers";
import BotonConfirmar from "@/components/BotonConfirmar";
import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import { NOMBRE_ROL, obtenerContexto, type Rol } from "@/lib/contexto";
import { fecha, hoyISO, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { agregarUsuario, cambiarEstadoMcp, crearMcp, registrarRelevo } from "./acciones";

const ROLES: Rol[] = ["admin", "tesorero", "alcalde", "contador", "regidor"];

export default async function Soporte({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSoporte) return <div className="aviso error">Esta pantalla es solo para el equipo de soporte.</div>;
  const supabase = await supabaseServidor();
  let temporal: { correo: string; clave: string } | null = null;
  try {
    const c = (await cookies()).get("clave_temporal")?.value;
    temporal = c ? JSON.parse(c) : null;
  } catch {
    temporal = null;
  }

  const { data: mcps } = await supabase.from("mcps").select("id, nombre, ruc, distrito, provincia, estado, prueba_hasta, capitulo1, banco_cuenta, logo_path").order("nombre");
  const elegida = (mcps ?? []).find((m) => m.id === sp.mcp);
  const { data: fuentes } = elegida ? await supabase.from("fuentes").select("*").eq("mcp_id", elegida.id) : { data: [] };
  const { data: miembros } = elegida
    ? await supabase.from("miembros").select("id, user_id, rol, cargo, desde, hasta, activo, perfiles(nombre)").eq("mcp_id", elegida.id).order("activo", { ascending: false })
    : { data: [] };
  const vigentes = (miembros ?? []).filter((m) => m.activo);

  const lista = elegida
    ? [
        { ok: !!elegida.ruc, t: "RUC de la MCP" },
        { ok: (fuentes ?? []).length > 0, t: "Municipalidades que transfieren y montos" },
        { ok: !!elegida.banco_cuenta, t: "Cuenta del Banco de la Nación" },
        { ok: vigentes.some((m) => m.rol === "admin"), t: "Administrador de la MCP" },
        { ok: vigentes.some((m) => m.rol === "tesorero"), t: "Tesorero(a)" },
        { ok: vigentes.some((m) => m.rol === "alcalde"), t: "Alcalde" },
        { ok: Object.values((elegida.capitulo1 ?? {}) as Record<string, string>).some(Boolean), t: "Capítulo I del informe" },
      ]
    : [];

  return (
    <>
      <div className="titulo-ventana"><h1>Panel de soporte</h1></div>
      <div className="barra" style={{ display: "block" }}>
        <b className="si">Soporte hace:</b> activa la MCP, crea accesos, registra relevos y responde dudas.{" "}
        <b className="no">Soporte no ve:</b> gastos, montos, comprobantes ni rendiciones de las MCP.
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {temporal && (
        <div className="aviso ok">
          Acceso nuevo · correo <b>{temporal.correo}</b> · clave temporal <b>{temporal.clave}</b>. Entréguela en persona; este
          aviso desaparece en 2 minutos. Pida que cambie la clave al ingresar.
        </div>
      )}

      <div className="columnas">
        <div className="principal">
          <div className="tabla-marco">
            <table className="tabla" style={{ minWidth: 720 }}>
              <thead><tr><th>MCP</th><th>RUC</th><th>Distrito / provincia</th><th>Estado</th><th>Prueba hasta</th></tr></thead>
              <tbody>
                {(mcps ?? []).length === 0 && <tr><td colSpan={5} className="tenue">Aún no hay MCP registradas.</td></tr>}
                {(mcps ?? []).map((m) => (
                  <tr key={m.id} className={m.id === elegida?.id ? "sel" : undefined}>
                    <td><Link href={`/soporte?mcp=${m.id}`}>{m.nombre}</Link></td>
                    <td>{m.ruc ?? <span className="falta">Pendiente</span>}</td>
                    <td>{[m.distrito, m.provincia].filter(Boolean).join(" · ")}</td>
                    <td><Estado valor={m.estado} /></td>
                    <td>{fecha(m.prueba_hasta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {elegida && (
            <>
              <section className="panel">
                <div className="panel-cab">Usuarios de {elegida.nombre}</div>
                <div className="tabla-marco" style={{ border: "none" }}>
                  <table className="tabla">
                    <thead><tr><th>Nombre</th><th>Cargo</th><th>Desde</th><th>Hasta</th><th>Acceso</th></tr></thead>
                    <tbody>
                      {(miembros ?? []).map((m) => (
                        <tr key={m.id} className={!m.activo ? "anulado" : undefined}>
                          <td>{(m.perfiles as unknown as { nombre: string } | null)?.nombre}</td>
                          <td>{m.cargo ?? NOMBRE_ROL[m.rol as Rol]}</td>
                          <td>{fecha(m.desde)}</td>
                          <td>{m.hasta ? fecha(m.hasta) : "Vigente"}</td>
                          <td>{m.activo ? <span className="si">Con acceso</span> : "Sin acceso"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <form action={agregarUsuario} className="panel">
                <div className="panel-cab">Crear usuario o dar un cargo</div>
                <div className="panel-cuerpo rejilla">
                  <input type="hidden" name="mcp_id" value={elegida.id} />
                  <label className="campo">Correo<input name="correo" type="email" required /></label>
                  <label className="campo">Nombre completo<input name="nombre" required /></label>
                  <label className="campo">DNI<input name="dni" inputMode="numeric" /></label>
                  <label className="campo">
                    Rol
                    <select name="rol">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">Cargo (como sale en documentos)<input name="cargo" placeholder="Tesorera" /></label>
                  <label className="campo">Desde<input type="date" name="desde" defaultValue={hoyISO()} required /></label>
                  <div style={{ display: "flex", alignItems: "flex-end" }}><BotonConfirmar pregunta="¿Crear este acceso?" textoConfirmar="Sí, crear">Crear acceso</BotonConfirmar></div>
                </div>
              </form>

              <form action={registrarRelevo} className="panel">
                <div className="panel-cab">Relevo (cambio de tesorera u otro cargo)</div>
                <div className="panel-cuerpo rejilla">
                  <input type="hidden" name="mcp_id" value={elegida.id} />
                  <label className="campo">
                    Sale
                    <select name="sale" required>
                      {vigentes.map((m) => (
                        <option key={m.id} value={m.user_id}>
                          {(m.perfiles as unknown as { nombre: string } | null)?.nombre} · {NOMBRE_ROL[m.rol as Rol]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    Cargo
                    <select name="rol">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">Correo de quien entra<input name="correo" type="email" required /></label>
                  <label className="campo">Nombre de quien entra<input name="nombre" /></label>
                  <label className="campo">Fecha del acta<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
                  <div style={{ display: "flex", alignItems: "flex-end" }}><BotonConfirmar pregunta="¿Registrar el relevo?" detalle="Quien sale pierde el acceso desde la fecha del acta." textoConfirmar="Sí, registrar" peligro>Registrar relevo</BotonConfirmar></div>
                </div>
              </form>
            </>
          )}
        </div>

        <aside className="lateral">
          {elegida ? (
            <>
              <section className="panel">
                <div className="panel-cab">Lista de activación</div>
                <ul className="panel-cuerpo" style={{ listStyle: "none", margin: 0, gap: 6 }}>
                  {lista.map((l) => (
                    <li key={l.t}><span className={l.ok ? "si" : "no"}>{l.ok ? "Sí" : "No"}</span> · {l.t}</li>
                  ))}
                </ul>
              </section>
              <section className="panel">
                <div className="panel-cab">Transferencias</div>
                <table className="tabla">
                  <tbody>
                    {(fuentes ?? []).map((f) => (
                      <tr key={f.id}><td>{f.municipalidad}<div className="pequeno tenue">Formato {f.formato}</div></td><td className="num">S/ {soles(f.monto_mensual)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <form action={cambiarEstadoMcp} className="panel">
                <div className="panel-cab">Estado de la MCP</div>
                <div className="panel-cuerpo">
                  <input type="hidden" name="mcp_id" value={elegida.id} />
                  <label className="campo">
                    Estado
                    <select name="estado" defaultValue={elegida.estado}>
                      <option value="por_activar">Por activar</option>
                      <option value="prueba">En prueba</option>
                      <option value="activa">Activa</option>
                      <option value="suspendida">Suspendida</option>
                    </select>
                  </label>
                  <label className="campo">Prueba hasta<input type="date" name="prueba_hasta" defaultValue={elegida.prueba_hasta ?? ""} /></label>
                  <BotonConfirmar className="btn" pregunta="¿Cambiar el estado de la MCP?" textoConfirmar="Sí, cambiar">Guardar estado</BotonConfirmar>
                </div>
              </form>
            </>
          ) : (
            <form action={crearMcp} className="panel">
              <div className="panel-cab">Dar de alta una MCP</div>
              <div className="panel-cuerpo">
                <label className="campo">Nombre<input name="nombre" required placeholder="Municipalidad del Centro Poblado ..." /></label>
                <label className="campo">RUC<input name="ruc" inputMode="numeric" /></label>
                <label className="campo">Distrito<input name="distrito" defaultValue="Perené" /></label>
                <label className="campo">Provincia<input name="provincia" defaultValue="Chanchamayo" /></label>
                <label className="campo">Departamento<input name="departamento" defaultValue="Junín" /></label>
                <label className="campo">Municipalidad distrital<input name="muni_distrito" defaultValue="Municipalidad Distrital de Perené" /></label>
                <label className="campo">Monto mensual del distrito S/<input name="monto_distrito" inputMode="decimal" defaultValue="7080" /></label>
                <label className="campo">
                  Formato del distrito
                  <select name="formato_distrito" defaultValue="perene">
                    <option value="perene">Perené</option>
                    <option value="chanchamayo">Chanchamayo</option>
                    <option value="general">General</option>
                  </select>
                </label>
                <label className="campo">Municipalidad provincial<input name="muni_provincia" defaultValue="Municipalidad Provincial de Chanchamayo" /></label>
                <label className="campo">Monto mensual de la provincia S/ (vacío si no transfiere)<input name="monto_provincia" inputMode="decimal" defaultValue="2675" /></label>
                <label className="campo">
                  Formato de la provincia
                  <select name="formato_provincia" defaultValue="chanchamayo">
                    <option value="chanchamayo">Chanchamayo</option>
                    <option value="perene">Perené</option>
                    <option value="general">General</option>
                  </select>
                </label>
                <BotonConfirmar pregunta="¿Registrar esta MCP?" textoConfirmar="Sí, registrar">Registrar MCP</BotonConfirmar>
              </div>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
