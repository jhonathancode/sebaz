import AutoDocumento from "@/components/AutoDocumento";
import { cookies } from "next/headers";
import BotonConfirmar from "@/components/BotonConfirmar";
import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import { NOMBRE_ROL, obtenerContexto, type Rol } from "@/lib/contexto";
import { fecha, hoyISO, soles } from "@/lib/formato";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";
import { agregarUsuario, cambiarEstadoMcp, crearMcp, registrarRelevo, restablecerPin } from "./acciones";

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
  // Relevos anteriores, con el enlace temporal a su documento de respaldo
  const { data: relevosRaw } = elegida
    ? await supabase.from("relevos").select("id, sale, entra, rol, fecha, documento_tipo, documento_numero, documento_path, confirmado_con, creado_en").eq("mcp_id", elegida.id).order("fecha", { ascending: false })
    : { data: [] };
  const nombres = new Map((miembros ?? []).map((m) => [m.user_id, (m.perfiles as unknown as { nombre: string } | null)?.nombre ?? ""]));
  const relevos = await Promise.all(
    (relevosRaw ?? []).map(async (r) => {
      let enlace: string | null = null;
      try {
        enlace = (await supabaseServicio().storage.from("relevos").createSignedUrl(r.documento_path, 600)).data?.signedUrl ?? null;
      } catch {
        enlace = null;
      }
      return { ...r, enlace };
    }),
  );

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
                    <thead><tr><th>Nombre</th><th>Cargo</th><th>Desde</th><th>Hasta</th><th>Acceso</th><th>PIN</th></tr></thead>
                    <tbody>
                      {(miembros ?? []).map((m) => (
                        <tr key={m.id} className={!m.activo ? "anulado" : undefined}>
                          <td>{(m.perfiles as unknown as { nombre: string } | null)?.nombre}</td>
                          <td>{m.cargo ?? NOMBRE_ROL[m.rol as Rol]}</td>
                          <td>{fecha(m.desde)}</td>
                          <td>{m.hasta ? fecha(m.hasta) : "Vigente"}</td>
                          <td>{m.activo ? <span className="si">Con acceso</span> : "Sin acceso"}</td>
                          <td>
                            {m.activo && (
                              <form action={restablecerPin}>
                                <input type="hidden" name="user_id" value={m.user_id} />
                                <input type="hidden" name="mcp_id" value={elegida.id} />
                                <input type="hidden" name="volver" value={`/soporte?mcp=${elegida.id}`} />
                                <BotonConfirmar className="btn chico contorno" pregunta="¿Restablecer el PIN de esta persona?" detalle="Solo hágalo si confirmó su identidad (llame al alcalde o a la persona). Al ingresar tendrá que elegir un PIN nuevo." textoConfirmar="Sí, restablecer">Restablecer</BotonConfirmar>
                              </form>
                            )}
                          </td>
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
                  <label className="campo">DNI<input name="dni" inputMode="numeric" maxLength={8} /></label>
                  <AutoDocumento doc="dni" nombre="nombre" />
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
                <div className="panel-cuerpo">
                  <div className="aviso info" style={{ margin: 0 }}>
                    Para registrar el relevo hace falta el <b>documento que designa</b> a quien entra y haber <b>confirmado el cambio</b> con el alcalde. Queda guardado como respaldo. Si es <b>cambio de tesorería</b>: lo fechado antes de la fecha del acta se puede corregir 30 días y luego queda <b>bloqueado para siempre</b>.
                  </div>
                  <div className="rejilla">
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
                    <label className="campo">
                      Documento de respaldo
                      <select name="documento_tipo" required defaultValue="resolucion">
                        <option value="resolucion">Resolución de Alcaldía</option>
                        <option value="memorando">Memorando</option>
                        <option value="acta">Acta de entrega</option>
                        <option value="otro">Otro documento</option>
                      </select>
                    </label>
                    <label className="campo">N° del documento<input name="documento_numero" placeholder="Ej.: 012-2026-MCP" /></label>
                    <label className="campo ancho">Suba el documento (PDF, JPG o PNG, hasta 4 MB)<input type="file" name="documento" accept="application/pdf,image/jpeg,image/png" required /></label>
                    <label className="campo ancho">¿Con quién confirmó el cambio y cómo?<input name="confirmado_con" required minLength={5} placeholder="Ej.: Alcalde Juan Pérez, por llamada el 24/10 a las 10:30" /></label>
                  </div>
                  <div><BotonConfirmar pregunta="¿Registrar el relevo?" detalle="Quien sale pierde el acceso desde la fecha del acta. Quedará guardado el documento de respaldo. En un cambio de tesorería, la gestión anterior se bloquea para siempre después de 30 días." textoConfirmar="Sí, registrar" peligro>Registrar relevo</BotonConfirmar></div>
                </div>
              </form>

              {relevos.length > 0 && (
                <section className="panel">
                  <div className="panel-cab">Relevos registrados</div>
                  <div className="tabla-marco" style={{ border: "none" }}>
                    <table className="tabla">
                      <thead><tr><th>Fecha</th><th>Sale</th><th>Entra</th><th>Cargo</th><th>Documento</th><th>Confirmado con</th></tr></thead>
                      <tbody>
                        {relevos.map((r) => (
                          <tr key={r.id}>
                            <td>{fecha(r.fecha)}</td>
                            <td>{nombres.get(r.sale ?? "") ?? "—"}</td>
                            <td>{nombres.get(r.entra ?? "") ?? "—"}</td>
                            <td>{NOMBRE_ROL[r.rol as Rol]}</td>
                            <td>{r.enlace ? <a href={r.enlace} target="_blank" rel="noreferrer">{r.documento_tipo}{r.documento_numero ? ` ${r.documento_numero}` : ""}</a> : r.documento_tipo}</td>
                            <td className="envolver">{r.confirmado_con}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
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
                <label className="campo">RUC<input name="ruc" inputMode="numeric" maxLength={11} /></label>
                <AutoDocumento doc="ruc" nombre="nombre" />
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
