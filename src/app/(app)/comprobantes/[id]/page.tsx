import Link from "next/link";
import BotonConfirmar from "@/components/BotonConfirmar";
import { notFound, redirect } from "next/navigation";
import Avisos from "@/components/Avisos";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import EscalaA4 from "@/components/EscalaA4";
import VentanaFlotante from "@/components/VentanaFlotante";
import FormatoComprobante from "@/components/formatos/FormatoComprobante";
import Estado from "@/components/Estado";
import { MarcaAnuladaPagina } from "@/components/MarcaAnulado";
import Motivo from "@/components/Motivo";
import CamposEditarComprobante from "@/components/formularios/CamposEditarComprobante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { cargarCierres, estadoGestion } from "@/lib/gestion";
import { codigoCP, fecha, fechaHora, hoyISO } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { siguienteCheque } from "@/lib/pagosFijos";
import { cambiarEstadoComprobante, editarComprobante, registrarCheque } from "../acciones";

type P = Promise<{ id: string }>;
type B = Promise<{ ok?: string; error?: string }>;

const cola = (sp: { ok?: string; error?: string }) => {
  const q = new URLSearchParams();
  if (sp.ok) q.set("ok", sp.ok);
  if (sp.error) q.set("error", sp.error);
  return q.toString() ? `&${q.toString()}` : "";
};

