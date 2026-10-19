import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Encabezado from "@/components/Encabezado";
import Motivo from "@/components/Motivo";
import { CAMPOS_CAPITULO1, CAMPOS_CAPITULO1_LARGOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, nombrePeriodo, periodoActual, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { cerrarMes, guardarCapitulo1, guardarDatosMcp, reabrirMes } from "./acciones";

export default async function Configuracion({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const admin = tiene(ctx, "admin");
  const m = ctx.mcp;
  const cap1 = m.capitulo1 ?? {};
  const [{ data: periodos }, { data: reaperturas }] = await Promise.all([
    supabase.from("periodos").select("*").eq("mcp_id", m.id).order("periodo", { ascending: false }).limit(12),
    supabase.from("periodo_reaperturas").select("*").eq("mcp_id", m.id).order("hecho_en", { ascending: false }).limit(10),
  ]);

  const checks = [
    { ok: !!m.nombre, t: "Nombre de la MCP" },
    { ok: !!m.ruc, t: "RUC" },
    { ok: !!m.direccion, t: "Dirección" },
    { ok: !!(m.distrito && m.provincia), t: "Distrito y provincia" },
    { ok: !!m.banco_cuenta, t: `Cuenta del ${m.banco_nombre}` },
    { ok: ctx.fuentes.length > 0, t: "Municipalidades que transfieren" },
    { ok: CAMPOS_CAPITULO1.some((c) => cap1[c.clave]), t: "Capítulo I: generalidades" },
    { ok: CAMPOS_CAPITULO1_LARGOS.some((c) => cap1[c.clave]), t: "Capítulo I: objetivos y limitaciones" },
  ];
  const completos = checks.filter((c) => c.ok).length;
  const pct = Math.round((completos / checks.length) * 100);

  return (
    <>
      <div className="titulo-ventana">
        <h1>Configuración de la MCP</h1>
        <p className="descripcion">Estos datos aparecen en el encabezado de todos los formatos impresos y en el informe de rendición.</p>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {!admin && <div className="aviso info">Solo el administrador de la MCP puede cambiar estos datos.</div>}

      <div className="columnas">
        <div className="principal">
          <form action={guardarDatosMcp} className="panel">
            <div className="panel-cab">
              Identidad de la MCP
              <span className="ayuda">Tal como figura en la ficha RUC.</span>
            </div>
            <fieldset disabled={!admin}>
              <div className="panel-cuerpo">
                <label className="campo">
                  Nombre completo
                  <input name="nombre" defaultValue={m.nombre} required placeholder="Municipalidad del Centro Poblado ..." />
                </label>
                <div className="rejilla-2">
                  <label className="campo">
                    RUC
                    <input name="ruc" defaultValue={m.ruc ?? ""} inputMode="numeric" maxLength={11} placeholder="11 dígitos" />
                  </label>
                  <label className="campo">
                    Dirección
                    <input name="direccion" defaultValue={m.direccion ?? ""} placeholder="Av., jirón o calle, Mz., Lt." />
                  </label>
                </div>
                <div className="rejilla">
                  <label className="campo">Distrito<input name="distrito" defaultValue={m.distrito ?? ""} /></label>
                  <label className="campo">Provincia<input name="provincia" defaultValue={m.provincia ?? ""} /></label>
                  <label className="campo">Departamento<input name="departamento" defaultValue={m.departamento ?? ""} /></label>
                </div>
                <div className="rejilla-2">
                  <label className="campo">Banco<input value={m.banco_nombre} readOnly /></label>
                  <label className="campo">
                    N° de cuenta corriente
                    <input name="banco_cuenta" defaultValue={m.banco_cuenta ?? ""} inputMode="numeric" placeholder="Sale en cada comprobante de pago" />
                  </label>
                </div>
                {admin && (
                  <div>
                    <button className="btn primario" type="submit">Guardar datos</button>
                  </div>
                )}
              </div>
            </fieldset>
          </form>

          <form action={guardarCapitulo1} className="panel">
            <div className="panel-cab">
              Capítulo I del informe de gestión
              <span className="ayuda">Se escribe una sola vez y se copia en cada rendición a Perené. Cámbielo cuando haga falta.</span>
            </div>
            <fieldset disabled={!admin}>
              <div className="panel-cuerpo">
                <div className="etiqueta">1.1 Generalidades</div>
                <div className="rejilla-2">
                  {CAMPOS_CAPITULO1.map((c) => (
                    <label key={c.clave} className="campo">
                      {c.titulo}
                      <input name={c.clave} defaultValue={cap1[c.clave] ?? ""} />
                    </label>
                  ))}
                </div>
                {CAMPOS_CAPITULO1_LARGOS.map((c) => (
                  <label key={c.clave} className="campo">
                    {c.titulo}
                    <textarea name={c.clave} defaultValue={cap1[c.clave] ?? ""} />
                  </label>
                ))}
                {admin && (
                  <div>
                    <button className="btn primario" type="submit">Guardar capítulo I</button>
                  </div>
                )}
              </div>
            </fieldset>
          </form>
        </div>

        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">
              Datos completos
              <span className="tenue">{completos} de {checks.length}</span>
            </div>
            <div className="panel-cuerpo">
              <div className="barra-progreso" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
              <ul className="lista-check">
                {checks.map((c) => (
                  <li key={c.t}>
                    <span className={c.ok ? "si" : "no"}>{c.ok ? "✓" : "✗"}</span> {c.t}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="panel">
            <div className="panel-cab">Así se ve en los formatos</div>
            <div className="panel-cuerpo">
              <div className="hoja" style={{ padding: 12 }}>
                <Encabezado mcp={m} titulo="COMPROBANTE DE PAGO" numero="N° 001" />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-cab">Con qué se paga</div>
            <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
              <table className="tabla">
                <tbody>
                  {ctx.fuentes.map((f) => (
                    <tr key={f.id}>
                      <td className="envolver" style={{ minWidth: 0 }}>{f.municipalidad}</td>
                      <td className="num">{f.tipo === "propios" ? "Variable" : `S/ ${soles(f.monto_mensual)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-cuerpo pequeno tenue" style={{ paddingTop: 8 }}>Los montos los registra soporte al activar la MCP.</div>
          </section>

          <section className="panel">
            <div className="panel-cab">Cierre de mes</div>
            <div className="panel-cuerpo">
              {tiene(ctx, "admin", "tesorero") && (
                <form action={cerrarMes} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="campo" style={{ flex: 1 }}>Mes<input type="month" name="periodo" defaultValue={periodoActual()} required /></label>
                  <button className="btn" type="submit">Cerrar mes</button>
                </form>
              )}
              {(periodos ?? []).length === 0 && <span className="tenue pequeno">Aún no hay meses cerrados.</span>}
              {(periodos ?? []).map((p) => (
                <div key={p.periodo} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ flex: 1 }}>{nombrePeriodo(p.periodo)}</span>
                  {p.cerrado ? <span className="no">Cerrado</span> : <span className="si">Abierto</span>}
                  {p.cerrado && admin && (
                    <Motivo accion={reabrirMes} boton="Reabrir" ayuda="¿Por qué se reabre?" campos={{ periodo: p.periodo }} peligro={false} />
                  )}
                </div>
              ))}
              {(reaperturas ?? []).length > 0 && (
                <div className="pequeno">
                  <b>Reaperturas</b>
                  {(reaperturas ?? []).map((r) => (
                    <div key={r.id} className="tenue">{nombrePeriodo(r.periodo)} · {fechaHora(r.hecho_en)} · {r.motivo}</div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
