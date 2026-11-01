import Link from "next/link";
import AutoDocumento from "@/components/AutoDocumento";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import Encabezado from "@/components/Encabezado";
import Motivo from "@/components/Motivo";
import { BANCOS, CAMPOS_CAPITULO1, CAMPOS_CAPITULO1_LARGOS, CLASIFICADORES } from "@/lib/catalogos";
import { FRECUENCIAS, MESES_LARGO, textoFrecuencia, tocaEnMes } from "@/lib/fuentes";
import VentanaFlotante from "@/components/VentanaFlotante";
import { nombreFuente } from "@/components/formularios/CamposRequerimiento";
import { cargarCatalogoPagosFijos, type PagoFijoCatalogo } from "@/lib/pagosFijos";
import { NUMERACIONES, proximoNumero } from "@/lib/numeracion";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, nombrePeriodo, periodoActual, monto2, soles, urlLogo } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { agregarCuentaBancaria, agregarFuente, cerrarMes, desactivarCuentaBancaria, desactivarFuente, fijarNumeracion, guardarCapitulo1, guardarDatosMcp, guardarFuente, reabrirMes, subirLogo, guardarPagoFijo, alternarPagoFijo, guardarExigirPin } from "./acciones";

export default async function Configuracion({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const admin = tiene(ctx, "admin");
  const m = ctx.mcp;
  const cap1 = m.capitulo1 ?? {};
  const [{ data: periodos }, { data: reaperturas }, pagosFijos, { data: cuentasExtra }] = await Promise.all([
    supabase.from("periodos").select("*").eq("mcp_id", m.id).order("periodo", { ascending: false }).limit(12),
    supabase.from("periodo_reaperturas").select("*").eq("mcp_id", m.id).order("hecho_en", { ascending: false }).limit(10),
    cargarCatalogoPagosFijos(supabase, m.id, false),
    supabase.from("cuentas_bancarias").select("id, banco, numero, alias").eq("mcp_id", m.id).eq("activo", true).order("creado_en"),
  ]);
  const mesActual = periodoActual();
  const puedePagos = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const anio = periodoActual().slice(0, 4);
  const camposPago = (p?: PagoFijoCatalogo) => (
    <div className="rejilla-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="campo">Concepto<input name="concepto" required defaultValue={p?.concepto ?? ""} placeholder="Ej.: DIETA DEL ALCALDE, HONORARIOS DEL ASESOR CONTABLE" /></label>
      <label className="campo">A quién se paga<input name="beneficiario" defaultValue={p?.beneficiario ?? ""} placeholder="Nombre completo" /></label>
      <label className="campo">DNI o RUC<input name="beneficiario_doc" inputMode="numeric" maxLength={11} defaultValue={p?.beneficiario_doc ?? ""} /></label>
      <AutoDocumento doc="beneficiario_doc" nombre="beneficiario" />
      <label className="campo">Monto mensual S/<input name="monto" required inputMode="decimal" defaultValue={p ? monto2(p.monto) : ""} placeholder="0.00" /></label>
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
    { v: "numeracion", t: "Numeración" },
    { v: "seguridad", t: "Seguridad y cierre de mes" },
  ];
  const seccion = SECCIONES.some((x) => x.v === sp.seccion) ? (sp.seccion as string) : "identidad";
  const puedeCambiar = admin || ctx.esSoporte;
  const faltan = checks.filter((c) => !c.ok);
  // Numeración: próximo número de cada documento en el año elegido
  const anioNum = /^\d{4}$/.test(sp.anio ?? "") ? Number(sp.anio) : Number(anio);
  const proximos = seccion === "numeracion" ? await Promise.all(NUMERACIONES.map((n) => proximoNumero(supabase, m.id, n.tipo, anioNum))) : [];
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
          <div className="cfg-columna">
          <form action={guardarDatosMcp} className="panel cfg-panel">
            <div className="panel-cab">
              Identidad de la MCP
              <span className="ayuda">Empiece por el RUC: el resto se llena solo.</span>
            </div>
            <fieldset disabled={!admin}>
              <div className="panel-cuerpo">
                <div className="cfg-ruc">
                  <label className="campo">
                    <span className="cfg-paso"><i>1</i> RUC de la MCP</span>
                    <input name="ruc" defaultValue={m.ruc ?? ""} inputMode="numeric" maxLength={11} placeholder="Escriba los 11 dígitos" autoComplete="off" />
                  </label>
                  <AutoDocumento doc="ruc" nombre="nombre" direccion="direccion" distrito="distrito" provincia="provincia" departamento="departamento" />
                  <span className="pequeno tenue">Al completar el RUC se buscan solos el nombre, la dirección, el distrito, la provincia y el departamento. Puede corregirlos.</span>
                </div>
                <label className="campo">
                  <span className="cfg-paso"><i>2</i> Nombre completo</span>
                  <input name="nombre" defaultValue={m.nombre} required placeholder="Municipalidad del Centro Poblado ..." />
                </label>
                <label className="campo">
                  Dirección
                  <input name="direccion" defaultValue={m.direccion ?? ""} placeholder="Av., jirón o calle, Mz., Lt." />
                </label>
                <div className="cfg-tres">
                  <label className="campo">Distrito<input name="distrito" defaultValue={m.distrito ?? ""} /></label>
                  <label className="campo">Provincia<input name="provincia" defaultValue={m.provincia ?? ""} /></label>
                  <label className="campo">Departamento<input name="departamento" defaultValue={m.departamento ?? ""} /></label>
                </div>
                <div className="cfg-banco">
                  <span className="cfg-paso"><i>3</i> Cuenta principal</span>
                  <div className="rejilla-2">
                    <label className="campo">
                      Banco
                      <select name="banco_nombre" defaultValue={(BANCOS as readonly string[]).includes(m.banco_nombre) ? m.banco_nombre : BANCOS[0]}>
                        {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    <label className="campo">
                      N° de cuenta corriente
                      <input name="banco_cuenta" defaultValue={m.banco_cuenta ?? ""} inputMode="numeric" placeholder="Sale en cada comprobante de pago" />
                    </label>
                  </div>
                </div>
                {admin && (
                  <div className="cfg-pie">
                    <BotonConfirmar pregunta="¿Guardar los datos de la MCP?" detalle="Estos datos saldrán en todos los formatos impresos." textoConfirmar="Sí, guardar">Guardar datos</BotonConfirmar>
                  </div>
                )}
              </div>
            </fieldset>
          </form>

          <section className="panel cfg-panel">
            <div className="panel-cab">
              Otras cuentas bancarias
              <span className="ayuda">Si la MCP tiene cuentas en otros bancos, agréguelas aquí.</span>
            </div>
            <div className="panel-cuerpo">
              {(cuentasExtra ?? []).length === 0 ? (
                <p className="tenue pequeno" style={{ margin: 0 }}>Solo tiene la cuenta principal.</p>
              ) : (
                <ul className="cfg-cuentas">
                  {(cuentasExtra ?? []).map((c) => (
                    <li key={c.id}>
                      <div>
                        <b>{c.banco}</b>
                        <span>N° {c.numero}{c.alias ? ` · ${c.alias}` : ""}</span>
                      </div>
                      {admin && (
                        <form action={desactivarCuentaBancaria}>
                          <input type="hidden" name="id" value={c.id} />
                          <BotonConfirmar className="btn chico contorno" pregunta="¿Quitar esta cuenta de la lista?" detalle="No se borra nada: solo deja de mostrarse." textoConfirmar="Sí, quitar">Quitar</BotonConfirmar>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {admin && (
                <VentanaFlotante boton="+ Agregar otra cuenta" titulo="Agregar una cuenta bancaria" accion={agregarCuentaBancaria} textoGuardar="Agregar cuenta" claseBoton="btn contorno">
                  <div className="rejilla-2">
                    <label className="campo">
                      Banco
                      <select name="banco" defaultValue={BANCOS[0]}>
                        {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    <label className="campo">N° de cuenta<input name="numero" inputMode="numeric" required placeholder="Solo números" /></label>
                    <label className="campo ancho">Nombre de la cuenta (opcional)<input name="alias" placeholder="Ej.: Cuenta de recaudación" /></label>
                  </div>
                </VentanaFlotante>
              )}
            </div>
          </section>
          </div>

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
        <section className="fu-seccion">
          <div className="fu-cab">
            <div>
              <h2>Fuentes de ingresos</h2>
              <p>Municipalidades u otras instituciones que transfieren dinero a la MCP: cuánto, cada cuánto y hasta qué día se rinde.</p>
            </div>
            {puedeCambiar && (
              <VentanaFlotante boton="+ Agregar fuente de ingresos" titulo="Nueva fuente de ingresos" accion={agregarFuente} textoGuardar="Agregar fuente" claseBoton="btn primario">
                <div className="rejilla-2">
                  <label className="campo ancho">
                    <span className="cfg-paso"><i>1</i> RUC o DNI de quien transfiere</span>
                    <input name="documento" inputMode="numeric" maxLength={11} placeholder="11 dígitos (RUC) u 8 (DNI)" autoComplete="off" />
                  </label>
                  <AutoDocumento doc="documento" nombre="municipalidad" />
                  <label className="campo ancho">
                    <span className="cfg-paso"><i>2</i> Nombre de la institución</span>
                    <input name="municipalidad" required placeholder="Ej.: Gobierno Regional de Junín" />
                  </label>
                  <label className="campo">Monto de cada transferencia S/<input name="monto" required inputMode="decimal" placeholder="0.00" /></label>
                  <label className="campo">
                    Cada cuánto llega
                    <select name="frecuencia" defaultValue="mensual">
                      {FRECUENCIAS.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
                    </select>
                  </label>
                  <label className="campo">
                    Primer mes en que llega
                    <select name="mes_inicio" defaultValue="1">
                      {MESES_LARGO.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                    </select>
                  </label>
                  <label className="campo">Día límite para rendir<input type="number" name="dia_limite" min={1} max={28} defaultValue={10} required /></label>
                </div>
                <p className="pequeno tenue" style={{ margin: 0 }}>El «primer mes» sirve para las transferencias trimestrales, semestrales y anuales: desde ese mes se cuenta cuándo llega cada una.</p>
              </VentanaFlotante>
            )}
          </div>

          {ctx.fuentes.length === 0 && <div className="aviso info">Aún no hay fuentes de dinero registradas.</div>}
          <div className="fu-grid">
            {ctx.fuentes.map((f) => {
              const propios = f.tipo === "propios";
              const toca = tocaEnMes(f, mesActual);
              return (
                <article key={f.id} className={`fu-card ${f.tipo}`}>
                  <header className="fu-card-cab">
                    <span className="fu-tipo">{f.tipo === "distrito" ? "Municipalidad distrital" : f.tipo === "provincia" ? "Municipalidad provincial" : f.tipo === "propios" ? "Recursos propios" : "Otra institución"}</span>
                    {!propios && <span className={`fu-pill ${toca ? "si" : "no"}`}>{toca ? "Le toca este mes" : "No le toca este mes"}</span>}
                  </header>
                  {propios ? (
                    <>
                      <h3>{f.municipalidad}</h3>
                      <p className="tenue pequeno" style={{ margin: 0 }}>Lo que la propia MCP recauda (copias, constancias, alquileres). El monto es variable: se ve en Ingresos.</p>
                    </>
                  ) : (
                    <form action={guardarFuente} className="fu-form">
                      <input type="hidden" name="fuente_id" value={f.id} />
                      <fieldset disabled={!puedeCambiar}>
                        <label className="campo">
                          RUC o DNI
                          <input name="documento" inputMode="numeric" maxLength={11} defaultValue={f.documento ?? ""} placeholder="Opcional" autoComplete="off" />
                        </label>
                        <AutoDocumento doc="documento" nombre="municipalidad" />
                        <label className="campo">
                          Nombre
                          <input name="municipalidad" defaultValue={f.municipalidad} required />
                        </label>
                        <div className="rejilla-2">
                          <label className="campo">Monto de cada transferencia S/<input name="monto" inputMode="decimal" required defaultValue={monto2(f.monto_mensual)} /></label>
                          <label className="campo">
                            Cada cuánto llega
                            <select name="frecuencia" defaultValue={f.frecuencia ?? "mensual"}>
                              {FRECUENCIAS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                            </select>
                          </label>
                          <label className="campo">
                            Primer mes en que llega
                            <select name="mes_inicio" defaultValue={f.mes_inicio ?? 1}>
                              {MESES_LARGO.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                            </select>
                          </label>
                          <label className="campo">Día límite para rendir<input type="number" name="dia_limite" min={1} max={28} defaultValue={f.dia_limite ?? 10} required /></label>
                        </div>
                        <div className="fu-resumen">{textoFrecuencia(f)} · S/ {soles(f.monto_mensual)} por transferencia</div>
                        {puedeCambiar && (
                          <div className="fu-pie">
                            <BotonConfirmar className="btn primario" pregunta="¿Guardar los cambios de esta fuente?" detalle="Cambia lo que se espera recibir y los plazos de la rendición." textoConfirmar="Sí, guardar">Guardar cambios</BotonConfirmar>
                          </div>
                        )}
                      </fieldset>
                    </form>
                  )}
                  {!propios && f.tipo === "otra" && puedeCambiar && (
                    <form action={desactivarFuente} className="fu-quitar">
                      <input type="hidden" name="fuente_id" value={f.id} />
                      <BotonConfirmar className="btn chico contorno rojo" pregunta="¿Dejar de usar esta fuente?" detalle="No se borra nada: lo ya registrado se conserva." textoConfirmar="Sí, dejar de usarla">Dejar de usar esta fuente</BotonConfirmar>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {seccion === "numeracion" && (
        <section className="fu-seccion">
          <div className="fu-cab">
            <div>
              <h2>Numeración de los documentos</h2>
              <p>Si la MCP ya emitió documentos antes de usar Zebaz (por ejemplo, ya va en la orden de servicio N.º 25), escriba aquí desde qué número debe seguir. El sistema continúa desde ahí, sin repetir números.</p>
            </div>
            <div className="nu-anios" role="group" aria-label="Año">
              {[anioNum - 1, anioNum, anioNum + 1].map((a) => (
                <Link key={a} href={`/configuracion?seccion=numeracion&anio=${a}`} className={`f-chip${a === anioNum ? " activo" : ""}`}>{a}</Link>
              ))}
            </div>
          </div>
          <div className="aviso info">La numeración empieza de nuevo cada año. Por seguridad, <b>no se puede poner un número menor al último ya emitido</b> (incluye lo anulado).</div>
          <div className="fu-grid">
            {NUMERACIONES.map((n, i) => {
              const prox = proximos[i];
              const ultimo = prox ? prox - 1 : 0;
              return (
                <article key={n.tipo} className="fu-card nu-card">
                  <header className="fu-card-cab">
                    <span className="fu-tipo">{n.nombre}</span>
                    <span className="fu-pill no">Ej.: {n.ejemplo}</span>
                  </header>
                  <div className="nu-numeros">
                    <div><span>Último emitido</span><b>{ultimo > 0 ? `N° ${ultimo}` : "Ninguno"}</b></div>
                    <div className="sig"><span>Sigue el</span><b>N° {prox ?? "—"}</b></div>
                  </div>
                  {puedeCambiar ? (
                    <form action={fijarNumeracion} className="nu-form">
                      <input type="hidden" name="tipo" value={n.tipo} />
                      <input type="hidden" name="anio" value={anioNum} />
                      <label className="campo">
                        Empezar desde el N°
                        <input type="number" name="inicio" min={1} max={999999} defaultValue={prox ?? 1} required />
                      </label>
                      <BotonConfirmar className="btn primario" pregunta={`¿Cambiar la numeración de ${n.nombre.toLowerCase()}?`} detalle={`El próximo documento de ${anioNum} saldrá con el número que escribió. No se puede volver a un número ya emitido.`} textoConfirmar="Sí, cambiar">Guardar</BotonConfirmar>
                    </form>
                  ) : (
                    <span className="pequeno tenue">Solo el administrador puede cambiarla.</span>
                  )}
                </article>
              );
            })}
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
