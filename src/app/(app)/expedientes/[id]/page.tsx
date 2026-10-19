import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import CamposRequerimiento, { nombreFuente } from "@/components/formularios/CamposRequerimiento";
import VentanaFlotante from "@/components/VentanaFlotante";
import SelectFuncion from "@/components/SelectFuncion";
import { SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, fechaHora, hoyISO, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import {
  agregarCotizacion,
  anularRegistro,
  cambiarEstadoExpediente,
  copiarExpediente,
  editarRequerimiento,
  elegirCotizacion,
  emitirConformidad,
  emitirOrden,
  generarComprobante,
} from "../acciones";

type Params = Promise<{ id: string }>;
type Busqueda = Promise<{ paso?: string; fase?: string; ok?: string; error?: string; editar?: string }>;

const TIPO_GASTO: Record<string, string> = {
  compra: "Compra de bienes",
  servicio: "Servicio externo",
  pago_fijo: "Pago fijo",
};

type Proveedor = { razon_social: string; num_doc: string } | null;
const prov = (x: unknown) => x as Proveedor;

export default async function Expediente({ params, searchParams }: { params: Params; searchParams: Busqueda }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();

  const { data: e } = await supabase
    .from("expedientes")
    .select("*, fuentes(id, tipo, municipalidad, monto_mensual, formato, activo, mcp_id), perfiles!expedientes_creado_por_fkey(nombre)")
    .eq("id", id)
    .single();
  if (!e) notFound();

  const [{ data: items }, { data: cotizaciones }, { data: ordenes }, { data: conformidades }, { data: cps }, { data: historial }] =
    await Promise.all([
      supabase.from("expediente_items").select("*").eq("expediente_id", id).eq("anulado", false).order("item"),
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

  const lista = items ?? [];
  const total = lista.reduce((s, i) => s + Number(i.total), 0);
  const cots = (cotizaciones ?? []).filter((c) => !c.anulado);
  const orden = (ordenes ?? []).find((o) => !o.anulado);
  const conformidad = (conformidades ?? []).find((c) => !c.anulado);
  const cp = (cps ?? []).find((c) => c.estado !== "anulado");
  const elegida = cots.find((c) => c.elegida);
  const fijo = e.tipo === "pago_fijo";
  const anulado = e.estado === "anulado";
  const aprobado = e.estado === "aprobado" || e.estado === "rendido";
  const puedeRegistrar = tiene(ctx, "admin", "tesorero", "contador", "alcalde") && !anulado;
  const puedeAprobar = tiene(ctx, "alcalde", "admin");
  const nombreOrden = e.tipo === "compra" ? "orden de compra" : "orden de servicio";
  const fuente = e.fuentes as Parameters<typeof nombreFuente>[0] | null;

  // ------------------------------------------------------------------ pasos
  type Paso = { id: string; titulo: string; detalle: string; hecho: boolean };
  const pasos: Paso[] = [
    { id: "requerimiento", titulo: "Requerimiento", detalle: aprobado ? "Aprobado" : e.estado === "borrador" ? "Falta aprobar" : "", hecho: aprobado },
    ...(fijo
      ? []
      : [
          { id: "cotizacion", titulo: "Cotizaciones", detalle: elegida ? `Elegida: ${prov(elegida.proveedores)?.razon_social ?? ""}` : `${cots.length} registrada(s)`, hecho: !!elegida },
          { id: "orden", titulo: e.tipo === "compra" ? "Orden de compra" : "Orden de servicio", detalle: orden ? `N° ${num3(orden.numero)}-${orden.anio}` : "Pendiente", hecho: !!orden },
          { id: "conformidad", titulo: "Conformidad", detalle: conformidad ? `Memorando ${num3(conformidad.memorando_numero)}` : "Pendiente", hecho: !!conformidad },
        ]),
    { id: "comprobante", titulo: "Comprobante de pago", detalle: cp ? codigoCP(cp.numero, cp.origen) : "Pendiente", hecho: !!cp },
  ];
  const actual = pasos.find((p) => !p.hecho)?.id ?? "comprobante";
  const pedido = sp.paso ?? sp.fase;
  const visto = pasos.some((p) => p.id === pedido) ? pedido! : actual;

  // ----------------------------------------------------------- lo que sigue
  let sigue: { texto: string; ayuda?: string; accion?: React.ReactNode };
  if (anulado) {
    sigue = {
      texto: "Este expediente está anulado.",
      ayuda: `Motivo: ${e.anulado_motivo ?? ""} · ${fechaHora(e.anulado_en)}. Si había un error, use «Copiar como nuevo» para registrarlo otra vez con los datos correctos.`,
      accion: <BotonCopiar id={id} principal />,
    };
  } else if (e.estado === "borrador") {
    sigue = puedeAprobar
      ? {
          texto: "Revise el requerimiento y apruébelo.",
          ayuda: e.motivo_devolucion ? `Fue devuelto antes por: ${e.motivo_devolucion}` : "Después de aprobarlo se podrá seguir con el gasto.",
          accion: (
            <form action={cambiarEstadoExpediente}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="accion" value="aprobar" />
              <button className="btn primario grande" type="submit">Aprobar requerimiento</button>
            </form>
          ),
        }
      : {
          texto: "Ahora el alcalde debe aprobar el requerimiento.",
          ayuda: e.motivo_devolucion
            ? `El alcalde lo devolvió por: ${e.motivo_devolucion}. Corríjalo con «Corregir requerimiento» (abajo) y avísele para que lo apruebe.`
            : "Avísele al alcalde: cuando lo apruebe podrá seguir con el siguiente paso.",
        };
  } else if (!fijo && !elegida) {
    sigue = cots.length === 0
      ? {
          texto: "Pida precios a los proveedores y registre sus cotizaciones.",
          ayuda: "Lo recomendable son 3 cotizaciones. Al final elegirá la mejor.",
          accion: puedeRegistrar && <FormCotizacion id={id} principal />,
        }
      : {
          texto: `Tiene ${cots.length} cotización(es). Elija la ganadora en la lista de abajo.`,
          ayuda: cots.length < 3 ? "Si puede, registre hasta 3 antes de elegir." : "Normalmente se elige la de menor precio.",
          accion: puedeRegistrar && <FormCotizacion id={id} />,
        };
  } else if (!fijo && !orden) {
    sigue = {
      texto: `Emita la ${nombreOrden} a ${prov(elegida?.proveedores)?.razon_social} por S/ ${soles(elegida?.monto)}.`,
      ayuda: "La orden se imprime, se firma y se entrega al proveedor.",
      accion: puedeRegistrar && (
        <VentanaFlotante boton={`Emitir ${nombreOrden}`} titulo={`Emitir ${nombreOrden}`} accion={emitirOrden} textoGuardar="Emitir orden" claseBoton="btn primario grande">
          <input type="hidden" name="expediente_id" value={id} />
          <p style={{ margin: 0 }}>Proveedor: <b>{prov(elegida?.proveedores)?.razon_social}</b> · Monto: <b>S/ {soles(elegida?.monto)}</b></p>
          <div className="rejilla-2">
            <label className="campo">Fecha de la orden<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
            <label className="campo">Plazo para entregar<input name="plazo" placeholder="Ej.: 3 días, 1 mes" /></label>
          </div>
          <label className="campo">Concepto<input name="concepto" defaultValue={e.descripcion} /></label>
        </VentanaFlotante>
      ),
    };
  } else if (!fijo && !conformidad) {
    sigue = {
      texto: "Cuando el proveedor entregue, registre la conformidad.",
      ayuda: "Es el memorando del alcalde que dice que lo recibido está bien.",
      accion: puedeRegistrar && (
        <VentanaFlotante boton="Registrar conformidad" titulo="Memorando de conformidad" accion={emitirConformidad} textoGuardar="Emitir memorando" claseBoton="btn primario grande">
          <input type="hidden" name="expediente_id" value={id} />
          <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
          <label className="campo">
            Texto del memorando
            <textarea
              name="texto"
              defaultValue={`Mediante la presente se le comunica la CONFORMIDAD por ${e.descripcion.toLowerCase()}, a cargo de ${prov(orden?.proveedores)?.razon_social ?? ""}, a favor de la ${ctx.mcp.nombre}.`}
            />
          </label>
        </VentanaFlotante>
      ),
    };
  } else if (!cp) {
    sigue = {
      texto: "Genere el comprobante de pago.",
      ayuda: fijo ? "Escriba a quién se paga; el monto es el del requerimiento." : "Tenga a la mano la factura o boleta del proveedor.",
      accion: puedeRegistrar && (
        <VentanaFlotante boton="Generar comprobante de pago" titulo={`Comprobante de pago por S/ ${soles(fijo ? total : orden?.monto)}`} accion={generarComprobante} textoGuardar="Generar comprobante" claseBoton="btn primario grande">
          <input type="hidden" name="expediente_id" value={id} />
          <div className="rejilla-2">
            {fijo && (
              <>
                <label className="campo">A quién se paga<input name="beneficiario" required placeholder="Nombre completo" /></label>
                <label className="campo">DNI o RUC<input name="beneficiario_doc" inputMode="numeric" maxLength={11} /></label>
              </>
            )}
            <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
            <label className="campo">
              Documento que entregó
              <select name="sustento_tipo" defaultValue={fijo ? "REC" : "FAC"}>
                {SUSTENTOS.filter((s) => s.codigo !== "DJ" && s.codigo !== "PM").map((s) => (
                  <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
                ))}
              </select>
            </label>
            <label className="campo">Número del documento<input name="sustento_numero" placeholder="Ej.: F001-45" /></label>
            <SelectFuncion />
          </div>
        </VentanaFlotante>
      ),
    };
  } else if (cp.estado === "borrador") {
    sigue = {
      texto: `El comprobante ${codigoCP(cp.numero, cp.origen)} espera la aprobación del alcalde.`,
      accion: <Link className="btn primario grande" href={`/comprobantes/${cp.id}`}>Abrir comprobante</Link>,
    };
  } else if (cp.estado === "aprobado" && !cp.cheque) {
    sigue = {
      texto: "Cuando gire el cheque, escriba su número en el comprobante.",
      accion: <Link className="btn primario grande" href={`/comprobantes/${cp.id}`}>Escribir número de cheque</Link>,
    };
  } else if (cp.estado === "aprobado") {
    sigue = {
      texto: "Todo listo. Este gasto ya puede entrar en la rendición del mes.",
      accion: <Link className="btn primario grande" href="/rendicion">Ir a la rendición</Link>,
    };
  } else {
    sigue = {
      texto: "Este gasto ya está rendido.",
      accion: <Link className="btn primario grande" href={`/expedientes/${id}/documentos`}>Ver documentos</Link>,
    };
  }

  const docs = [
    { clave: "requerimiento", nombre: "Requerimiento", listo: true },
    ...(fijo
      ? []
      : [
          { clave: "cotizaciones", nombre: "Cuadro comparativo", listo: cots.length > 0 },
          { clave: "orden", nombre: e.tipo === "compra" ? "Orden de compra" : "Orden de servicio", listo: !!orden },
          { clave: "conformidad", nombre: "Memorando de conformidad", listo: !!conformidad },
        ]),
    { clave: "comprobante", nombre: "Comprobante de pago", listo: !!cp },
  ].filter((d) => d.listo);

  const nombreTabla: Record<string, string> = {
    expedientes: "el expediente",
    expediente_items: "un ítem",
    cotizaciones: "una cotización",
    ordenes: "la orden",
    conformidades: "la conformidad",
    comprobantes_pago: "el comprobante de pago",
  };

  return (
    <>
      <div className="titulo-ventana">
        <Link className="btn chico" href="/expedientes">← Expedientes</Link>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <h1>
            Expediente {num3(e.numero)}-{e.anio} <Estado valor={e.estado} />
          </h1>
          <div className="tenue">{e.descripcion}</div>
        </div>
        <div className="resumen-exp">
          <span><span className="etiqueta">Tipo</span>{TIPO_GASTO[e.tipo] ?? e.tipo}</span>
          <span><span className="etiqueta">Se paga con</span>{fuente ? nombreFuente(fuente) : "—"}</span>
          <span><span className="etiqueta">Monto</span><b>S/ {soles(total)}</b></span>
        </div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <ol className="pasos" aria-label="Avance del expediente">
        {pasos.map((p, n) => (
          <li key={p.id} className={`${p.hecho ? "hecho" : p.id === actual && !anulado ? "actual" : ""}${p.id === visto ? " visto" : ""}`}>
            <Link href={`/expedientes/${id}?paso=${p.id}`}>
              <span className="paso-circulo" aria-hidden="true">{p.hecho ? "✓" : n + 1}</span>
              <span className="paso-texto">
                {p.titulo}
                <small>{p.detalle}</small>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <section className={`sigue${anulado ? " anulado" : ""}`} aria-label="Lo que sigue">
        <div className="sigue-texto">
          <span className="etiqueta">{anulado ? "Anulado" : "Lo que sigue"}</span>
          <div className="sigue-titulo">{sigue.texto}</div>
          {sigue.ayuda && <div className="tenue">{sigue.ayuda}</div>}
        </div>
        {sigue.accion && <div className="sigue-accion">{sigue.accion}</div>}
      </section>

      {/* Contenido del paso que se está viendo */}
      {visto === "requerimiento" && (
        <section className="panel">
          <div className="panel-cab">
            Lo que se pide
            <span className="tenue pequeno">Registrado por {(e.perfiles as { nombre: string } | null)?.nombre ?? "—"} · {fecha(e.fecha)}</span>
          </div>
          <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
            <table className="tabla">
              <thead>
                <tr><th>N°</th><th>Qué se necesita</th><th className="num">Cantidad</th><th>Unidad</th><th className="num">Precio S/</th><th className="num">Subtotal S/</th></tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={i.id}>
                    <td>{i.item}</td>
                    <td className="envolver">{i.descripcion}</td>
                    <td className="num">{Number(i.cantidad)}</td>
                    <td>{i.unidad}</td>
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
        </section>
      )}

      {visto === "cotizacion" && !fijo && (
        <section className="panel">
          <div className="panel-cab">
            Cotizaciones
            {puedeRegistrar && !orden && aprobado && <FormCotizacion id={id} />}
          </div>
          <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
            <table className="tabla">
              <thead><tr><th>Proveedor</th><th>RUC / DNI</th><th>Plazo</th><th className="num">Precio S/</th><th className="num">Acciones</th></tr></thead>
              <tbody>
                {(cotizaciones ?? []).length === 0 && <tr><td colSpan={5} className="tenue">Aún no hay cotizaciones.</td></tr>}
                {(cotizaciones ?? []).map((c) => (
                  <tr key={c.id} className={c.anulado ? "anulado" : c.elegida ? "marcado" : undefined}>
                    <td className="tachar">{prov(c.proveedores)?.razon_social} {c.elegida && !c.anulado && <span className="estado aprobado">Elegida</span>}</td>
                    <td>{prov(c.proveedores)?.num_doc}</td>
                    <td>{c.plazo ?? "—"}</td>
                    <td className="num tachar">{soles(c.monto)}</td>
                    <td>
                      <div className="acciones-fila">
                        {!c.anulado && !c.elegida && !orden && puedeRegistrar && aprobado && (
                          <form action={elegirCotizacion}>
                            <input type="hidden" name="expediente_id" value={id} />
                            <input type="hidden" name="cotizacion_id" value={c.id} />
                            <button className="btn chico primario" type="submit">Elegir esta</button>
                          </form>
                        )}
                        {!c.anulado && !orden && puedeRegistrar && (
                          <Motivo accion={anularRegistro} boton="Anular" titulo="Anular cotización" ayuda="Motivo" campos={{ expediente_id: id, tabla: "cotizaciones", registro_id: c.id, fase: "cotizacion" }} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {visto === "orden" && !fijo && (
        <section className="panel">
          <div className="panel-cab">{e.tipo === "compra" ? "Orden de compra" : "Orden de servicio"}</div>
          <div className="panel-cuerpo">
            {(ordenes ?? []).length === 0 && <span className="tenue">Todavía no se emite la orden.</span>}
            {(ordenes ?? []).map((o) => (
              <div key={o.id} className="fila-doc">
                <div>
                  <b>N° {num3(o.numero)}-{o.anio}</b> · {fecha(o.fecha)} · {prov(o.proveedores)?.razon_social} · S/ {soles(o.monto)}
                  {o.anulado && <div className="pequeno no">Anulada: {o.anulado_motivo}</div>}
                </div>
                {!o.anulado && (
                  <div className="acciones-fila">
                    <Link className="btn chico contorno" href={`/expedientes/${id}/documentos?doc=orden`}>Ver e imprimir</Link>
                    {!conformidad && puedeRegistrar && (
                      <Motivo accion={anularRegistro} boton="Anular" titulo="Anular la orden" ayuda="Motivo" campos={{ expediente_id: id, tabla: "ordenes", registro_id: o.id, fase: "orden" }} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {visto === "conformidad" && !fijo && (
        <section className="panel">
          <div className="panel-cab">Conformidad</div>
          <div className="panel-cuerpo">
            {(conformidades ?? []).length === 0 && <span className="tenue">Todavía no se registra la conformidad.</span>}
            {(conformidades ?? []).map((c) => (
              <div key={c.id} className="fila-doc">
                <div>
                  <b>Memorando N° {num3(c.memorando_numero)}-{c.anio}</b> · {fecha(c.fecha)}
                  {c.anulado && <div className="pequeno no">Anulado: {c.anulado_motivo}</div>}
                </div>
                {!c.anulado && (
                  <div className="acciones-fila">
                    <Link className="btn chico contorno" href={`/expedientes/${id}/documentos?doc=conformidad`}>Ver e imprimir</Link>
                    {!cp && puedeRegistrar && (
                      <Motivo accion={anularRegistro} boton="Anular" titulo="Anular la conformidad" ayuda="Motivo" campos={{ expediente_id: id, tabla: "conformidades", registro_id: c.id, fase: "conformidad" }} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {visto === "comprobante" && (
        <section className="panel">
          <div className="panel-cab">Comprobante de pago</div>
          <div className="panel-cuerpo">
            {(cps ?? []).length === 0 && <span className="tenue">Todavía no se genera el comprobante de pago.</span>}
            {(cps ?? []).map((c) => (
              <div key={c.id} className="fila-doc">
                <div>
                  <b>{codigoCP(c.numero, c.origen)}</b> · {fecha(c.fecha)} · S/ {soles(c.importe)} · Cheque: {c.cheque ?? <span className="falta">pendiente</span>} <Estado valor={c.estado} />
                </div>
                <Link className="btn chico contorno" href={`/comprobantes/${c.id}`}>Abrir</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="rejilla-2" style={{ alignItems: "start" }}>
        <section className="panel">
          <div className="panel-cab">
            Documentos para imprimir
            {docs.length > 1 && <Link className="btn chico primario" href={`/expedientes/${id}/documentos?doc=todo`}>Imprimir todo</Link>}
          </div>
          <div className="panel-cuerpo">
            <div className="chips">
              {docs.map((d) => (
                <Link key={d.clave} className="chip" href={`/expedientes/${id}/documentos?doc=${d.clave}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  {d.nombre}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-cab">¿Se equivocó?</div>
          <div className="panel-cuerpo otras">
            {e.estado === "borrador" && puedeRegistrar && (
              <div>
                <VentanaFlotante boton="Corregir requerimiento" titulo={`Corregir requerimiento ${num3(e.numero)}-${e.anio}`} accion={editarRequerimiento} textoGuardar="Guardar cambios" abierta={sp.editar === "1"} ancha claseBoton="btn contorno">
                  <input type="hidden" name="id" value={id} />
                  <CamposRequerimiento
                    fuentes={ctx.fuentes}
                    valores={{
                      fecha: e.fecha,
                      tipo: e.tipo,
                      fuente_id: e.fuente_id,
                      area_usuaria: e.area_usuaria,
                      meta: e.meta,
                      clasificador: e.clasificador,
                      descripcion: e.descripcion,
                      items: lista.map((i) => ({ cantidad: Number(i.cantidad), unidad: i.unidad, descripcion: i.descripcion, precio_unitario: Number(i.precio_unitario) })),
                    }}
                  />
                </VentanaFlotante>
                <span className="tenue pequeno">Mientras no esté aprobado, puede cambiar montos y datos.</span>
              </div>
            )}
            {e.estado === "aprobado" && puedeAprobar && !orden && !cp && (
              <div>
                <Motivo accion={cambiarEstadoExpediente} boton="Devolver para corregir" titulo="Devolver el requerimiento a borrador" ayuda="¿Qué hay que corregir?" campos={{ id, accion: "devolver" }} peligro={false} />
                <span className="tenue pequeno">Vuelve a borrador para corregirlo; después se aprueba otra vez.</span>
              </div>
            )}
            {(e.estado === "borrador" || e.estado === "aprobado") && puedeRegistrar && !cp && (
              <div>
                <Motivo accion={cambiarEstadoExpediente} boton="Anular expediente" titulo={`Anular el expediente ${num3(e.numero)}-${e.anio}`} ayuda="Motivo de la anulación" campos={{ id, accion: "anular" }} />
                <span className="tenue pequeno">No se borra: queda anulado con su motivo.</span>
              </div>
            )}
            {cp && cp.estado !== "anulado" && !anulado && (
              <div className="tenue pequeno">Para anular este expediente, primero anule su comprobante de pago.</div>
            )}
            {!anulado && tiene(ctx, "admin", "tesorero", "contador", "alcalde") && (
              <div>
                <BotonCopiar id={id} />
                <span className="tenue pequeno">Crea un expediente nuevo con estos mismos datos.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <details className="panel historial-plegable">
        <summary className="panel-cab">Historial del expediente</summary>
        <div className="panel-cuerpo pequeno historial">
          {(historial ?? []).length === 0 && <span className="tenue">El historial lo ven el administrador y el alcalde.</span>}
          {(historial ?? []).map((h, i) => (
            <div key={i}>
              <span className="tenue">{fechaHora(h.en)}</span> · {usuarios.get(h.user_id) ?? "Sistema"} {h.accion === "crear" ? "registró" : "modificó"}{" "}
              {nombreTabla[h.tabla] ?? h.tabla}
              {h.tabla === "expedientes" && h.accion === "editar" && (h.despues as { estado?: string })?.estado ? ` (${(h.despues as { estado: string }).estado})` : ""}
            </div>
          ))}
        </div>
      </details>
    </>
  );
}

function BotonCopiar({ id, principal = false }: { id: string; principal?: boolean }) {
  return (
    <form action={copiarExpediente} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <button className={principal ? "btn primario grande" : "btn contorno"} type="submit">Copiar como nuevo</button>
    </form>
  );
}

function FormCotizacion({ id, principal = false }: { id: string; principal?: boolean }) {
  return (
    <VentanaFlotante
      boton={principal ? "Registrar cotización" : "+ Agregar cotización"}
      titulo="Registrar cotización"
      accion={agregarCotizacion}
      textoGuardar="Guardar cotización"
      claseBoton={principal ? "btn primario grande" : "btn chico contorno"}
    >
      <input type="hidden" name="expediente_id" value={id} />
      <div className="rejilla-2">
        <label className="campo">RUC o DNI del proveedor<input name="num_doc" required inputMode="numeric" maxLength={11} placeholder="11 u 8 dígitos" /></label>
        <label className="campo">Precio que cotizó S/<input name="monto" required inputMode="decimal" placeholder="0.00" /></label>
        <label className="campo">Nombre o razón social<input name="razon_social" placeholder="Solo si es un proveedor nuevo" /></label>
        <label className="campo">Plazo<input name="plazo" placeholder="Ej.: inmediato, 2 días" /></label>
        <label className="campo">Dirección<input name="direccion" placeholder="Solo si es nuevo" /></label>
        <label className="campo">Teléfono<input name="telefono" inputMode="tel" placeholder="Solo si es nuevo" /></label>
      </div>
      <p className="pequeno tenue" style={{ margin: 0 }}>Si el proveedor ya se registró antes, basta con su RUC.</p>
    </VentanaFlotante>
  );
}
