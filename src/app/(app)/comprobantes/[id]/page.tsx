import Link from "next/link";
import BotonConfirmar from "@/components/BotonConfirmar";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import FormatoComprobante from "@/components/formatos/FormatoComprobante";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import SelectFuncion from "@/components/SelectFuncion";
import { CLASIFICADORES, SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fechaHora } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { siguienteCheque } from "@/lib/pagosFijos";
import { cambiarEstadoComprobante, editarComprobante, registrarCheque } from "../acciones";

type P = Promise<{ id: string }>;
type B = Promise<{ ok?: string; error?: string }>;

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

  const exp = c.expedientes as { numero: number; anio: number } | null;
  const borrador = c.estado === "borrador";
  const puedeRegistrar = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const puedeAprobar = tiene(ctx, "alcalde", "admin");
  const editable = borrador && puedeRegistrar;

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <h1>Comprobante de pago {codigoCP(c.numero, c.origen)}</h1>
        <Estado valor={c.estado} />
        {exp && c.expediente_id && <Link href={`/expedientes/${c.expediente_id}`}>Expediente {String(exp.numero).padStart(3, "0")}-{exp.anio}</Link>}
        <span className="espacio" />
        {borrador && puedeAprobar && (
          <form action={cambiarEstadoComprobante}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="accion" value="aprobar" />
            <BotonConfirmar pregunta="¿Aprobar este comprobante de pago?" detalle="Aprobado ya no se edita: solo falta escribir el número de cheque." textoConfirmar="Sí, aprobar">Aprobar</BotonConfirmar>
          </form>
        )}
        {c.estado === "aprobado" && puedeAprobar && !c.cheque && (
          <Motivo accion={cambiarEstadoComprobante} boton="Devolver" ayuda="¿Por qué se devuelve?" campos={{ id, accion: "devolver" }} peligro={false} />
        )}
        {(borrador || c.estado === "aprobado") && puedeRegistrar && (
          <Motivo accion={cambiarEstadoComprobante} boton="Anular" ayuda="Motivo de la anulación" campos={{ id, accion: "anular" }} />
        )}
        <BotonPdf nombre="Comprobante de pago" />
        <BotonImprimir />
        <Link className="btn" href="/comprobantes">Cerrar</Link>
      </div>
      <div className="no-imprimir">
        <Avisos ok={sp.ok} error={sp.error} />
        {c.motivo_devolucion && borrador && <div className="aviso error">Devuelto: {c.motivo_devolucion}</div>}
        {c.estado === "anulado" && <div className="aviso error">Anulado: {c.anulado_motivo} · {fechaHora(c.anulado_en)}</div>}
      </div>

      <div className="columnas">
        <div className="principal">
          <FormatoComprobante c={{ ...c, hecho_por: (c.perfiles as { nombre: string } | null)?.nombre }} mcp={ctx.mcp} />
        </div>

        <aside className="lateral no-imprimir">
          {c.estado === "aprobado" && !c.cheque && puedeRegistrar && (
            <form action={registrarCheque} className="panel">
              <div className="panel-cab">Registrar cheque al girar</div>
              <div className="panel-cuerpo">
                <input type="hidden" name="id" value={id} />
                <label className="campo">N° de cheque (siguiente de la chequera)<input name="cheque" required inputMode="numeric" defaultValue={chequeSugerido} /></label>
                <BotonConfirmar pregunta="¿Guardar este número de cheque?" detalle="El cheque se escribe una sola vez y ya no se puede cambiar." textoConfirmar="Sí, guardar cheque">Guardar cheque</BotonConfirmar>
                <span className="pequeno tenue">El cheque se escribe una sola vez. Sin cheque, el comprobante no entra en la rendición.</span>
              </div>
            </form>
          )}
          {editable && (
            <form action={editarComprobante} className="panel">
              <div className="panel-cab">Editar (solo en borrador)</div>
              <div className="panel-cuerpo">
                <input type="hidden" name="id" value={id} />
                <label className="campo">Fecha<input type="date" name="fecha" defaultValue={c.fecha} /></label>
                <label className="campo">Concepto<textarea name="concepto" defaultValue={c.concepto} /></label>
                <label className="campo">
                  Partida
                  <select name="partida" defaultValue={c.partida ?? ""}>
                    <option value="">—</option>
                    {CLASIFICADORES.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="campo">Funcional<input name="funcional" defaultValue={c.funcional ?? ""} /></label>
                <SelectFuncion valor={c.funcion && c.categoria ? `${c.funcion}|${c.categoria}` : ""} />
                <label className="campo">Deducciones S/<input name="deducciones" defaultValue={c.deducciones} inputMode="decimal" /></label>
                <label className="campo">
                  Sustento
                  <select name="sustento_tipo" defaultValue={c.sustento_tipo ?? ""}>
                    <option value="">—</option>
                    {SUSTENTOS.map((s) => (
                      <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="campo">N° del sustento<input name="sustento_numero" defaultValue={c.sustento_numero ?? ""} /></label>
                <BotonConfirmar className="btn" pregunta="¿Guardar los cambios del comprobante?" textoConfirmar="Sí, guardar">Guardar cambios</BotonConfirmar>
              </div>
            </form>
          )}
          <section className="panel">
            <div className="panel-cab">Datos</div>
            <div className="panel-cuerpo pequeno">
              <div>Fuente: {(c.fuentes as { municipalidad: string } | null)?.municipalidad}</div>
              <div>Función: {c.funcion ?? <span className="falta">sin asignar</span>}</div>
              <div>Sustento: {c.sustento_tipo ?? "—"} {c.sustento_numero ?? ""}</div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-cab">Reglas</div>
            <div className="panel-cuerpo">
              <ul className="lista-reglas">
                <li>Se edita solo en borrador.</li>
                <li>Lo aprueba el alcalde o el administrador.</li>
                <li>Aprobado, solo falta el cheque; después queda fijo.</li>
                <li>Para corregir, se anula con motivo.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
