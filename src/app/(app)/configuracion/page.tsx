import Avisos, { type ParamsAviso } from "@/components/Avisos";
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
  const { data: periodos } = await supabase.from("periodos").select("*").eq("mcp_id", m.id).order("periodo", { ascending: false }).limit(12);
  const { data: reaperturas } = await supabase.from("periodo_reaperturas").select("*").eq("mcp_id", m.id).order("hecho_en", { ascending: false }).limit(10);
  const dis = !admin;

  return (
    <>
      <div className="titulo-ventana"><h1>Configuración de la MCP</h1></div>
      <Avisos ok={sp.ok} error={sp.error} />
      {!admin && <div className="aviso info">Solo el administrador de la MCP puede cambiar estos datos.</div>}

      <div className="columnas">
        <div className="principal">
          <form action={guardarDatosMcp} className="panel">
            <div className="panel-cab">Datos de la MCP (salen en el encabezado de los formatos)</div>
            <fieldset disabled={dis} style={{ border: "none", padding: 0, margin: 0 }}>
              <div className="panel-cuerpo rejilla">
                <label className="campo ancho">Nombre<input name="nombre" defaultValue={m.nombre} required /></label>
                <label className="campo">RUC<input name="ruc" defaultValue={m.ruc ?? ""} inputMode="numeric" placeholder="11 dígitos" /></label>
                <label className="campo">Dirección<input name="direccion" defaultValue={m.direccion ?? ""} /></label>
                <label className="campo">Distrito<input name="distrito" defaultValue={m.distrito ?? ""} /></label>
                <label className="campo">Provincia<input name="provincia" defaultValue={m.provincia ?? ""} /></label>
                <label className="campo">Departamento<input name="departamento" defaultValue={m.departamento ?? ""} /></label>
                <label className="campo">Cuenta del {m.banco_nombre}<input name="banco_cuenta" defaultValue={m.banco_cuenta ?? ""} /></label>
                {admin && <div className="ancho"><button className="btn primario" type="submit">Guardar datos</button></div>}
              </div>
            </fieldset>
          </form>

          <form action={guardarCapitulo1} className="panel">
            <div className="panel-cab">Capítulo I del informe de gestión (se escribe una vez y se copia cada mes)</div>
            <fieldset disabled={dis} style={{ border: "none", padding: 0, margin: 0 }}>
              <div className="panel-cuerpo rejilla">
                {CAMPOS_CAPITULO1.map((c) => (
                  <label key={c.clave} className="campo">{c.titulo}<input name={c.clave} defaultValue={cap1[c.clave] ?? ""} /></label>
                ))}
                {CAMPOS_CAPITULO1_LARGOS.map((c) => (
                  <label key={c.clave} className="campo ancho">{c.titulo}<textarea name={c.clave} defaultValue={cap1[c.clave] ?? ""} /></label>
                ))}
                {admin && <div className="ancho"><button className="btn primario" type="submit">Guardar capítulo I</button></div>}
              </div>
            </fieldset>
          </form>
        </div>

        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">Municipalidades que transfieren</div>
            <table className="tabla">
              <tbody>
                {ctx.fuentes.map((f) => (
                  <tr key={f.id}><td>{f.municipalidad}</td><td className="num">S/ {soles(f.monto_mensual)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="panel-cuerpo pequeno tenue">Los montos los registra soporte al activar la MCP.</div>
          </section>

          <section className="panel">
            <div className="panel-cab">Cierre de mes</div>
            <div className="panel-cuerpo">
              {tiene(ctx, "admin", "tesorero") && (
                <form action={cerrarMes} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <label className="campo">Mes<input type="month" name="periodo" defaultValue={periodoActual()} required /></label>
                  <button className="btn" type="submit">Cerrar mes</button>
                </form>
              )}
              <table className="tabla">
                <tbody>
                  {(periodos ?? []).map((p) => (
                    <tr key={p.periodo}>
                      <td>{nombrePeriodo(p.periodo)}</td>
                      <td>{p.cerrado ? <span className="no">Cerrado</span> : <span className="si">Abierto</span>}</td>
                      <td>
                        {p.cerrado && admin && (
                          <Motivo accion={reabrirMes} boton="Reabrir" ayuda="¿Por qué se reabre?" campos={{ periodo: p.periodo }} peligro={false} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(reaperturas ?? []).length > 0 && (
                <div className="pequeno">
                  <b>Reaperturas</b>
                  {(reaperturas ?? []).map((r) => (
                    <div key={r.id}>{nombrePeriodo(r.periodo)} · {fechaHora(r.hecho_en)} · {r.motivo}</div>
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
