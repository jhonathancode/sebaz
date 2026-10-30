"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import BotonConfirmar from "@/components/BotonConfirmar";
import EscalaA4 from "@/components/EscalaA4";
import SelectFuncion from "@/components/SelectFuncion";
import CamposProveedor, { type ProveedorConocido } from "@/components/formularios/CamposProveedor";
import { Memorando, Orden, Requerimiento, type DatosExpediente } from "@/components/formatos/DocumentosExpediente";
import FormatoComprobante from "@/components/formatos/FormatoComprobante";
import { FormatoNea } from "@/components/formatos/FormatosAlmacen";
import { SUSTENTOS } from "@/lib/catalogos";
import { num3, soles } from "@/lib/formato";
import { conceptoSeRequiere, conceptoSinSeRequiere, resumenConcepto } from "@/lib/requerimiento";
import type { Mcp } from "@/lib/contexto";

export type Proximos = {
  expediente: number | null;
  ordenCompra: number | null;
  ordenServicio: number | null;
  memorando: number | null;
  nea: number | null;
  comprobante: number | null;
};
type PagoFijoInfo = { id: string; beneficiario: string | null; beneficiario_doc: string | null; completo: boolean } | null;
type Paso = "form" | "req" | "prov" | "orden" | "conf" | "alm" | "comp";

const TITULO: Record<Paso, string> = {
  form: "Datos del requerimiento",
  req: "Requerimiento",
  prov: "Proveedor",
  orden: "Orden",
  conf: "Conformidad",
  alm: "Almacén",
  comp: "Comprobante de pago",
};

/** Lee lo escrito en el formulario (lo que aún no se guardó en ninguna parte). */
function leer(form: HTMLFormElement | null) {
  const fd = form ? new FormData(form) : new FormData();
  const g = (k: string) => String(fd.get(k) ?? "");
  const may = (k: string) => g(k).toLocaleUpperCase("es-PE").trim();
  const num = (k: string) => Number(g(k).replace(",", ".")) || 0;
  const tipo = g("tipo") || "compra";
  const items: { id: string; item: number; cantidad: number; unidad: string; descripcion: string; precio_unitario: number; total: number }[] = [];
  for (let i = 1; i <= 30; i++) {
    const d = may(`desc_${i}`);
    if (!d) continue;
    const c = num(`cant_${i}`);
    const pr = num(`precio_${i}`);
    items.push({ id: String(i), item: items.length + 1, cantidad: c, unidad: may(`und_${i}`) || "UND", descripcion: d, precio_unitario: pr, total: Math.round(c * pr * 100) / 100 });
  }
  const total = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const concepto = conceptoSeRequiere(g("descripcion")) || resumenConcepto(tipo, items);
  const hoy = new Date().toISOString().slice(0, 10);
  const fecha = g("fecha") || hoy;
  return { g, may, tipo, items, total, concepto, fecha, anio: Number(fecha.slice(0, 4)) };
}

/**
 * Ventana única «todo o nada» para quien aprueba: requerimiento, orden, conformidad, almacén y comprobante
 * se revisan uno tras otro (al instante, sin ir al servidor). Nada se guarda hasta el último paso; si se
 * cierra antes, no se registra el expediente ni ningún documento ni se gasta ningún número.
 */
