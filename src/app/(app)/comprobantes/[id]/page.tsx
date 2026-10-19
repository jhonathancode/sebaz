import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import BotonImprimir from "@/components/BotonImprimir";
import Encabezado from "@/components/Encabezado";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import SelectFuncion from "@/components/SelectFuncion";
import { CLASIFICADORES, SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, enLetras, fecha, fechaHora, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { cambiarEstadoComprobante, editarComprobante, registrarCheque } from "../acciones";

type P = Promise<{ id: string }>;
type B = Promise<{ ok?: string; error?: string }>;

export default async function Comprobante({ params, searchParams }: { params: P; searchParams: B }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: c } = await supabase
    .from("comprobantes_pago")
    .select("*, fuentes(municipalidad), expedientes(numero, anio), perfiles!comprobantes_pago_creado_por_fkey(nombre)")
    .eq("id", id)
    .single();
  if (!c) notFound();

  const liquido = Number(c.importe) - Number(c.deducciones);
  const iniciales = ((c.perfiles as { nombre: string } | null)?.nombre ?? "")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
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
            <button className="btn primario" type="submit">Aprobar</button>
          </form>
        )}
        {c.estado === "aprobado" && puedeAprobar && !c.cheque && (
          <Motivo accion={cambiarEstadoComprobante} boton="Devolver" ayuda="¿Por qué se devuelve?" campos={{ id, accion: "devolver" }} peligro={false} />
        )}
        {(borrador || c.estado === "aprobado") && puedeRegistrar && (
          <Motivo accion={cambiarEstadoComprobante} boton="Anular" ayuda="Motivo de la anulación" campos={{ id, accion: "anular" }} />
        )}
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
          <div className="hoja">
            <Encabezado mcp={ctx.mcp} titulo="COMPROBANTE DE PAGO" numero={`N° ${String(c.numero).padStart(3, "0")} · Fecha ${fecha(c.fecha)}`} />
            <table className="formato">
              <tbody>
                <tr><td className="etiqueta" style={{ width: 100 }}>Nombre</td><td>{c.beneficiario}{c.beneficiario_doc && ` · ${c.beneficiario_doc}`}</td></tr>
                <tr><td className="etiqueta">Son</td><td>{enLetras(liquido)}</td></tr>
                <tr><td className="etiqueta">Concepto</td><td>{c.concepto}</td></tr>
              </tbody>
            </table>
            <table className="formato">
              <thead>
                <tr><th colSpan={8}>Codificación programática</th><th colSpan={2}>Estadística del objeto del gasto</th></tr>
                <tr><th>Sector</th><th>Pliego</th><th>Programa</th><th>Subprograma</th><th>Proyecto</th><th>Obra</th><th>Pto.</th><th>Funcional</th><th>Partida</th><th className="num">Importe</th></tr>
              </thead>
              <tbody>
                <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>{c.funcional ?? ""}</td><td>{c.partida ?? ""}</td><td className="num">{soles(c.importe)}</td></tr>
              </tbody>
            </table>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <table className="formato" style={{ flex: "1 1 260px", width: "auto" }}>
                <thead><tr><th colSpan={4}>Contabilidad presupuestal</th></tr><tr><th>Debe</th><th className="num">Importe</th><th>Haber</th><th className="num">Importe</th></tr></thead>
                <tbody><tr><td></td><td className="num">{soles(c.importe)}</td><td></td><td className="num">{soles(c.importe)}</td></tr></tbody>
              </table>
              <table className="formato" style={{ flex: "1 1 260px", width: "auto" }}>
                <thead><tr><th colSpan={4}>Contabilidad patrimonial</th></tr><tr><th>Debe</th><th className="num">Importe</th><th>Haber</th><th className="num">Importe</th></tr></thead>
                <tbody><tr><td></td><td className="num">{soles(c.importe)}</td><td></td><td className="num">{soles(c.importe)}</td></tr></tbody>
              </table>
              <table className="formato" style={{ flex: "1 1 200px", width: "auto" }}>
                <tbody>
                  <tr><td className="etiqueta">Total</td><td className="num">{soles(c.importe)}</td></tr>
                  <tr><td className="etiqueta">Deducciones</td><td className="num">{soles(c.deducciones)}</td></tr>
                  <tr><td className="etiqueta">Líquido a pagar</td><td className="num"><b>{soles(liquido)}</b></td></tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <table className="formato" style={{ flex: "1 1 300px", width: "auto" }}>
                <thead><tr><th colSpan={3}>Para uso del tesorero</th></tr><tr><th>Fecha</th><th>Hecho por</th><th>Conforme</th></tr></thead>
                <tbody>
                  <tr><td>{fecha(c.fecha)}</td><td>{iniciales}</td><td className="firma"></td></tr>
                  <tr><td colSpan={3} className="etiqueta firma">Visación</td></tr>
                </tbody>
              </table>
              <table className="formato" style={{ flex: "1 1 300px", width: "auto" }}>
                <thead><tr><th colSpan={2}>Forma de pago</th></tr></thead>
                <tbody>
                  <tr><td className="etiqueta">N° cuenta</td><td>{ctx.mcp.banco_cuenta ?? ""}</td></tr>
                  <tr><td className="etiqueta">N° de cheque</td><td>{c.cheque ?? ""}</td></tr>
                  <tr><td className="etiqueta">Fondos para pagos en efectivo</td><td></td></tr>
                  <tr><td className="etiqueta">Autorizado / firma</td><td className="firma"></td></tr>
                </tbody>
              </table>
            </div>
            <table className="formato">
              <thead><tr><th colSpan={4}>Recibí conforme</th></tr></thead>
              <tbody>
                <tr><td className="etiqueta">Fecha</td><td className="etiqueta">Firma</td><td className="etiqueta">D.N.I.</td><td className="etiqueta">R.U.C. · L.M.</td></tr>
                <tr><td className="firma"></td><td></td><td></td><td></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside className="lateral no-imprimir">
          {c.estado === "aprobado" && !c.cheque && puedeRegistrar && (
            <form action={registrarCheque} className="panel">
              <div className="panel-cab">Registrar cheque al girar</div>
              <div className="panel-cuerpo">
                <input type="hidden" name="id" value={id} />
                <label className="campo">N° de cheque<input name="cheque" required inputMode="numeric" /></label>
                <button className="btn primario" type="submit">Guardar cheque</button>
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
                <button className="btn" type="submit">Guardar cambios</button>
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
