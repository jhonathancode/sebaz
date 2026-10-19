import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import SelectFuncion from "@/components/SelectFuncion";
import { SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, fechaHora, hoyISO, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import {
  agregarCotizacion,
  anularRegistro,
  cambiarEstadoExpediente,
  elegirCotizacion,
  emitirConformidad,
  emitirOrden,
  generarComprobante,
} from "../acciones";

type Params = Promise<{ id: string }>;
type Busqueda = Promise<{ fase?: string; ok?: string; error?: string }>;

const PASOS = [
  { id: "requerimiento", texto: "Requerimiento" },
  { id: "cotizacion", texto: "Cotizaciones" },
  { id: "orden", texto: "Orden" },
  { id: "conformidad", texto: "Conformidad" },
  { id: "comprobante", texto: "Comprobante de pago" },
];

export default async function Expediente({ params, searchParams }: { params: Params; searchParams: Busqueda }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();

  const { data: e } = await supabase
    .from("expedientes")
    .select("*, fuentes(municipalidad), perfiles!expedientes_creado_por_fkey(nombre)")
    .eq("id", id)
    .single();
  if (!e) notFound();

  const [{ data: items }, { data: cotizaciones }, { data: ordenes }, { data: conformidades }, { data: cps }, { data: historial }] =
    await Promise.all([
      supabase.from("expediente_items").select("*").eq("expediente_id", id).order("item"),
      supabase.from("cotizaciones").select("*, proveedores(razon_social, num_doc)").eq("expediente_id", id).order("monto"),
      supabase.from("ordenes").select("*, proveedores(razon_social, num_doc)").eq("expediente_id", id).order("creado_en"),
      supabase.from("conformidades").select("*").eq("expediente_id", id).order("creado_en"),
      supabase.from("comprobantes_pago").select("id, numero, origen, fecha, importe, estado, cheque").eq("expediente_id", id),
      supabase
        .from("auditoria")
        .select("en, accion, tabla, despues, user_id")
        .or(`registro_id.eq.${id},despues->>expediente_id.eq.${id}`)
        .order("en", { ascending: false })
        .limit(30),
    ]);

  const usuarios = new Map<string, string>();
  const ids = [...new Set((historial ?? []).map((h) => h.user_id).filter(Boolean))];
  if (ids.length) {
    const { data: ps } = await supabase.from("perfiles").select("id, nombre").in("id", ids);
    (ps ?? []).forEach((p) => usuarios.set(p.id, p.nombre));
  }

  const vigentes = (items ?? []).filter((i) => !i.anulado);
  const total = vigentes.reduce((s, i) => s + Number(i.total), 0);
  const orden = (ordenes ?? []).find((o) => !o.anulado);
  const conformidad = (conformidades ?? []).find((c) => !c.anulado);
  const cp = (cps ?? []).find((c) => c.estado !== "anulado");
  const elegida = (cotizaciones ?? []).find((c) => c.elegida && !c.anulado);
  const docs = [
    { clave: "requerimiento", nombre: "Cuadro de requerimiento", numero: `N° ${num3(e.numero)}-${e.anio}`, listo: true },
    { clave: "cotizaciones", nombre: "Cuadro comparativo", numero: `${(cotizaciones ?? []).filter((c) => !c.anulado).length} cotizaciones`, listo: (cotizaciones ?? []).some((c) => !c.anulado) },
    { clave: "orden", nombre: e.tipo === "compra" ? "Orden de compra" : "Orden de servicio", numero: orden ? `N° ${num3(orden.numero)}-${orden.anio}` : "", listo: !!orden },
    { clave: "conformidad", nombre: "Memorando de conformidad", numero: conformidad ? `N° ${num3(conformidad.memorando_numero)}-${conformidad.anio}` : "", listo: !!conformidad },
    { clave: "comprobante", nombre: "Comprobante de pago", numero: cp ? codigoCP(cp.numero, cp.origen) : "", listo: !!cp },
  ];
  const fase = sp.fase ?? e.fase;
  const anulado = e.estado === "anulado";
  const puedeRegistrar = tiene(ctx, "admin", "tesorero", "contador", "alcalde") && !anulado;
  const puedeAprobar = tiene(ctx, "alcalde", "admin");
  const hechos: Record<string, boolean> = {
    requerimiento: e.estado !== "borrador",
    cotizacion: !!elegida,
    orden: !!orden,
    conformidad: !!conformidad,
    comprobante: !!cp,
  };
  const prov = (x: unknown) => x as { razon_social: string; num_doc: string } | null;
  const nombreTabla: Record<string, string> = {
    expedientes: "expediente",
    expediente_items: "ítem",
    cotizaciones: "cotización",
    ordenes: "orden",
    conformidades: "conformidad",
    comprobantes_pago: "comprobante de pago",
  };

  return (
    <>
      <div className="titulo-ventana">
        <h1>
          Expediente {num3(e.numero)}-{e.anio} · {e.descripcion}
        </h1>
        <Estado valor={e.estado} />
        <span className="espacio" />
        {e.estado === "borrador" && puedeAprobar && (
          <form action={cambiarEstadoExpediente}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="accion" value="aprobar" />
            <button className="btn primario" type="submit">Aprobar requerimiento</button>
          </form>
        )}
        {e.estado === "aprobado" && puedeAprobar && !orden && (
          <Motivo accion={cambiarEstadoExpediente} boton="Devolver" titulo="Devolver el requerimiento a borrador" ayuda="¿Por qué se devuelve?" campos={{ id, accion: "devolver" }} peligro={false} />
        )}
        {(e.estado === "borrador" || e.estado === "aprobado") && puedeRegistrar && !cp && (
          <Motivo accion={cambiarEstadoExpediente} boton="Anular" titulo={`Anular el expediente ${num3(e.numero)}-${e.anio}`} ayuda="Motivo de la anulación" campos={{ id, accion: "anular" }} />
        )}
        <Link className="btn" href={`/expedientes/${id}/documentos`}>Ver documentos</Link>
        <Link className="btn" href="/expedientes">Cerrar</Link>
      </div>
      {cp && (e.estado === "borrador" || e.estado === "aprobado") && (
        <div className="aviso info no-imprimir">
          Para anular este expediente, primero anule su comprobante de pago.
        </div>
      )}
      <Avisos ok={sp.ok} error={sp.error} />
      {e.motivo_devolucion && e.estado === "borrador" && (
        <div className="aviso error">Devuelto: {e.motivo_devolucion}</div>
      )}
      {anulado && <div className="aviso error">Anulado: {e.anulado_motivo} · {fechaHora(e.anulado_en)}</div>}

      <section className="barra" aria-label="Datos generales" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        <Dato t="Fecha" v={fecha(e.fecha)} />
        <Dato t="Tipo" v={e.tipo === "compra" ? "Compra" : "Servicio"} />
        <Dato t="Municipalidad que transfiere" v={(e.fuentes as { municipalidad: string } | null)?.municipalidad ?? "—"} />
        <Dato t="Área usuaria" v={e.area_usuaria ?? "—"} />
        <Dato t="Meta / actividad" v={e.meta ?? "—"} />
        <Dato t="Específica del gasto" v={e.clasificador ?? "—"} />
        <Dato t="Registrado por" v={(e.perfiles as { nombre: string } | null)?.nombre ?? "—"} />
        <Dato t="Monto del requerimiento" v={`S/ ${soles(total)}`} />
      </section>

      <div className="pestanas" role="tablist" aria-label="Fases del expediente">
        {PASOS.map((p) => (
          <Link
            key={p.id}
            href={`/expedientes/${id}?fase=${p.id}`}
            role="tab"
            aria-selected={fase === p.id}
            className={fase === p.id ? "activo" : hechos[p.id] ? "hecho" : undefined}
          >
            {p.texto}
            {hechos[p.id] ? " · listo" : ""}
          </Link>
        ))}
      </div>

      <div className="columnas">
        <div className="principal">
          {fase === "requerimiento" && (
            <>
              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr><th>IT</th><th className="num">Cantidad</th><th>Unidad</th><th>Descripción</th><th className="num">P. unitario</th><th className="num">Total</th></tr>
                  </thead>
                  <tbody>
                    {vigentes.map((i) => (
                      <tr key={i.id}>
                        <td>{i.item}</td>
                        <td className="num">{Number(i.cantidad)}</td>
                        <td>{i.unidad}</td>
                        <td className="envolver">{i.descripcion}</td>
                        <td className="num">{soles(i.precio_unitario)}</td>
                        <td className="num">{soles(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={5}>Total</td><td className="num">{soles(total)}</td></tr>
                  </tfoot>
                </table>
              </div>
              {e.estado === "borrador" && !puedeAprobar && (
                <div className="aviso info">Pendiente de aprobación del alcalde.</div>
              )}
            </>
          )}

          {fase === "cotizacion" && (
            <>
              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr><th>Proveedor</th><th>RUC / DNI</th><th className="num">Monto</th><th>Plazo</th><th>Resultado</th><th></th></tr>
                  </thead>
                  <tbody>
                    {(cotizaciones ?? []).length === 0 && <tr><td colSpan={6} className="tenue">Aún no hay cotizaciones.</td></tr>}
                    {(cotizaciones ?? []).map((c) => (
                      <tr key={c.id} className={c.anulado ? "anulado" : c.elegida ? "marcado" : undefined}>
                        <td className="tachar">{prov(c.proveedores)?.razon_social}</td>
                        <td>{prov(c.proveedores)?.num_doc}</td>
                        <td className="num tachar">{soles(c.monto)}</td>
                        <td>{c.plazo ?? "—"}</td>
                        <td>{c.anulado ? "Anulada" : c.elegida ? <span className="si">Elegida</span> : "—"}</td>
                        <td>
                          {!c.anulado && !c.elegida && !orden && puedeRegistrar && e.estado === "aprobado" && (
                            <form action={elegirCotizacion}>
                              <input type="hidden" name="expediente_id" value={id} />
                              <input type="hidden" name="cotizacion_id" value={c.id} />
                              <button className="btn" type="submit">Elegir</button>
                            </form>
                          )}
                          {!c.anulado && !orden && puedeRegistrar && (
                            <Motivo accion={anularRegistro} boton="Anular" ayuda="Motivo" campos={{ expediente_id: id, tabla: "cotizaciones", registro_id: c.id, fase: "cotizacion" }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {e.estado !== "aprobado" && <div className="aviso info">Las cotizaciones se eligen cuando el alcalde aprueba el requerimiento.</div>}
              {puedeRegistrar && !orden && (
                <form action={agregarCotizacion} className="panel">
                  <div className="panel-cab">Agregar cotización</div>
                  <div className="panel-cuerpo rejilla">
                    <input type="hidden" name="expediente_id" value={id} />
                    <label className="campo">RUC o DNI<input name="num_doc" required inputMode="numeric" placeholder="11 u 8 dígitos" /></label>
                    <label className="campo">Razón social (si es nuevo)<input name="razon_social" /></label>
                    <label className="campo">Dirección (si es nuevo)<input name="direccion" /></label>
                    <label className="campo">Monto S/<input name="monto" required inputMode="decimal" /></label>
                    <label className="campo">Plazo<input name="plazo" placeholder="Inmediato" /></label>
                    <div style={{ display: "flex", alignItems: "flex-end" }}><button className="btn primario" type="submit">Agregar</button></div>
                  </div>
                </form>
              )}
            </>
          )}

          {fase === "orden" && (
            <>
              {(ordenes ?? []).map((o) => (
                <div key={o.id} className="panel">
                  <div className="panel-cab">
                    Orden de {o.tipo} N° {num3(o.numero)}-{o.anio} {o.anulado && <Estado valor="anulado" />}
                  </div>
                  <div className="panel-cuerpo">
                    <div className="rejilla">
                      <Dato t="Fecha" v={fecha(o.fecha)} />
                      <Dato t="Proveedor" v={prov(o.proveedores)?.razon_social ?? ""} />
                      <Dato t="RUC" v={prov(o.proveedores)?.num_doc ?? ""} />
                      <Dato t="Monto" v={`S/ ${soles(o.monto)}`} />
                      <Dato t="Plazo" v={o.plazo ?? "—"} />
                      <Dato t="Tipo de proceso" v={o.tipo_proceso} />
                    </div>
                    <div>Concepto: {o.concepto}</div>
                    {o.anulado ? (
                      <div className="tenue">Anulada: {o.anulado_motivo}</div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link className="btn" href={`/expedientes/${id}/documentos?doc=orden`}>Ver orden</Link>
                        {!conformidad && puedeRegistrar && (
                          <Motivo accion={anularRegistro} boton="Anular orden" ayuda="Motivo" campos={{ expediente_id: id, tabla: "ordenes", registro_id: o.id, fase: "orden" }} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!orden && puedeRegistrar && (
                elegida ? (
                  <form action={emitirOrden} className="panel">
                    <div className="panel-cab">Emitir orden de {e.tipo} a {prov(elegida.proveedores)?.razon_social} por S/ {soles(elegida.monto)}</div>
                    <div className="panel-cuerpo rejilla">
                      <input type="hidden" name="expediente_id" value={id} />
                      <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
                      <label className="campo">Plazo de ejecución<input name="plazo" placeholder="01 mes" /></label>
                      <label className="campo ancho">Concepto<input name="concepto" defaultValue={e.descripcion} /></label>
                      <div><button className="btn primario" type="submit">Emitir orden</button></div>
                    </div>
                  </form>
                ) : (
                  <div className="aviso info">Primero elija la cotización ganadora.</div>
                )
              )}
            </>
          )}

          {fase === "conformidad" && (
            <>
              {(conformidades ?? []).map((c) => (
                <div key={c.id} className="panel">
                  <div className="panel-cab">Memorando N° {num3(c.memorando_numero)}-{c.anio} · Conformidad {c.anulado && <Estado valor="anulado" />}</div>
                  <div className="panel-cuerpo">
                    <div>Fecha: {fecha(c.fecha)}</div>
                    {c.texto && <div>{c.texto}</div>}
                    {c.anulado ? (
                      <div className="tenue">Anulado: {c.anulado_motivo}</div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link className="btn" href={`/expedientes/${id}/documentos?doc=conformidad`}>Ver memorando</Link>
                        {!cp && puedeRegistrar && (
                          <Motivo accion={anularRegistro} boton="Anular conformidad" ayuda="Motivo" campos={{ expediente_id: id, tabla: "conformidades", registro_id: c.id, fase: "conformidad" }} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!conformidad && puedeRegistrar && (
                orden ? (
                  <form action={emitirConformidad} className="panel">
                    <div className="panel-cab">Memorando de conformidad (del alcalde a la tesorera)</div>
                    <div className="panel-cuerpo rejilla">
                      <input type="hidden" name="expediente_id" value={id} />
                      <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
                      <label className="campo ancho">
                        Texto
                        <textarea
                          name="texto"
                          defaultValue={`Mediante la presente se le comunica la CONFORMIDAD por ${e.descripcion.toLowerCase()}, a cargo de ${prov(orden.proveedores)?.razon_social}, a favor de la ${ctx.mcp.nombre}.`}
                        />
                      </label>
                      <div><button className="btn primario" type="submit">Emitir conformidad</button></div>
                    </div>
                  </form>
                ) : (
                  <div className="aviso info">Primero emita la orden.</div>
                )
              )}
            </>
          )}

          {fase === "comprobante" && (
            <>
              {(cps ?? []).map((c) => (
                <div key={c.id} className="barra">
                  <Link href={`/comprobantes/${c.id}`} style={{ fontWeight: 600 }}>{codigoCP(c.numero, c.origen)}</Link>
                  <span>{fecha(c.fecha)}</span>
                  <span>S/ {soles(c.importe)}</span>
                  <span>Cheque: {c.cheque ?? <span className="falta">pendiente</span>}</span>
                  <Estado valor={c.estado} />
                </div>
              ))}
              {!cp && puedeRegistrar && (
                conformidad ? (
                  <form action={generarComprobante} className="panel">
                    <div className="panel-cab">Generar comprobante de pago por S/ {soles(orden?.monto)}</div>
                    <div className="panel-cuerpo rejilla">
                      <input type="hidden" name="expediente_id" value={id} />
                      <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
                      <label className="campo">
                        Sustento
                        <select name="sustento_tipo" defaultValue="FAC">
                          {SUSTENTOS.filter((s) => s.codigo !== "DJ" && s.codigo !== "PM").map((s) => (
                            <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
                          ))}
                        </select>
                      </label>
                      <label className="campo">N° del sustento<input name="sustento_numero" placeholder="F001-45" /></label>
                      <SelectFuncion />
                      <div><button className="btn primario" type="submit">Generar comprobante</button></div>
                    </div>
                  </form>
                ) : (
                  <div className="aviso info">El comprobante de pago se genera cuando hay conformidad.</div>
                )
              )}
            </>
          )}
        </div>

        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">Documentos del expediente</div>
            <div className="panel-cuerpo" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <ul className="lista-docs">
                {docs.map((d) => (
                  <li key={d.clave}>
                    <span className={d.listo ? "si" : "tenue"} aria-hidden="true">{d.listo ? "✓" : "○"}</span>
                    <span className="nombre-doc">
                      {d.nombre}
                      <small>{d.listo ? d.numero : "Aún no existe"}</small>
                    </span>
                    {d.listo && (
                      <Link className="btn" href={`/expedientes/${id}/documentos?doc=${d.clave}`}>Ver</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel-cuerpo" style={{ paddingTop: 0 }}>
              <Link className="btn primario" href={`/expedientes/${id}/documentos?doc=todo`}>Ver expediente completo</Link>
            </div>
          </section>
          <section className="panel">
            <div className="panel-cab">Revisión</div>
            <ul className="panel-cuerpo" style={{ listStyle: "none", margin: 0, gap: 6 }}>
              <Check ok={e.estado !== "borrador"} t="Requerimiento aprobado por el alcalde" />
              <Check ok={(cotizaciones ?? []).filter((c) => !c.anulado).length >= 3} t="Tres cotizaciones" />
              <Check ok={!!elegida} t="Proveedor elegido" />
              <Check ok={!!orden} t="Orden emitida" />
              <Check ok={!!conformidad} t="Conformidad emitida" />
              <Check ok={!!cp} t="Comprobante de pago generado" />
            </ul>
          </section>
          {historial && historial.length > 0 && (
            <section className="panel">
              <div className="panel-cab">Historial</div>
              <div className="panel-cuerpo pequeno">
                {historial.map((h, i) => (
                  <div key={i}>
                    <span className="tenue">{fechaHora(h.en)}</span>
                    <br />
                    {usuarios.get(h.user_id) ?? "Sistema"} {h.accion === "crear" ? "registró" : "modificó"} {nombreTabla[h.tabla] ?? h.tabla}
                    {h.tabla === "expedientes" && h.accion === "editar" && (h.despues as { estado?: string })?.estado
                      ? ` (${(h.despues as { estado: string }).estado})`
                      : ""}
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <div className="etiqueta">{t}</div>
      <div>{v}</div>
    </div>
  );
}

function Check({ ok, t }: { ok: boolean; t: string }) {
  return (
    <li>
      <span className={ok ? "si" : "no"}>{ok ? "Sí" : "No"}</span> · {t}
    </li>
  );
}