export default function AsistenteRequerimiento({
  boton,
  claseBoton = "btn primario grande",
  abierta = false,
  error,
  eventoAbrir,
  accion,
  mcp,
  proximos,
  tesorero,
  cargo,
  hechoPor,
  proveedores,
  chequeSugerido,
  children,
}: {
  boton: string;
  claseBoton?: string;
  abierta?: boolean;
  error?: string;
  eventoAbrir?: string;
  accion: (fd: FormData) => Promise<{ error: string } | undefined>;
  mcp: Mcp;
  proximos: Proximos;
  tesorero: string;
  cargo: string;
  hechoPor: string;
  proveedores: ProveedorConocido[];
  chequeSugerido: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const [, repintar] = useReducer((n: number) => n + 1, 0);
  const [paso, setPaso] = useState<Paso>("form");
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(error ?? null);
  const [salir, setSalir] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [ciclo, setCiclo] = useState(0);
  const [pf, setPf] = useState<PagoFijoInfo>(null);

  // Abrir: desde el botón, desde la dirección (?nuevo=1) o desde el menú lateral
  useEffect(() => {
    if (abierta && ref.current && !ref.current.open) ref.current.showModal();
  }, [abierta]);
  useEffect(() => {
    if (!eventoAbrir) return;
    const abrir = () => {
      if (ref.current && !ref.current.open) ref.current.showModal();
    };
    window.addEventListener(eventoAbrir, abrir);
    return () => window.removeEventListener(eventoAbrir, abrir);
  }, [eventoAbrir]);
  // Qué pago fijo se eligió (cambia los pasos)
  useEffect(() => {
    const alElegir = (e: Event) => setPf((e as CustomEvent<PagoFijoInfo>).detail ?? null);
    window.addEventListener("sebaz:pago-fijo", alElegir);
    return () => window.removeEventListener("sebaz:pago-fijo", alElegir);
  }, []);
  // Los documentos se arman con lo que hay en el formulario: se repintan al escribir
  useEffect(() => {
    const f = form.current;
    if (!f) return;
    // Se repinta un instante después: si fuera de inmediato, React borraría lo que se está escribiendo en los campos controlados
    let espera: number | undefined;
    const alCambiar = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => {
        setSucio(true);
        repintar();
      }, 0);
    };
    f.addEventListener("input", alCambiar);
    f.addEventListener("change", alCambiar);
    return () => {
      window.clearTimeout(espera);
      f.removeEventListener("input", alCambiar);
      f.removeEventListener("change", alCambiar);
    };
  }, []);

  const L = leer(form.current);
  const ordenTipo = L.tipo === "compra" ? "compra" : "servicio";
  const pasos: Paso[] =
    L.tipo === "pago_fijo"
      ? !pf
        ? ["form", "req"]
        : pf.completo
          ? ["form", "req", "orden", "conf", "comp"]
          : ["form", "req", "comp"]
      : L.tipo === "compra"
        ? ["form", "req", "prov", "orden", "conf", "alm", "comp"]
        : ["form", "req", "prov", "orden", "conf", "comp"];
  const indice = Math.max(0, pasos.indexOf(paso));
  const ultimo = paso === pasos[pasos.length - 1];

  function limpiarDireccion() {
    const u = new URL(window.location.href);
    if (u.searchParams.has("nuevo") || u.searchParams.has("error")) {
      u.searchParams.delete("nuevo");
      u.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", u.pathname + (u.search || ""));
    }
  }
  /** Cierra y descarta todo: nada se registró. */
  function descartar() {
    setSalir(false);
    setPaso("form");
    setAviso(null);
    setErrorServidor(null);
    setSucio(false);
    setPf(null);
    setCiclo((c) => c + 1);
    window.dispatchEvent(new CustomEvent("sebaz:pago-fijo", { detail: null }));
    ref.current?.close();
  }
  function pedirSalir() {
    if (sucio || paso !== "form") setSalir(true);
    else descartar();
  }

  function validar(p: Paso): string | null {
    const f = form.current;
    if (!f) return null;
    if (p === "form") {
      if (!f.checkValidity()) {
        f.reportValidity();
        return "Complete los datos que faltan.";
      }
      if (L.items.length === 0) return "Escriba al menos una cosa en el detalle.";
      if (L.tipo !== "pago_fijo" && L.total <= 0) return "Escriba el precio de cada cosa: el monto debe ser mayor que cero.";
      if (L.tipo === "pago_fijo" && !pf && L.total <= 0) return "Escriba el monto del pago.";
    }
    if (p === "prov") {
      const doc = L.g("num_doc").replace(/\D/g, "");
      if (doc.length !== 8 && doc.length !== 11) return "Escriba el RUC (11 dígitos) o el DNI (8) del proveedor.";
      if (!L.g("razon_social").trim()) return "Escriba el nombre o razón social del proveedor.";
    }
    if (p === "alm" && L.g("almacen") === "sin" && L.g("sin_almacen_motivo").trim().length < 10) return "Explique en al menos 10 letras por qué no pasan por almacén.";
    if (p === "comp") {
      const ch = L.g("cheque_previsto").trim();
      if (ch && !/^\d{4,12}$/.test(ch)) return "El número de cheque debe tener de 4 a 12 dígitos.";
    }
    return null;
  }
  function ir(destino: Paso) {
    setAviso(null);
    setPaso(destino);
    cuerpo.current?.scrollTo({ top: 0 });
  }
  function siguiente() {
    const falta = validar(paso);
    if (falta) return setAviso(falta);
    ir(pasos[Math.min(indice + 1, pasos.length - 1)]);
  }
  function atras() {
    ir(pasos[Math.max(indice - 1, 0)]);
  }

  async function enviar(fd: FormData) {
    setErrorServidor(null);
    const r = await accion(fd);
    if (r?.error) {
      setErrorServidor(r.error);
      cuerpo.current?.scrollTo({ top: 0 });
    }
  }

  // ----------------------------------------------------------- documentos de vista previa
  const proveedor =
    L.tipo === "pago_fijo"
      ? { razon_social: pf?.beneficiario ?? "", num_doc: pf?.beneficiario_doc ?? "", direccion: null, telefono: null }
      : { razon_social: L.may("razon_social"), num_doc: L.g("num_doc"), direccion: L.may("direccion") || null, telefono: L.g("telefono") || null };
  const concepto = conceptoSinSeRequiere(L.concepto);
  const dBase = {
    e: { numero: proximos.expediente, anio: L.anio, fecha: L.fecha, area_usuaria: L.may("area_usuaria") || null, meta: L.may("meta") || null, clasificador: L.g("clasificador") || null, descripcion: L.concepto, tipo: L.tipo },
    items: L.items,
    anulado: null,
    cotizaciones: [],
    orden: null,
    conformidad: null,
    cp: null,
  } as unknown as DatosExpediente;
  const numOrden = ordenTipo === "compra" ? proximos.ordenCompra : proximos.ordenServicio;
  const textoConformidad = `Mediante la presente se le comunica la CONFORMIDAD por ${concepto.toLowerCase()}, a cargo de ${proveedor.razon_social}, a favor de la ${mcp.nombre}.`;
  const hoja = (nodo: React.ReactNode) => (
    <div className="mesa asist-mesa">
      <EscalaA4>{nodo}</EscalaA4>
    </div>
  );

  // Pregunta y botones de cada paso
  const pregunta: Record<Paso, { t: string; a: string }> = {
    form: { t: "Complete los datos y revise el requerimiento", a: "Aún no se guarda nada: puede salir sin que quede registrado." },
    req: { t: "¿El requerimiento está bien?", a: `Revíselo arriba. Aprobado: S/ ${soles(L.total)}.` },
    prov: { t: "¿A quién se compra o contrata?", a: "El monto de la orden es el total del detalle." },
    orden: { t: `¿La orden de ${ordenTipo} está bien?`, a: `A nombre de ${proveedor.razon_social || "el proveedor"} por S/ ${soles(L.total)}.` },
    conf: { t: "¿Todo se recibió conforme?", a: "Es el memorando que confirma lo recibido. Si aún no llega, registre hasta la orden." },
    alm: { t: "¿Los bienes entran al almacén?", a: "Las compras de bienes entran al almacén (NEA) antes de pagarse." },
    comp: { t: "¿El comprobante de pago está bien?", a: "Al confirmar se registra y aprueba todo el expediente a la vez." },
  };

  return (
    <>
      <button type="button" className={`${claseBoton} no-imprimir`} onClick={() => ref.current?.showModal()}>
        {boton}
      </button>
      <dialog
        ref={ref}
        className="ventana-flotante ancha asistente"
        aria-label="Nuevo requerimiento"
        onCancel={(e) => {
          e.preventDefault();
          pedirSalir();
        }}
        onClose={limpiarDireccion}
      >
        <form ref={form} action={enviar} className="vf-marco">
          <div className="vf-cab">
            <h2>Nuevo requerimiento</h2>
            <span className="asist-progreso">
              Paso {indice + 1} de {pasos.length} · {TITULO[paso]}
            </span>
            <button type="button" className="vf-cerrar" aria-label="Cerrar" onClick={pedirSalir}>
              ×
            </button>
          </div>
          <div className="asist-barra" aria-hidden="true">
            <div style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} />
          </div>

          <div className="vf-cuerpo" ref={cuerpo}>
            {(errorServidor || aviso) && (
              <div className="aviso error" role="alert">
                {errorServidor ? <><strong>No se pudo registrar.</strong> {errorServidor}</> : aviso}
              </div>
            )}

            {/* Paso 1: datos (siempre en pantalla para que sus valores viajen al guardar) */}
            <div key={ciclo} style={{ display: paso === "form" ? undefined : "none" }}>
              {children}
            </div>

            {paso === "req" && hoja(<Requerimiento d={dBase} mcp={mcp} />)}

            {/* Proveedor */}
            <div style={{ display: paso === "prov" ? undefined : "none" }} key={`p${ciclo}`}>
              <fieldset className="pregunta">
                <legend>Proveedor</legend>
                <CamposProveedor proveedores={proveedores} prefijo="asist" opcional />
                <label className="campo" style={{ marginTop: 10, maxWidth: 320 }}>
                  Plazo para entregar
                  <input name="plazo" placeholder="Ej.: 3 días, 1 mes" />
                </label>
                <p className="pequeno tenue" style={{ margin: "8px 0 0" }}>Monto de la orden: <b>S/ {soles(L.total)}</b></p>
              </fieldset>
            </div>

            {paso === "orden" &&
              hoja(
                <Orden
                  mcp={mcp}
                  d={{ ...dBase, orden: { numero: numOrden, anio: L.anio, fecha: L.fecha, plazo: L.g("plazo") || null, concepto, tipo: ordenTipo, tipo_proceso: "Adjudicación directa", monto: L.total, proveedores: proveedor } } as unknown as DatosExpediente}
                />,
              )}

            {paso === "conf" &&
              hoja(
                <Memorando
                  mcp={mcp}
                  tesorero={tesorero}
                  cargo={cargo}
                  d={{ ...dBase, orden: { tipo: ordenTipo }, conformidad: { memorando_numero: proximos.memorando, anio: L.anio, fecha: L.fecha, texto: textoConformidad } } as unknown as DatosExpediente}
                />,
              )}

            {/* Almacén (solo compras de bienes) */}
            <div style={{ display: paso === "alm" ? undefined : "none" }} key={`a${ciclo}`}>
              <fieldset className="pregunta">
                <legend>Almacén</legend>
                <div className="opciones compacta">
                  <label className="opcion"><input type="radio" name="almacen" value="nea" defaultChecked /><span className="opcion-titulo">Sí, entran al almacén (NEA)</span></label>
                  <label className="opcion"><input type="radio" name="almacen" value="sin" /><span className="opcion-titulo">No pasan por almacén</span></label>
                </div>
                {L.g("almacen") === "sin" && (
                  <label className="campo" style={{ marginTop: 10 }}>
                    ¿Por qué no pasan por almacén?
                    <input name="sin_almacen_motivo" placeholder="Ej.: combustible consumido en el traslado" />
                  </label>
                )}
              </fieldset>
            </div>
            {paso === "alm" &&
              L.g("almacen") !== "sin" &&
              hoja(
                <FormatoNea
                  mcp={mcp}
                  n={{
                    numero: proximos.nea,
                    anio: L.anio,
                    fecha: L.fecha,
                    origen: "compra",
                    proveedor: proveedor.razon_social || null,
                    documento_ref: L.g("sustento_numero") || null,
                    observacion: null,
                    orden: numOrden ? `O/C ${num3(numOrden)}-${L.anio}` : null,
                    expediente: proximos.expediente ? `Exp. ${num3(proximos.expediente)}-${L.anio}` : null,
                    items: L.items.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad, precio_unitario: i.precio_unitario })),
                  }}
                />,
              )}

            {/* Comprobante */}
            <div style={{ display: paso === "comp" ? undefined : "none" }} key={`c${ciclo}`}>
              <fieldset className="pregunta">
                <legend>Comprobante de pago</legend>
                <div className="rejilla-2">
                  <label className="campo">
                    Documento que entregó
                    <select name="sustento_tipo" defaultValue={L.tipo === "pago_fijo" ? "REC" : "FAC"}>
                      {SUSTENTOS.filter((s) => s.codigo !== "DJ" && s.codigo !== "PM").map((s) => (
                        <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">N° del documento<input name="sustento_numero" placeholder="Ej.: F001-45" /></label>
                  <label className="campo">
                    N° de cheque (siguiente de la chequera)
                    <input name="cheque_previsto" inputMode="numeric" pattern="\d{4,12}" defaultValue={chequeSugerido} placeholder="Si ya lo giró; si no, después" />
                  </label>
                  <SelectFuncion />
                </div>
              </fieldset>
            </div>
            {paso === "comp" &&
              hoja(
                <FormatoComprobante
                  mcp={mcp}
                  c={{
                    numero: proximos.comprobante,
                    fecha: L.fecha,
                    beneficiario: proveedor.razon_social,
                    beneficiario_doc: proveedor.num_doc || null,
                    concepto,
                    importe: L.total,
                    deducciones: 0,
                    partida: L.g("clasificador") || null,
                    funcional: null,
                    cheque: L.g("cheque_previsto") || null,
                    hecho_por: hechoPor,
                  }}
                />,
              )}

            <input type="hidden" name="hasta" value={paso === "conf" ? "orden" : "todo"} />
          </div>

          {/* Pie: la pregunta y la respuesta, siempre a la vista */}
          {salir ? (
            <div className="vf-pie asist-pie asist-salir" role="alertdialog" aria-label="¿Salir sin registrar?">
              <div className="asist-pregunta">
                <span className="etiqueta">Atención</span>
                <b>¿Salir sin terminar?</b>
                <span className="tenue">Se perderá lo hecho: no se registrará el expediente ni ningún documento.</span>
              </div>
              <div className="asist-botones">
                <button type="button" className="btn peligro grande" onClick={descartar}>Sí, salir y descartar</button>
                <button type="button" className="btn primario grande" onClick={() => setSalir(false)} autoFocus>No, seguir</button>
              </div>
            </div>
          ) : (
            <div className="vf-pie asist-pie">
              <div className="asist-pregunta">
                <span className="etiqueta">Paso {indice + 1} de {pasos.length} · {TITULO[paso]}</span>
                <b>{pregunta[paso].t}</b>
                <span className="tenue">{pregunta[paso].a}</span>
              </div>
              <div className="asist-botones">
                {paso === "form" ? (
                  <button type="button" className="btn" onClick={pedirSalir}>Cancelar</button>
                ) : (
                  <button type="button" className="btn peligro grande" onClick={atras}>{paso === "prov" || paso === "alm" ? "Atrás" : "No, corregir"}</button>
                )}
                {paso === "conf" && (
                  <BotonConfirmar pin className="btn contorno grande" pregunta="¿Registrar hasta la orden?" detalle="El expediente queda aprobado con su orden. La conformidad y el comprobante se registran cuando llegue lo comprado." textoConfirmar="Sí, registrar hasta la orden">
                    Aún no llegó: registrar hasta la orden
                  </BotonConfirmar>
                )}
                {ultimo ? (
                  <BotonConfirmar pin className="btn primario grande" pregunta="¿Registrar y aprobar todo?" detalle="Se registran a la vez el requerimiento y todos sus documentos. Si sale antes de este paso, no se registra nada." textoConfirmar="Sí, registrar todo">
                    Sí, registrar todo
                  </BotonConfirmar>
                ) : (
                  <button type="button" className="btn primario grande" onClick={siguiente}>
                    {paso === "form" ? "Revisar requerimiento" : paso === "prov" || paso === "alm" ? "Continuar" : "Sí, está bien"}
                  </button>
                )}
              </div>
            </div>
          )}
        </form>
      </dialog>
    </>
  );
}
