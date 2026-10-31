import Link from "next/link";
import AutoDocumento from "@/components/AutoDocumento";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import Encabezado from "@/components/Encabezado";
import Motivo from "@/components/Motivo";
import { CAMPOS_CAPITULO1, CAMPOS_CAPITULO1_LARGOS, CLASIFICADORES } from "@/lib/catalogos";
import VentanaFlotante from "@/components/VentanaFlotante";
import { nombreFuente } from "@/components/formularios/CamposRequerimiento";
import { cargarCatalogoPagosFijos, type PagoFijoCatalogo } from "@/lib/pagosFijos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, nombrePeriodo, periodoActual, soles, urlLogo } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { cerrarMes, guardarCapitulo1, guardarDatosMcp, guardarDiaLimite, reabrirMes, subirLogo, guardarPagoFijo, alternarPagoFijo, guardarExigirPin } from "./acciones";

export default async function Configuracion({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const admin = tiene(ctx, "admin");
  const m = ctx.mcp;
  const cap1 = m.capitulo1 ?? {};
  const [{ data: periodos }, { data: reaperturas }, pagosFijos] = await Promise.all([
    supabase.from("periodos").select("*").eq("mcp_id", m.id).order("periodo", { ascending: false }).limit(12),
    supabase.from("periodo_reaperturas").select("*").eq("mcp_id", m.id).order("hecho_en", { ascending: false }).limit(10),
    cargarCatalogoPagosFijos(supabase, m.id, false),
  ]);
  const puedePagos = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const anio = periodoActual().slice(0, 4);
  const camposPago = (p?: PagoFijoCatalogo) => (
    <div className="rejilla-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="campo">Concepto<input name="concepto" required defaultValue={p?.concepto ?? ""} placeholder="Ej.: DIETA DEL ALCALDE, HONORARIOS DEL ASESOR CONTABLE" /></label>
      <label className="campo">A quién se paga<input name="beneficiario" defaultValue={p?.beneficiario ?? ""} placeholder="Nombre completo" /></label>
      <label className="campo">DNI o RUC<input name="beneficiario_doc" inputMode="numeric" maxLength={11} defaultValue={p?.beneficiario_doc ?? ""} /></label>
      <AutoDocumento doc="beneficiario_doc" nombre="beneficiario" />
      <label className="campo">Monto mensual S/<input name="monto" required inputMode="decimal" defaultValue={p ? String(p.monto) : ""} placeholder="0.00" /></label>
      <label className="campo">
        Se paga con
        <select name="fuente_id" defaultValue={p?.fuente_id ?? ctx.fuentes[0]?.id}>
          {ctx.fuentes.map((f) => (
            <option key={f.id} value={f.id}>{nombreFuente(f)}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        Específica del gasto
        <select name="clasificador" defaultValue={p?.clasificador ?? "2.3 Bienes y servicios"}>
          {CLASIFICADORES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="campo">Unidad<input name="unidad" defaultValue={p?.unidad ?? "MES"} /></label>
      <label className="campo" style={{ gridColumn: "1 / -1", flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <input type="checkbox" name="completo" value="1" defaultChecked={p ? p.expediente_completo : true} style={{ width: "auto", marginTop: 3 }} />
        <span>
          <b>Lleva expediente completo</b>
          <span className="pequeno tenue" style={{ display: "block" }}>Con orden de servicio y memorando de conformidad antes del comprobante. Desmárquelo solo para las dietas del alcalde y regidores (solo requerimiento y comprobante).</span>
        </span>
      </label>
    </div>
  );

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

  const SECCIONES = [
    { v: "identidad", t: "Identidad y logo" },
    { v: "informe", t: "Capítulo I del informe" },
    { v: "pagos", t: "Pagos fijos" },
    { v: "dinero", t: "Dinero y plazos" },
    { v: "seguridad", t: "Seguridad y cierre de mes" },
  ];
  const seccion = SECCIONES.some((x) => x.v === sp.seccion) ? (sp.seccion as string) : "identidad";
  const puedeCambiar = admin || ctx.esSoporte;
  const faltan = checks.filter((c) => !c.ok);
  const logo = urlLogo(m.logo_path);

  return (
    <>
      <section className="cfg-hero">
        <div className="cfg-logo">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo de la MCP" />
          ) : (
            <span>Sin logo</span>
          )}
        </div>
        <div className="cfg-hero-datos">
          <h1>{m.nombre}</h1>
          <p>
            {m.ruc ? `RUC ${m.ruc}` : "RUC sin registrar"}
            {m.distrito ? ` · ${m.distrito}` : ""}
            {m.provincia ? `, ${m.provincia}` : ""}
          </p>
          <p className="tenue">Estos datos aparecen en el encabezado de todos los formatos impresos y en el informe de rendición.</p>
        </div>
        <div className="cfg-avance">
          <div className="cfg-avance-fila">
            <b>{pct} %</b>
            <span>{completos} de {checks.length} datos completos</span>
          </div>
          <div className="barra-progreso" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
          {faltan.length > 0 ? (
            <div className="cfg-faltan">
              {faltan.map((c) => (
                <span key={c.t} className="etq">Falta: {c.t}</span>
              ))}
            </div>
          ) : (
            <span className="cfg-ok">✓ Todo listo para imprimir los formatos</span>
          )}
        </div>
      </section>

      <Avisos ok={sp.ok} error={sp.error} />
      {!admin && <div className="aviso info">Solo el administrador de la MCP puede cambiar estos datos.</div>}

      <nav className="cfg-tabs" aria-label="Secciones de la configuración">
        {SECCIONES.map((x) => (
          <Link key={x.v} href={`/configuracion?seccion=${x.v}`} className={`cfg-tab${seccion === x.v ? " activa" : ""}`} aria-current={seccion === x.v ? "page" : undefined}>
            {x.t}
          </Link>
        ))}
      </nav>

      {seccion === "identidad" && (
        <div className="cfg-dos">
          <form action={guardarDatosMcp} className="panel cfg-panel">
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
                  <AutoDocumento doc="ruc" nombre="nombre" direccion="direccion" />
                  <label className="campo">
                    Dirección
                    <input name="direccion" defaultValue={m.direccion ?? ""} placeholder="Av., jirón o calle, Mz., Lt." />
                  </label>
                </div>
                <div className="cfg-tres">
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
                  <div className="cfg-pie">
                    <BotonConfirmar pregunta="¿Guardar los datos de la MCP?" detalle="Estos datos saldrán en todos los formatos impresos." textoConfirmar="Sí, guardar">Guardar datos</BotonConfirmar>
                  </div>
                )}
              </div>
            </fieldset>
          </form>

          <div className="cfg-columna">
            <section className="panel cfg-panel">
              <div className="panel-cab">Logo de la MCP</div>
              <div className="panel-cuerpo">
                <div className="logo-muestra">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="Logo actual" />
                  ) : (
                    <span className="tenue pequeno">Sin logo</span>
                  )}
                </div>
                {puedeCambiar ? (
                  <form action={subirLogo} className="cfg-form-logo">
                    <label className="campo">
                      Imagen (PNG, JPG o WEBP, máximo 900 KB)
                      <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required />
                    </label>
                    <BotonConfirmar className="btn" pregunta="¿Guardar este logo?" detalle="Aparecerá en el menú y en todos los formatos impresos." textoConfirmar="Sí, guardar">
                      {m.logo_path ? "Cambiar logo" : "Subir logo"}
                    </BotonConfirmar>
                  </form>
                ) : (
                  <span className="pequeno tenue">Solo el administrador puede cambiar el logo.</span>
                )}
              </div>
            </section>

            <section className="panel cfg-panel">
              <div className="panel-cab">Así se ve en los formatos</div>
              <div className="panel-cuerpo">
                <div className="hoja" style={{ padding: 12 }}>
                  <Encabezado mcp={m} titulo="COMPROBANTE DE PAGO" numero="N° 001" />
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {seccion === "informe" && (
        <form action={guardarCapitulo1} className="panel cfg-panel">
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
              <div className="cfg-dos-iguales">
                {CAMPOS_CAPITULO1_LARGOS.map((c) => (
                  <label key={c.clave} className="campo">
                    {c.titulo}
                    <textarea name={c.clave} defaultValue={cap1[c.clave] ?? ""} rows={4} />
                  </label>
                ))}
              </div>
              {admin && (
                <div className="cfg-pie">
                  <BotonConfirmar pregunta="¿Guardar el capítulo I?" textoConfirmar="Sí, guardar">Guardar capítulo I</BotonConfirmar>
                </div>
              )}
            </div>
          </fieldset>
        </form>
      )}

      {seccion === "pagos" && (
        <section className="panel cfg-panel" id="pagos-fijos">
          <div className="panel-cab">
            Pagos fijos de la MCP
            {puedePagos && (
              <VentanaFlotante boton="+ Agregar pago fijo" titulo="Nuevo pago fijo" accion={guardarPagoFijo} textoGuardar="Agregar a la lista" claseBoton="btn chico primario">
                {camposPago()}
              </VentanaFlotante>
            )}
          </div>
          <div className="panel-cuerpo pequeno tenue" style={{ paddingBottom: 0 }}>
            Lo que se paga todos los meses: dietas, asesor contable, personal. Al hacer un requerimiento de «Pago fijo» salen aquí con los meses ya pagados.
          </div>
          <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
            <table className="tabla" style={{ minWidth: 720 }}>
              <thead>
                <tr><th>Concepto</th><th>A quién</th><th className="num">Monto S/</th><th>Pagados {anio}</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {pagosFijos.length === 0 && <tr><td colSpan={6} className="tenue">Aún no hay pagos fijos. Agregue el primero con «+ Agregar pago fijo».</td></tr>}
                {pagosFijos.map((p) => (
                  <tr key={p.id} className={p.activo ? undefined : "anulado"}>
                    <td className="envolver" style={{ fontWeight: 600 }}>{p.concepto}</td>
                    <td className="envolver">{p.beneficiario ?? "—"}</td>
                    <td className="num">{soles(p.monto)}</td>
                    <td>{p.pagados.filter((x) => x.startsWith(`${anio}-`)).length} de 12</td>
                    <td><span className={`estado ${p.activo ? "aprobado" : "anulado"}`}>{p.activo ? "Activo" : "Inactivo"}</span></td>
                    <td>
                      {puedePagos && (
                        <div className="acciones-fila">
                          <VentanaFlotante boton="Editar" titulo={`Editar · ${p.concepto}`} accion={guardarPagoFijo} textoGuardar="Guardar cambios" claseBoton="btn chico contorno">
                            {camposPago(p)}
                            <p className="pequeno tenue" style={{ margin: 0 }}>El cambio de monto vale para los próximos requerimientos; los ya hechos no cambian.</p>
                          </VentanaFlotante>
                          <form action={alternarPagoFijo}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="activo" value={p.activo ? "0" : "1"} />
                            <BotonConfirmar className="btn chico" pregunta={p.activo ? "¿Desactivar este pago fijo?" : "¿Activar este pago fijo?"} detalle={p.activo ? "Ya no saldrá en los requerimientos. No se borra: puede activarlo después." : "Volverá a salir en los requerimientos."} textoConfirmar="Sí">
                              {p.activo ? "Desactivar" : "Activar"}
                            </BotonConfirmar>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {seccion === "dinero" && (
        <section className="panel cfg-panel">
          <div className="panel-cab">
            Con qué se paga y fecha límite para rendir
            <span className="ayuda">Los montos los registra soporte al activar la MCP. La fecha límite es el día del mes siguiente hasta el que se entrega la rendición; Inicio avisa cuántos días faltan.</span>
          </div>
          <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
            <table className="tabla">
              <thead>
                <tr><th>Municipalidad o fuente</th><th className="num">Transferencia mensual</th><th>Día límite para rendir</th></tr>
              </thead>
              <tbody>
                {ctx.fuentes.length === 0 && <tr><td colSpan={3} className="tenue">Aún no hay fuentes de dinero registradas.</td></tr>}
                {ctx.fuentes.map((f) => (
                  <tr key={f.id}>
                    <td className="envolver" style={{ fontWeight: 600 }}>{f.municipalidad}</td>
                    <td className="num">{f.tipo === "propios" ? "Variable" : `S/ ${soles(f.monto_mensual)}`}</td>
                    <td>
                      {f.tipo === "propios" ? (
                        <span className="tenue">No aplica</span>
                      ) : (
                        <form action={guardarDiaLimite} className="cfg-dia">
                          <input type="hidden" name="fuente_id" value={f.id} />
                          <input type="number" name="dia_limite" min={1} max={28} defaultValue={f.dia_limite ?? 10} required disabled={!puedeCambiar} aria-label={`Día límite de ${f.municipalidad}`} />
                          {puedeCambiar && <BotonConfirmar className="btn chico" pregunta="¿Guardar la fecha límite?" textoConfirmar="Sí, guardar">Guardar</BotonConfirmar>}
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {seccion === "seguridad" && (
        <div className="cfg-dos-iguales">
          <section className="panel cfg-panel">
            <div className="panel-cab">Seguridad</div>
            <div className="panel-cuerpo">
              <form action={guardarExigirPin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="cheque-marca">
                  <input type="checkbox" name="exigir_pin" value="1" defaultChecked={!!ctx.mcp.exigir_pin} disabled={!puedeCambiar} />
                  <span>
                    <b>Pedir PIN personal</b>
                    <small>Cada persona firma con su PIN de 4 números al crear un requerimiento, aprobar, generar comprobantes y anular. Por ahora está {ctx.mcp.exigir_pin ? "activado" : "desactivado"}. Al activarlo, quien aún no tenga PIN deberá crearlo al ingresar.</small>
                  </span>
                </label>
                {puedeCambiar && (
                  <div className="cfg-pie">
                    <BotonConfirmar className="btn" pregunta="¿Guardar la configuración de seguridad?" textoConfirmar="Sí, guardar">Guardar</BotonConfirmar>
                  </div>
                )}
              </form>
            </div>
          </section>

          <section className="panel cfg-panel">
            <div className="panel-cab">Cierre de mes</div>
            <div className="panel-cuerpo">
              {tiene(ctx, "admin", "tesorero") && (
                <form action={cerrarMes} className="cfg-cierre">
                  <label className="campo">Mes<input type="month" name="periodo" defaultValue={periodoActual()} required /></label>
                  <BotonConfirmar className="btn" pregunta="¿Cerrar el mes?" detalle="Un mes cerrado ya no acepta cambios. Solo el administrador puede reabrirlo, con un motivo." textoConfirmar="Sí, cerrar el mes" peligro>Cerrar mes</BotonConfirmar>
                </form>
              )}
              {(periodos ?? []).length === 0 && <span className="tenue pequeno">Aún no hay meses cerrados.</span>}
              {(periodos ?? []).map((p) => (
                <div key={p.periodo} className="cfg-mes-fila">
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
        </div>
      )}
    </>
  );
}