export default async function Comprobante({ params, searchParams }: { params: P; searchParams: B }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const [{ data: c }, chequeSugerido] = await Promise.all([
    supabase
      .from("comprobantes_pago")
      .select("*, fuentes(municipalidad), expedientes(numero, anio), perfiles!comprobantes_pago_creado_por_fkey(nombre)")
      .eq("id", id)
      .single(),
    siguienteCheque(supabase, ctx.mcp.id),
  ]);
  if (!c) notFound();
  // El comprobante de un expediente se trabaja en la vista única del expediente
  if (c.expediente_id) redirect(`/expedientes/${c.expediente_id}?paso=comprobante&ver=comprobante${cola(sp)}`);

  const exp = c.expedientes as { numero: number; anio: number } | null;
  const borrador = c.estado === "borrador";
  const gestion = estadoGestion(c.fecha, await cargarCierres(supabase, ctx.mcp.id), hoyISO());
  const bloqueadoGestion = gestion?.estado === "bloqueado";
  const puedeRegistrar = tiene(ctx, "admin", "tesorero", "contador", "alcalde") && !bloqueadoGestion;
  const puedeAprobar = tiene(ctx, "alcalde", "admin") && !bloqueadoGestion;
  const editable = borrador && puedeRegistrar;
  const anulado = c.estado === "anulado";
  const rendido = c.estado === "rendido";
  const listo = !!c.cheque && (c.estado === "aprobado" || rendido);
  // Datos que conviene completar antes de aprobar
  const faltas = [!c.funcion && "la función del gasto", !c.sustento_numero && "el número de la factura o boleta"].filter(Boolean) as string[];
  const pasos = [
    { titulo: "Revisar y aprobar", detalle: borrador ? "Ahora" : "Aprobado", hecho: !borrador && !anulado },
    { titulo: "Anotar el cheque", detalle: c.cheque ? `N° ${c.cheque}` : "Pendiente", hecho: !!c.cheque && !anulado },
    { titulo: "Listo para la rendición", detalle: listo ? "Listo" : "Pendiente", hecho: listo },
  ];
  const actual = pasos.findIndex((p) => !p.hecho);

  const camposEditar = <CamposEditarComprobante id={id} c={c} />;

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <h1>Comprobante de pago {codigoCP(c.numero, c.origen)}</h1>
        <Estado valor={c.estado} />
        {exp && c.expediente_id && <Link href={`/expedientes/${c.expediente_id}`}>Expediente {String(exp.numero).padStart(3, "0")}-{exp.anio}</Link>}
        <span className="espacio" />
        <BotonPdf nombre="Comprobante de pago" />
        <BotonImprimir />
        <Link className="btn" href="/comprobantes">Cerrar</Link>
      </div>
      <div className="no-imprimir">
        <Avisos ok={sp.ok} error={sp.error} />
        {c.motivo_devolucion && borrador && <div className="aviso error">Devuelto: {c.motivo_devolucion}</div>}
        {gestion?.estado === "bloqueado" && <div className="aviso error"><strong>Gestión anterior: bloqueado.</strong> Es de antes del cambio de tesorería y desde el {fecha(gestion.desde)} ya no se puede editar ni anular. Sí se puede imprimir.</div>}
        {gestion?.estado === "gracia" && <div className="aviso alerta"><strong>Gestión anterior: plazo de gracia.</strong> Puede corregirlo hasta el {fecha(new Date(Date.parse(gestion.desde) - 86400000).toISOString().slice(0, 10))}; desde el {fecha(gestion.desde)} queda bloqueado para siempre.</div>}
        {anulado && <div className="aviso error">Anulado: {c.anulado_motivo} · {fechaHora(c.anulado_en)}</div>}
      </div>

      {!anulado && (
        <section className="avance no-imprimir" aria-label="Avance del comprobante">
          <ol className="av-pasos" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
            {pasos.map((p, n) => {
              const estado = p.hecho ? "hecho" : n === actual ? "actual" : "pendiente";
              return (
                <li key={p.titulo} className={`av-paso ${estado}`}>
                  <span className="av-enlace">
                    <span className="av-icono" aria-hidden="true">{p.hecho ? "✓" : n + 1}</span>
                    <span className="av-texto">
                      <span className="av-nombre">{p.titulo}</span>
                      <span className="av-det">{p.hecho ? p.detalle : estado === "actual" ? "Ahora" : "Pendiente"}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {anulado && <MarcaAnuladaPagina />}
      <div className="mesa">
        <EscalaA4>
          <FormatoComprobante c={{ ...c, hecho_por: (c.perfiles as { nombre: string } | null)?.nombre }} mcp={ctx.mcp} anulado={anulado ? { motivo: c.anulado_motivo, en: c.anulado_en } : null} />
        </EscalaA4>
      </div>

      {!anulado && (
        <div className="barra-guiada no-imprimir" role="region" aria-label="Confirmar este paso">
          <div className={`av-sigue${listo ? " listo" : ""}`}>
            <div className="sigue-texto">
              {borrador && puedeAprobar ? (
                <>
                  <span className="etiqueta">Paso 1 de 3 · Revisar y aprobar</span>
                  <div className="sigue-titulo">¿El comprobante está bien?</div>
                  <div className="tenue">
                    Revise a quién se paga y el monto. {faltas.length > 0 ? <span className="falta">Falta anotar {faltas.join(" y ")}: use «No, corregir».</span> : "Si está bien, apruébelo y falta solo el cheque."}
                  </div>
                </>
              ) : borrador ? (
                <>
                  <span className="etiqueta">Paso 1 de 3 · Revisar y aprobar</span>
                  <div className="sigue-titulo">Falta la aprobación del alcalde</div>
                  <div className="tenue">{faltas.length > 0 ? <span className="falta">Antes, anote {faltas.join(" y ")}: use «Corregir».</span> : "Avísele: cuando lo apruebe, anote el cheque."}</div>
                </>
              ) : c.estado === "aprobado" && !c.cheque ? (
                <>
                  <span className="etiqueta">Paso 2 de 3 · Anotar el cheque</span>
                  <div className="sigue-titulo">Escriba el número del cheque</div>
                  <div className="tenue">Se anota una sola vez. Sin cheque, el gasto no entra en la rendición.</div>
                </>
              ) : (
                <>
                  <span className="etiqueta">Todo listo</span>
                  <div className="sigue-titulo">{rendido ? "Este gasto ya está en una rendición." : `Cheque N° ${c.cheque}. Ya puede entrar en la rendición del mes.`}</div>
                </>
              )}
            </div>
            <div className="sigue-accion">
              {borrador && (
                <div className="acciones-fila">
                  {puedeAprobar && (
                    <form action={cambiarEstadoComprobante}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="accion" value="aprobar" />
                      <BotonConfirmar pin className="btn primario grande" pregunta="¿Aprobar este comprobante de pago?" detalle="Aprobado ya no se edita: solo falta escribir el número de cheque." textoConfirmar="Sí, aprobar">Sí, aprobar</BotonConfirmar>
                    </form>
                  )}
                  {editable && (
                    <VentanaFlotante boton={puedeAprobar ? "No, corregir" : "Corregir"} titulo="Corregir el comprobante" accion={editarComprobante} textoGuardar="Guardar cambios" claseBoton={puedeAprobar ? "btn peligro grande" : "btn contorno grande"} ancha>
                      {camposEditar}
                    </VentanaFlotante>
                  )}
                </div>
              )}
              {c.estado === "aprobado" && !c.cheque && puedeRegistrar && (
                <form action={registrarCheque} className="cheque-en-linea">
                  <input type="hidden" name="id" value={id} />
                  <label className="campo">
                    N° de cheque
                    <input name="cheque" required inputMode="numeric" defaultValue={chequeSugerido} aria-label="Número de cheque" />
                  </label>
                  <BotonConfirmar className="btn primario grande" pregunta="¿Guardar este número de cheque?" detalle="El cheque se escribe una sola vez y ya no se puede cambiar." textoConfirmar="Sí, guardar cheque">Guardar cheque</BotonConfirmar>
                </form>
              )}
              {listo && !rendido && <Link className="btn contorno grande" href="/expedientes?nuevo=1">+ Nuevo expediente</Link>}
              {listo && !rendido && <Link className="btn primario grande" href="/rendicion">Ir a la rendición</Link>}
            </div>
          </div>
        </div>
      )}

      {!anulado && !rendido && ((c.estado === "aprobado" && puedeAprobar && !c.cheque) || ((borrador || c.estado === "aprobado") && puedeRegistrar)) && (
        <section className="panel no-imprimir">
          <div className="panel-cab">¿Se equivocó?</div>
          <div className="panel-cuerpo otras">
            {c.estado === "aprobado" && puedeAprobar && !c.cheque && (
              <div>
                <Motivo accion={cambiarEstadoComprobante} boton="Devolver para corregir" ayuda="¿Por qué se devuelve?" campos={{ id, accion: "devolver" }} peligro={false} />
                <span className="tenue pequeno">Vuelve a borrador; después se aprueba otra vez.</span>
              </div>
            )}
            {(borrador || c.estado === "aprobado") && puedeRegistrar && (
              <div>
                <Motivo accion={cambiarEstadoComprobante} boton="Anular comprobante" ayuda="Motivo de la anulación" campos={{ id, accion: "anular" }} />
                <span className="tenue pequeno">No se borra: queda anulado con su motivo.</span>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
