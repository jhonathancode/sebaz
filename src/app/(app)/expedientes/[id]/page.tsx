import Link from "next/link";
import BotonConfirmar from "@/components/BotonConfirmar";
import BotonPdf from "@/components/BotonPdf";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import CamposRequerimiento, { nombreFuente } from "@/components/formularios/CamposRequerimiento";
import VentanaFlotante from "@/components/VentanaFlotante";
import DocumentosExpediente, { Memorando, Orden, type DatosExpediente } from "@/components/formatos/DocumentosExpediente";
import FormatoComprobante from "@/components/formatos/FormatoComprobante";
import { FormatoNea } from "@/components/formatos/FormatosAlmacen";
import { cargarExpediente } from "@/lib/documentos";
import { cargarCierres, estadoGestion } from "@/lib/gestion";
import { siguienteCheque } from "@/lib/pagosFijos";
import SelectFuncion from "@/components/SelectFuncion";
import { SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, fechaHora, hoyISO, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import {
  agregarCotizacion,
  anularExpedienteTotal,
  anularRegistro,
  asignarFuente,
  cambiarEstadoExpediente,
  copiarExpediente,
  editarRequerimiento,
  elegirCotizacion,
  emitirConformidad,
  emitirOrden,
  generarComprobante,
  proveedorUnico,
} from "../acciones";
import CamposProveedor, { type ProveedorConocido } from "@/components/formularios/CamposProveedor";
import { compraSinAlmacen } from "../../almacen/acciones";
import { registrarCheque } from "../../comprobantes/acciones";

type Params = Promise<{ id: string }>;

/** Al elegir un paso arriba, el documento de abajo cambia al mismo. */
const DOC_DE_PASO: Record<string, string> = { requerimiento: "requerimiento", cotizacion: "cotizaciones", orden: "orden", conformidad: "conformidad", comprobante: "comprobante" };
type Busqueda = Promise<{ paso?: string; fase?: string; ok?: string; error?: string; editar?: string; ver?: string }>;

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

  const [{ data: items }, { data: cotizaciones }, { data: ordenes }, { data: conformidades }, { data: cps }, { data: historial }, { data: neas }] =
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
      supabase.from("notas_entrada").select("id, numero, anio, fecha, anulado, anulado_motivo").eq("expediente_id", id).order("creado_en"),
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
  const nea = (neas ?? []).find((n) => !n.anulado);
  const conAlmacen = e.tipo === "compra";
  const sinAlmacen = (e as { sin_almacen_motivo?: string | null }).sin_almacen_motivo ?? null;
  const elegida = cots.find((c) => c.elegida);
  const fijo = e.tipo === "pago_fijo";
  const anulado = e.estado === "anulado";
  const aprobado = e.estado === "aprobado" || e.estado === "rendido";
  // Gestión anterior (antes de un cambio de tesorería): 30 días de gracia y luego bloqueado
  const gestion = estadoGestion(e.fecha, await cargarCierres(supabase, ctx.mcp.id), hoyISO());
  const bloqueadoGestion = gestion?.estado === "bloqueado";
  const puedeRegistrar = tiene(ctx, "admin", "tesorero", "contador", "alcalde") && !anulado && !bloqueadoGestion;
  const puedeAprobar = tiene(ctx, "alcalde", "admin") && !bloqueadoGestion;
  const nombreOrden = e.tipo === "compra" ? "orden de compra" : "orden de servicio";
  const fuente = e.fuentes as Parameters<typeof nombreFuente>[0] | null;

  // Datos de los formatos (vista previa antes de emitir y vista del documento)
  const pagoFijoId = (e as { pago_fijo_id?: string | null }).pago_fijo_id ?? null;
  const [datosDoc, { data: tesoreroDoc }, { data: pagoFijo }, chequeSugerido] = await Promise.all([
    cargarExpediente(supabase, id),
    supabase.from("miembros").select("cargo, perfiles(nombre)").eq("mcp_id", ctx.mcp.id).eq("rol", "tesorero").eq("activo", true).maybeSingle(),
    pagoFijoId
      ? supabase.from("pagos_fijos").select("beneficiario, beneficiario_doc").eq("id", pagoFijoId).maybeSingle()
      : Promise.resolve({ data: null as { beneficiario: string | null; beneficiario_doc: string | null } | null }),
    siguienteCheque(supabase, ctx.mcp.id),
  ]);
  const { data: provData } = await supabase.from("proveedores").select("num_doc, razon_social, direccion, telefono").eq("mcp_id", ctx.mcp.id).order("razon_social");
  const proveedores: ProveedorConocido[] = provData ?? [];
  const nombreTesorero = (tesoreroDoc?.perfiles as unknown as { nombre: string } | null)?.nombre ?? "";
  const cargoTesorero = tesoreroDoc?.cargo ?? "Tesorero(a)";

  const textoConformidad = `Mediante la presente se le comunica la CONFORMIDAD por ${e.descripcion.toLowerCase()}, a cargo de ${prov(orden?.proveedores)?.razon_social ?? ""}, a favor de la ${ctx.mcp.nombre}.`;

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
          ...(conAlmacen
            ? [{ id: "almacen", titulo: "Almacén (NEA)", detalle: nea ? `NEA ${num3(nea.numero)}-${nea.anio}` : sinAlmacen ? "No pasa por almacén" : "Pendiente", hecho: !!nea || !!sinAlmacen }]
            : []),
        ]),
    { id: "comprobante", titulo: "Comprobante de pago", detalle: cp ? codigoCP(cp.numero, cp.origen) : "Pendiente", hecho: !!cp },
  ];
  const actual = pasos.find((p) => !p.hecho)?.id ?? "comprobante";
  const listos = pasos.filter((p) => p.hecho).length;
  const pedido = sp.paso ?? sp.fase;
  const visto = pasos.some((p) => p.id === pedido) ? pedido! : actual;

  // ----------------------------------------------------------- lo que sigue
  let sigue: { texto: string; ayuda?: string; accion?: React.ReactNode };
  if (anulado) {
    sigue = {
      texto: "Este expediente está anulado.",
      ayuda: `Motivo: ${e.anulado_motivo ?? ""} · ${fechaHora(e.anulado_en)}. Sus documentos se pueden imprimir y salen con el sello ANULADO. Si había un error, use «Copiar como nuevo» para registrarlo otra vez con los datos correctos.`,
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
              <BotonConfirmar pin className="btn primario grande" pregunta="¿Aprobar este requerimiento?" detalle="Después de aprobarlo ya no se puede cambiar el monto, salvo que se devuelva a borrador." textoConfirmar="Sí, aprobar">Aprobar requerimiento</BotonConfirmar>
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
          ayuda: "Lo recomendable son 3 cotizaciones. Si es un servicio menor o recurrente con un solo proveedor, use «Un solo proveedor» y se salta este paso.",
          accion: puedeRegistrar && (
            <div className="acciones-fila">
              <FormCotizacion id={id} principal proveedores={proveedores} />
              <FormProveedorUnico id={id} monto={total} proveedores={proveedores} />
            </div>
          ),
        }
      : {
          texto: `Tiene ${cots.length} cotización(es). Elija la ganadora en la lista de abajo.`,
          ayuda: cots.length < 3 ? "Si puede, registre hasta 3 antes de elegir." : "Normalmente se elige la de menor precio.",
          accion: puedeRegistrar && <FormCotizacion id={id} proveedores={proveedores} />,
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
          <label className="opcion-linea">
            <input type="checkbox" name="con_conformidad" value="1" />
            <span>
              <b>{e.tipo === "compra" ? "Los bienes ya llegaron conformes" : "El servicio ya se prestó conforme"}:</b> emitir también el memorando de conformidad (un paso menos).
            </span>
          </label>
          <input type="hidden" name="texto_conformidad" value={`Mediante la presente se le comunica la CONFORMIDAD por ${e.descripcion.toLowerCase()}, a cargo de ${prov(elegida?.proveedores)?.razon_social ?? ""}, a favor de la ${ctx.mcp.nombre}.`} />
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
              defaultValue={textoConformidad}
            />
          </label>
        </VentanaFlotante>
      ),
    };
  } else if (conAlmacen && !nea && !sinAlmacen && !cp) {
    sigue = {
      texto: "Registre la entrada de los bienes al almacén (NEA).",
      ayuda: "Los bienes comprados entran al stock y luego se entregan con PECOSA. Si se consumieron de inmediato (por ejemplo combustible), indíquelo con «No pasa por almacén».",
      accion: puedeRegistrar && (
        <div className="acciones-fila">
          <Link className="btn primario grande" href={`/almacen/nea/nueva?expediente=${id}`}>Ingresar al almacén (NEA)</Link>
          <Motivo accion={compraSinAlmacen} boton="No pasa por almacén" titulo="Estos bienes no pasan por almacén" ayuda="¿Por qué? Ej.: combustible consumido en el traslado, refrigerio de la faena" campos={{ id }} peligro={false} />
        </div>
      ),
    };
  } else if (!cp) {
    sigue = {
      texto: "Genere el comprobante de pago.",
      ayuda: fijo ? "Escriba a quién se paga; el monto es el del requerimiento." : "Tenga a la mano la factura o boleta del proveedor.",
      accion: puedeRegistrar && !e.fuente_id ? (
        <span className="falta">Primero defina con qué dinero se paga (aviso de arriba).</span>
      ) : puedeRegistrar && (
        <VentanaFlotante boton="Generar comprobante de pago" titulo={`Comprobante de pago por S/ ${soles(fijo ? total : orden?.monto)}`} accion={generarComprobante} pin textoGuardar="Generar comprobante" claseBoton="btn primario grande">
          <input type="hidden" name="expediente_id" value={id} />
          <div className="rejilla-2">
            {fijo && (
              <>
                <label className="campo">A quién se paga<input name="beneficiario" required placeholder="Nombre completo" defaultValue={pagoFijo?.beneficiario ?? ""} /></label>
                <label className="campo">DNI o RUC<input name="beneficiario_doc" inputMode="numeric" maxLength={11} defaultValue={pagoFijo?.beneficiario_doc ?? ""} /></label>
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
            <label className="campo">N° de cheque (siguiente de la chequera)<input name="cheque" inputMode="numeric" pattern="\d{4,12}" defaultValue={e.cheque_previsto ?? chequeSugerido} placeholder="Si ya lo giró; si no, después" /></label>
            <SelectFuncion />
          </div>
        </VentanaFlotante>
      ),
    };
  } else if (cp.estado === "borrador") {
    sigue = {
      texto: `El comprobante ${codigoCP(cp.numero, cp.origen)} espera la aprobación del alcalde.`,
      ayuda: cp.cheque ? `Cheque N° ${cp.cheque}.` : "Mientras tanto, si ya giró el cheque, escriba su número aquí.",
      accion: (
        <div className="acciones-fila">
          {!cp.cheque && puedeRegistrar && <FormCheque cpId={cp.id} expedienteId={id} sugerido={chequeSugerido} />}
          <Link className="btn contorno" href={`/comprobantes/${cp.id}`}>Abrir comprobante</Link>
        </div>
      ),
    };
  } else if (cp.estado === "aprobado" && !cp.cheque) {
    sigue = {
      texto: `Escriba el número del cheque del comprobante ${codigoCP(cp.numero, cp.origen)}.`,
      ayuda: "Sin cheque el gasto no puede entrar en la rendición. El número se escribe una sola vez.",
      accion: puedeRegistrar ? <FormCheque cpId={cp.id} expedienteId={id} sugerido={chequeSugerido} /> : <Link className="btn primario grande" href={`/comprobantes/${cp.id}`}>Abrir comprobante</Link>,
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
  // Borrador del documento de la fase actual: se ve abajo antes de emitirlo.
  const hoy = hoyISO();
  const anioHoy = Number(hoy.slice(0, 4));
  let borrador: { nombre: string; nodo: React.ReactNode } | null = null;
  if (!anulado && aprobado) {
    if (actual === "orden" && elegida) {
      borrador = {
        nombre: e.tipo === "compra" ? "Orden de compra" : "Orden de servicio",
        nodo: (
          <Orden
            mcp={ctx.mcp}
            d={{ ...datosDoc, orden: { numero: null, anio: anioHoy, fecha: hoy, plazo: elegida.plazo, concepto: e.descripcion, tipo: e.tipo, tipo_proceso: "Adjudicación directa", monto: elegida.monto, proveedores: elegida.proveedores } } as unknown as DatosExpediente}
          />
        ),
      };
    } else if (actual === "conformidad" && orden) {
      borrador = {
        nombre: "Memorando de conformidad",
        nodo: (
          <Memorando
            mcp={ctx.mcp}
            tesorero={nombreTesorero}
            cargo={cargoTesorero}
            d={{ ...datosDoc, conformidad: { memorando_numero: null, anio: anioHoy, fecha: hoy, texto: textoConformidad } } as unknown as DatosExpediente}
          />
        ),
      };
    } else if (actual === "almacen" && !nea) {
      borrador = {
        nombre: "Entrada al almacén (NEA)",
        nodo: (
          <FormatoNea
            mcp={ctx.mcp}
            n={{
              numero: null,
              anio: anioHoy,
              fecha: hoy,
              origen: "compra",
              proveedor: prov(orden?.proveedores)?.razon_social ?? null,
              documento_ref: null,
              observacion: null,
              orden: orden ? `O/C ${num3(orden.numero)}-${orden.anio}` : null,
              expediente: `Exp. ${num3(e.numero)}-${e.anio}`,
              items: lista.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) })),
            }}
          />
        ),
      };
    } else if (actual === "comprobante" && !cp) {
      borrador = {
        nombre: "Comprobante de pago",
        nodo: (
          <FormatoComprobante
            mcp={ctx.mcp}
            c={{
              numero: null,
              fecha: hoy,
              beneficiario: fijo ? pagoFijo?.beneficiario ?? "(se escribe al generar)" : prov(orden?.proveedores)?.razon_social ?? "",
              beneficiario_doc: fijo ? pagoFijo?.beneficiario_doc ?? null : prov(orden?.proveedores)?.num_doc ?? null,
              concepto: fijo ? e.descripcion : orden?.concepto ?? e.descripcion,
              importe: Number(fijo ? total : orden?.monto ?? 0),
              deducciones: 0,
              partida: e.clasificador,
              funcional: null,
              cheque: null,
              hecho_por: ctx.nombre,
            }}
          />
        ),
      };
    }
  }
  // Vista de abajo: por defecto, el documento de la fase en la que está (borrador si aún no se emite).
  const opcionesVer = [...docs.map((x) => x.clave), ...(borrador ? ["borrador"] : [])];
  const verClave = opcionesVer.includes(sp.ver ?? "") ? sp.ver! : borrador ? "borrador" : docs[docs.length - 1].clave;
  const viendoBorrador = verClave === "borrador" && !!borrador;


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
          <span><span className="etiqueta">Se paga con</span>{fuente ? nombreFuente(fuente) : <span className="falta">Por definir</span>}</span>
          <span><span className="etiqueta">Monto</span><b>S/ {soles(total)}</b></span>
        </div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      {gestion?.estado === "bloqueado" && (
        <div className="aviso error">
          <strong>Gestión anterior: bloqueado.</strong> Este expediente es de antes del cambio de tesorería y quedó bloqueado el {fecha(gestion.desde)}: ya no se puede editar ni anular. Sí se puede ver e imprimir.
        </div>
      )}
      {gestion?.estado === "gracia" && (
        <div className="aviso alerta">
          <strong>Gestión anterior: plazo de gracia.</strong> Hubo un cambio de tesorería el {fecha(gestion.relevo)}. Puede corregir este expediente hasta el {fecha(new Date(Date.parse(gestion.desde) - 86400000).toISOString().slice(0, 10))}; desde el {fecha(gestion.desde)} queda bloqueado para siempre.
        </div>
      )}

      {!e.fuente_id && !anulado && (
        <section className="aviso alerta aviso-accion" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 280px" }}>
            <strong>Falta definir con qué dinero se paga este gasto.</strong> Es obligatorio antes de generar el comprobante de pago y cerrar el expediente.
          </span>
          {puedeRegistrar && (
            <form action={asignarFuente} className="form-cheque">
              <input type="hidden" name="id" value={id} />
              <label className="campo">
                Se paga con
                <select name="fuente_id" required defaultValue="">
                  <option value="" disabled>Elija…</option>
                  {ctx.fuentes.map((f) => (
                    <option key={f.id} value={f.id}>{nombreFuente(f)}</option>
                  ))}
                </select>
              </label>
              <BotonConfirmar className="btn primario" pregunta="¿Definir este dinero para el gasto?" detalle="Después ya no se podrá cambiar." textoConfirmar="Sí, definir">Definir</BotonConfirmar>
            </form>
          )}
        </section>
      )}

      <section className={`avance${anulado ? " anulado" : ""}`} aria-label="Avance del expediente">
        <div className="av-cab">
          <span className="av-titulo">{anulado ? "Expediente anulado" : listos === pasos.length ? "Expediente completo" : `Paso ${Math.min(listos + 1, pasos.length)} de ${pasos.length}`}</span>
          <span className="av-pct">{Math.round((listos / pasos.length) * 100)} %</span>
        </div>
        <div className="av-barra" aria-hidden="true"><div style={{ width: `${(listos / pasos.length) * 100}%` }} /></div>

        <ol className="av-pasos" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
          {pasos.map((p, n) => {
            const estado = p.hecho ? "hecho" : p.id === actual && !anulado ? "actual" : "pendiente";
            return (
              <li key={p.id} className={`av-paso ${estado}${p.id === visto ? " visto" : ""}`}>
                <Link href={`/expedientes/${id}?paso=${p.id}${DOC_DE_PASO[p.id] ? `&ver=${DOC_DE_PASO[p.id]}` : ""}`} scroll={false} aria-current={p.id === visto ? "step" : undefined}>
                  <span className="av-icono" aria-hidden="true">
                    {p.hecho ? (
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    ) : (
                      <IconoPaso id={p.id} />
                    )}
                  </span>
                  <span className="av-texto">
                    <span className="av-num">
                      Paso {n + 1}
                      {estado === "actual" && <span className="av-ahora">Ahora</span>}
                    </span>
                    <span className="av-nombre">{p.titulo}</span>
                    <span className="av-det">{p.hecho ? p.detalle : estado === "actual" ? "En curso" : "Pendiente"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <div className={`av-sigue${listos === pasos.length && !anulado ? " listo" : ""}`}>
          <span className="av-sigue-icono" aria-hidden="true">
            {anulado ? "!" : listos === pasos.length ? "✓" : "→"}
          </span>
          <div className="sigue-texto">
            <span className="etiqueta">{anulado ? "Anulado" : listos === pasos.length ? "Todo listo" : "Lo que sigue"}</span>
            <div className="sigue-titulo">{sigue.texto}</div>
            {sigue.ayuda && <div className="tenue">{sigue.ayuda}</div>}
          </div>
          {sigue.accion && <div className="sigue-accion">{sigue.accion}</div>}
        </div>
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
            {puedeRegistrar && !orden && aprobado && <FormCotizacion id={id} proveedores={proveedores} />}
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
                            <BotonConfirmar className="btn chico primario" pregunta={`¿Elegir la cotización de ${prov(c.proveedores)?.razon_social ?? ""}?`} detalle={`Por S/ ${soles(c.monto)}. Con ella se emitirá la orden.`} textoConfirmar="Sí, elegir">Elegir esta</BotonConfirmar>
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
                    {!cp && !nea && puedeRegistrar && (
                      <Motivo accion={anularRegistro} boton="Anular" titulo="Anular la conformidad" ayuda="Motivo" campos={{ expediente_id: id, tabla: "conformidades", registro_id: c.id, fase: "conformidad" }} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {visto === "almacen" && conAlmacen && (
        <section className="panel">
          <div className="panel-cab">Entrada al almacén</div>
          <div className="panel-cuerpo">
            {sinAlmacen && <div className="aviso info" style={{ margin: 0 }}>No pasa por almacén: {sinAlmacen}</div>}
            {(neas ?? []).length === 0 && !sinAlmacen && <span className="tenue">Todavía no se registra la entrada al almacén.</span>}
            {(neas ?? []).map((n) => (
              <div key={n.id} className="fila-doc">
                <div>
                  <b>NEA N° {num3(n.numero)}-{n.anio}</b> · {fecha(n.fecha)}
                  {n.anulado && <div className="pequeno no">Anulada: {n.anulado_motivo}</div>}
                </div>
                <Link className="btn chico contorno" href={`/almacen/nea/${n.id}`}>Ver e imprimir</Link>
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

      <section className="panel vista-previa">
        <div className="panel-cab">
          <span>{viendoBorrador ? `Así quedará: ${borrador!.nombre}` : "Así va su documento"}</span>
          <div className="acciones-fila" style={viendoBorrador ? { display: "none" } : undefined}>
            <Link className="btn chico contorno" href={`/expedientes/${id}/documentos?doc=${verClave}`}>Ver en grande</Link>
            <BotonPdf nombre={`Expediente ${num3(e.numero)}-${e.anio} ${verClave}`} selector=".vista-previa .hoja" className="btn chico primario" />
            <Link className="btn chico contorno" href={`/expedientes/${id}/documentos?doc=${verClave}&imprimir=1`}>Imprimir</Link>
            {docs.length > 1 && (
              <Link className="btn chico contorno" href={`/expedientes/${id}/documentos?doc=todo&imprimir=1`}>Imprimir todo el expediente</Link>
            )}
          </div>
        </div>
        <nav className="doc-nav vista-pestanas" role="tablist" aria-label="Documentos del expediente">
          {docs.map((x, i) => (
            <span key={x.clave} className="doc-par">
              {i > 0 && <i className="doc-sep ok" aria-hidden="true" />}
              <Link
                role="tab"
                aria-selected={x.clave === verClave}
                scroll={false}
                className={`doc-tab${x.clave === verClave ? " activo" : ""}`}
                href={`/expedientes/${id}?ver=${x.clave}${sp.paso ? `&paso=${sp.paso}` : ""}`}
              >
                <span className="ic" aria-hidden="true">✓</span>{x.nombre}
              </Link>
            </span>
          ))}
          {borrador && (
            <span className="doc-par">
              <i className="doc-sep" aria-hidden="true" />
              <Link
                role="tab"
                aria-selected={viendoBorrador}
                scroll={false}
                className={`doc-tab pendiente siguiente${viendoBorrador ? " activo" : ""}`}
                href={`/expedientes/${id}?ver=borrador${sp.paso ? `&paso=${sp.paso}` : ""}`}
              >
                <span className="ic" aria-hidden="true" />{borrador.nombre} · por emitir
              </Link>
            </span>
          )}
        </nav>
        {viendoBorrador && (
          <div className="aviso info" style={{ margin: "12px 14px 0" }}>
            Borrador: así quedará el documento de este paso. El número se pone al emitirlo con el botón de «Lo que sigue».
          </div>
        )}
        <div className="mesa">
          {viendoBorrador ? (
            <div className="hoja-borrador">{borrador!.nodo}</div>
          ) : (
            <DocumentosExpediente d={datosDoc} mcp={ctx.mcp} clave={verClave} tesorero={nombreTesorero} cargo={cargoTesorero} />
          )}
        </div>
      </section>

      <div>
        <section className="panel">
          <div className="panel-cab">¿Se equivocó?</div>
          <div className="panel-cuerpo otras">
            {e.estado === "borrador" && puedeRegistrar && (
              <div>
                <VentanaFlotante boton="Corregir requerimiento" titulo={`Corregir requerimiento ${num3(e.numero)}-${e.anio}`} accion={editarRequerimiento} textoGuardar="Guardar cambios" abierta={sp.editar === "1"} error={sp.editar === "1" ? sp.error : undefined} ancha claseBoton="btn contorno">
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
            {!anulado && e.estado === "rendido" && (
              <div className="tenue pequeno">
                Este expediente ya está en una rendición. Para anularlo, primero anule la rendición desde el menú «Rendición».
              </div>
            )}
            {!anulado && e.estado !== "rendido" && puedeRegistrar && (!cp || puedeAprobar) && (
              <div>
                <Motivo
                  accion={anularExpedienteTotal}
                  pin
                  boton="Anular expediente"
                  titulo={`Anular el expediente ${num3(e.numero)}-${e.anio}`}
                  ayuda={
                    cp || nea
                      ? `Motivo de la anulación. También se anulará${cp ? ` su comprobante de pago ${codigoCP(cp.numero, cp.origen)}${cp.cheque ? ` (cheque N° ${cp.cheque})` : ""}` : ""}${cp && nea ? " y" : ""}${nea ? ` su NEA ${num3(nea.numero)}-${nea.anio}` : ""}.`
                      : "Motivo de la anulación"
                  }
                  campos={{ id }}
                />
                <span className="tenue pequeno">Sirve también si el expediente está completo y hubo un error. No se borra: queda anulado con su motivo.</span>
              </div>
            )}
            {!anulado && cp && !puedeAprobar && (
              <div className="tenue pequeno">Este expediente ya tiene comprobante de pago aprobado: lo anula el alcalde o el administrador.</div>
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

/** Ícono de cada paso del expediente. */
function IconoPaso({ id }: { id: string }) {
  const trazos: Record<string, React.ReactNode> = {
    requerimiento: (<><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" /></>),
    cotizacion: (<><path d="M12 4v16M5 8h14" /><path d="m5 8-3 6a3 3 0 0 0 6 0Zm14 0-3 6a3 3 0 0 0 6 0Z" /></>),
    orden: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
    conformidad: (<><circle cx="12" cy="9" r="5.5" /><path d="m9.5 9 2 2 3-3.5M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5" /></>),
    almacen: (<><path d="M3 8.5 12 4l9 4.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" /><path d="M7 20v-7h10v7M7 16.5h10" /></>),
    comprobante: (<><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21Z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></>),
  };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {trazos[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  );
}

/** Escribir el N° de cheque sin salir del expediente. */
function FormCheque({ cpId, expedienteId, sugerido = "" }: { cpId: string; expedienteId: string; sugerido?: string }) {
  return (
    <form action={registrarCheque} className="form-cheque">
      <input type="hidden" name="id" value={cpId} />
      <input type="hidden" name="volver_a" value={`/expedientes/${expedienteId}`} />
      <label className="campo">
        N° de cheque
        <input name="cheque" inputMode="numeric" pattern="\d{4,12}" required defaultValue={sugerido} placeholder="Solo números" />
      </label>
      <BotonConfirmar className="btn primario grande" pregunta="¿Guardar el número de cheque?" detalle="Revíselo bien: el número de cheque se escribe una sola vez." textoConfirmar="Sí, guardar">
        Guardar cheque
      </BotonConfirmar>
    </form>
  );
}

function BotonCopiar({ id, principal = false }: { id: string; principal?: boolean }) {
  return (
    <form action={copiarExpediente} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <BotonConfirmar className={principal ? "btn primario grande" : "btn contorno"} pregunta="¿Crear un expediente nuevo con estos mismos datos?" detalle="Se abrirá para que corrija lo necesario antes de guardarlo." textoConfirmar="Sí, copiar">Copiar como nuevo</BotonConfirmar>
    </form>
  );
}

function FormCotizacion({ id, principal = false, proveedores }: { id: string; principal?: boolean; proveedores: ProveedorConocido[] }) {
  return (
    <VentanaFlotante
      boton={principal ? "Registrar cotización" : "+ Agregar cotización"}
      titulo="Registrar cotización"
      accion={agregarCotizacion}
      textoGuardar="Guardar cotización"
      claseBoton={principal ? "btn primario grande" : "btn chico contorno"}
    >
      <input type="hidden" name="expediente_id" value={id} />
      <CamposProveedor proveedores={proveedores} prefijo={`cot-${principal ? "p" : "s"}`} />
      <div className="rejilla-2">
        <label className="campo">Precio que cotizó S/<input name="monto" required inputMode="decimal" placeholder="0.00" /></label>
        <label className="campo">Plazo<input name="plazo" placeholder="Ej.: inmediato, 2 días" /></label>
      </div>
    </VentanaFlotante>
  );
}

/** Servicio menor o recurrente: un solo proveedor, sin cotizar; queda elegido. */
function FormProveedorUnico({ id, monto, proveedores }: { id: string; monto: number; proveedores: ProveedorConocido[] }) {
  return (
    <VentanaFlotante
      boton="Un solo proveedor (sin cotizar)"
      titulo="Un solo proveedor, sin cotizar"
      accion={proveedorUnico}
      textoGuardar="Registrar y elegir"
      claseBoton="btn contorno grande"
    >
      <input type="hidden" name="expediente_id" value={id} />
      <div className="aviso info" style={{ margin: 0 }}>
        Para servicios menores o recurrentes (asesor, mantenimiento) con un solo proveedor. Queda elegido y pasa directo a la orden.
      </div>
      <CamposProveedor proveedores={proveedores} prefijo="unico" />
      <div className="rejilla-2">
        <label className="campo">Monto S/<input name="monto" required inputMode="decimal" defaultValue={monto ? monto.toFixed(2) : ""} /></label>
        <label className="campo">Plazo<input name="plazo" placeholder="Ej.: 1 mes" /></label>
      </div>
    </VentanaFlotante>
  );
}
