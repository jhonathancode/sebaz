import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { NOMBRE_ROL, obtenerContexto, type Rol } from "@/lib/contexto";
import { fecha, fechaHora, hoyISO, soles } from "@/lib/formato";
import { MODULOS, modulosDe } from "@/lib/modulos";
import { estadoCliente, mensual } from "@/lib/superadmin";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";
import { anularPago, cambiarEstadoCliente, guardarModulos, guardarSuscripcion, registrarPago } from "../../acciones";

const MEDIOS = [["transferencia", "Transferencia"], ["yape", "Yape"], ["plin", "Plin"], ["deposito", "Depósito"], ["efectivo", "Efectivo"], ["otro", "Otro"]];

export default async function Cliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const [{ data: m }, { data: s }, { data: planes }, { data: pagos }, { data: miembros }] = await Promise.all([
    supabase.from("mcps").select("*").eq("id", id).single(),
    supabase.from("suscripciones").select("*").eq("mcp_id", id).maybeSingle(),
    supabase.from("planes").select("*").order("precio_mensual"),
    supabase.from("pagos_clientes").select("*").eq("mcp_id", id).order("fecha", { ascending: false }),
    supabase.from("miembros").select("user_id, rol, cargo, desde, hasta, activo, perfiles(nombre)").eq("mcp_id", id).order("activo", { ascending: false }),
  ]);
  if (!m) notFound();

  // Último ingreso de cada usuario (de la autenticación)
  const accesos = new Map<string, { correo: string; ultimo: string | null }>();
  try {
    const { data } = await supabaseServicio().auth.admin.listUsers({ page: 1, perPage: 1000 });
    data?.users.forEach((u) => accesos.set(u.id, { correo: u.email ?? "", ultimo: u.last_sign_in_at ?? null }));
  } catch {
    /* sin clave de servicio: no se muestran los accesos */
  }

  const est = estadoCliente(m.estado, s?.vence_el ?? null, s?.dias_gracia ?? 10);
  const planActual = (planes ?? []).find((p) => p.id === s?.plan_id);
  const vigentes = (pagos ?? []).filter((p) => !p.anulado);
  const totalPagado = vigentes.reduce((x, p) => x + Number(p.monto), 0);
  const sugerido = s ? Number(s.precio) : Number(planActual?.precio_mensual ?? 0);

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>{m.nombre}</h1>
          <div className="sub">RUC {m.ruc ?? "pendiente"} · {[m.distrito, m.provincia, m.departamento].filter(Boolean).join(" · ")}</div>
        </div>
        <span className={`estado ${est.clase}`} style={{ fontSize: 13 }}>{est.texto}</span>
        <span className="espacio" />
        <Link className="btn contorno" href={`/soporte?mcp=${id}`}>Usuarios y relevos</Link>
        {s && (
          <VentanaFlotante boton="+ Registrar pago" titulo={`Pago de ${m.nombre}`} accion={registrarPago} textoGuardar="Registrar pago" claseBoton="btn primario grande">
            <input type="hidden" name="mcp_id" value={id} />
            <div className="rejilla-2">
              <label className="campo">Fecha del pago<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
              <label className="campo">Meses que cubre<input type="number" name="meses" min={1} max={36} defaultValue={s.ciclo === "anual" ? 12 : 1} required /></label>
              <label className="campo">Monto S/<input name="monto" inputMode="decimal" required defaultValue={sugerido ? sugerido.toFixed(2) : ""} /></label>
              <label className="campo">
                Medio
                <select name="medio" defaultValue="transferencia">
                  {MEDIOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="campo">N° de operación<input name="operacion" /></label>
              <label className="campo">Boleta o factura emitida<input name="comprobante" placeholder="Ej.: F001-25" /></label>
            </div>
            <p className="pequeno tenue" style={{ margin: 0 }}>El vencimiento actual es el {fecha(s.vence_el)}; el pago lo extiende por los meses indicados y el cliente queda activo.</p>
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="kpis">
        <div className="kpi azul"><span className="k-et">Plan</span><span className="k-val">{planActual?.nombre ?? "—"}</span><span className="k-det">S/ {soles(s?.precio ?? 0)} {s?.ciclo === "anual" ? "al año" : "al mes"} · S/ {soles(mensual(Number(s?.precio ?? 0), s?.ciclo ?? "mensual"))} /mes</span></div>
        <div className={`kpi${["vencida", "gracia"].includes(est.clave) ? " rojo" : est.clave === "por_vencer" ? " alerta" : ""}`}><span className="k-et">Vence</span><span className="k-val">{fecha(s?.vence_el)}</span><span className="k-det">{s?.dias_gracia ?? 10} días de gracia</span></div>
        <div className="kpi"><span className="k-et">Total pagado</span><span className="k-val">S/ {soles(totalPagado)}</span><span className="k-det">{vigentes.length} pago(s)</span></div>
        <div className="kpi"><span className="k-et">Usuarios activos</span><span className="k-val">{(miembros ?? []).filter((x) => x.activo).length}</span><span className="k-det">Cliente desde {fecha(m.creado_en?.slice(0, 10))}</span></div>
      </div>

      <div className="dos-columnas">
        <div className="columna">
          <section className="panel">
            <div className="panel-cab">Pagos</div>
            <div className="filas" style={{ border: "none", borderRadius: 0 }}>
              {(pagos ?? []).length === 0 && <div className="vacio">Aún no hay pagos registrados.</div>}
              {(pagos ?? []).map((p) => (
                <div key={p.id} className={`fila${p.anulado ? " anulada" : ""}`} style={{ gridTemplateColumns: "100px minmax(0,1fr) auto auto" }}>
                  <div className="f-num">{fecha(p.fecha)}<small>{p.meses} mes(es)</small></div>
                  <div className="f-desc">
                    <span className="f-titulo">Cubre del {fecha(p.desde)} al {fecha(p.hasta)}</span>
                    <div className="f-meta">
                      <span className="etq">{MEDIOS.find(([v]) => v === p.medio)?.[1] ?? p.medio}</span>
                      {p.operacion && <span>Op. {p.operacion}</span>}
                      {p.comprobante && <span>{p.comprobante}</span>}
                      {p.anulado && <span className="no">Anulado: {p.anulado_motivo}</span>}
                    </div>
                  </div>
                  <div className="f-monto">S/ {soles(p.monto)}</div>
                  <div className="f-acc">{!p.anulado && <Motivo accion={anularPago} boton="Anular" ayuda="¿Por qué se anula este pago?" campos={{ id: p.id, mcp_id: id }} />}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-cab">Usuarios de la MCP</div>
            <div className="filas" style={{ border: "none", borderRadius: 0 }}>
              {(miembros ?? []).length === 0 && <div className="vacio">Sin usuarios. Créelos en «Usuarios y relevos».</div>}
              {(miembros ?? []).map((u, i) => {
                const a = accesos.get(u.user_id);
                return (
                  <div key={i} className={`fila${u.activo ? "" : " anulada"}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                    <div className="f-desc">
                      <span className="f-titulo">{(u.perfiles as unknown as { nombre: string } | null)?.nombre || a?.correo}</span>
                      <div className="f-meta">
                        <span className="etq">{u.cargo || NOMBRE_ROL[u.rol as Rol]}</span>
                        {a?.correo && <span>{a.correo}</span>}
                        <span>{u.activo ? `Desde ${fecha(u.desde)}` : `Salió ${fecha(u.hasta)}`}</span>
                      </div>
                    </div>
                    <div className="pequeno tenue" style={{ textAlign: "right" }}>{a?.ultimo ? `Último ingreso ${fechaHora(a.ultimo)}` : "Nunca ingresó"}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="columna">
          {s && (
            <section className="panel">
              <div className="panel-cab">Suscripción</div>
              <form action={guardarSuscripcion} className="panel-cuerpo">
                <input type="hidden" name="mcp_id" value={id} />
                <div className="rejilla-2">
                  <label className="campo">
                    Plan
                    <select name="plan_id" defaultValue={s.plan_id ?? ""}>
                      {(planes ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre} · S/ {soles(p.precio_mensual)}/mes</option>)}
                    </select>
                  </label>
                  <label className="campo">
                    Ciclo
                    <select name="ciclo" defaultValue={s.ciclo}>
                      <option value="mensual">Mensual</option>
                      <option value="anual">Anual</option>
                    </select>
                  </label>
                  <label className="campo">Precio pactado S/<input name="precio" inputMode="decimal" defaultValue={String(s.precio)} /></label>
                  <label className="campo">Vence el<input type="date" name="vence_el" defaultValue={s.vence_el} required /></label>
                  <label className="campo">Días de gracia<input type="number" name="dias_gracia" min={0} max={60} defaultValue={s.dias_gracia} /></label>
                </div>
                <label className="campo">Notas<input name="notas" defaultValue={s.notas ?? ""} placeholder="Acuerdos, descuentos, contacto de pago..." /></label>
                <BotonConfirmar className="btn primario" pregunta="¿Guardar la suscripción?" textoConfirmar="Sí, guardar">Guardar suscripción</BotonConfirmar>
              </form>
            </section>
          )}

          <section className="panel">
            <div className="panel-cab">Módulos habilitados</div>
            <form action={guardarModulos} className="panel-cuerpo">
              <input type="hidden" name="mcp_id" value={id} />
              <span className="pequeno tenue">Expedientes (requerimientos, comprobantes y pagos fijos) siempre está incluido. Si quita un módulo, el cliente deja de verlo, pero sus datos se conservan.</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {MODULOS.map((mo) => (
                  <label key={mo.clave} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" name="modulos" value={mo.clave} defaultChecked={modulosDe(m).includes(mo.clave)} /> {mo.texto}
                  </label>
                ))}
              </div>
              <BotonConfirmar className="btn primario" pregunta="¿Guardar los módulos de este cliente?" textoConfirmar="Sí, guardar">Guardar módulos</BotonConfirmar>
            </form>
          </section>

          <section className="panel">
            <div className="panel-cab">Acceso del cliente</div>
            <div className="panel-cuerpo">
              {m.estado === "suspendida" ? (
                <>
                  <div className="aviso error" style={{ margin: 0 }}>Suspendido: sus usuarios ven «Servicio suspendido». Sus datos se conservan.</div>
                  <form action={cambiarEstadoCliente}>
                    <input type="hidden" name="mcp_id" value={id} />
                    <input type="hidden" name="estado" value="activa" />
                    <BotonConfirmar className="btn primario" pregunta="¿Reactivar a este cliente?" textoConfirmar="Sí, reactivar">Reactivar</BotonConfirmar>
                  </form>
                </>
              ) : (
                <>
                  <span className="pequeno tenue">Si no paga, puede suspenderlo. Sus usuarios dejan de trabajar, pero nada se borra.</span>
                  <form action={cambiarEstadoCliente}>
                    <input type="hidden" name="mcp_id" value={id} />
                    <input type="hidden" name="estado" value="suspendida" />
                    <BotonConfirmar className="btn peligro" peligro pregunta="¿Suspender a este cliente?" detalle="Sus usuarios verán «Servicio suspendido» hasta que lo reactive." textoConfirmar="Sí, suspender">Suspender</BotonConfirmar>
                  </form>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
