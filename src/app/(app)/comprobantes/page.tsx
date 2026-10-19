import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import CamposComprobanteDirecto from "@/components/formularios/CamposComprobanteDirecto";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp } from "@/lib/contexto";
import { codigoCP, fecha, nombrePeriodo, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { crearComprobanteDirecto } from "./acciones";

const ORIGEN: Record<string, string> = { expediente: "Expediente", caja_chica: "Caja chica", directo: "Directo" };

export default async function Comprobantes({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = sp.mes ?? periodoActual();
  const { desde, hasta } = rangoPeriodo(periodo);

  let q = supabase
    .from("comprobantes_pago")
    .select("id, numero, anio, fecha, origen, beneficiario, concepto, importe, cheque, estado, fuentes(municipalidad, tipo)")
    .eq("mcp_id", ctx.mcp.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("numero", { ascending: false });
  if (sp.estado) q = q.eq("estado", sp.estado);
  if (sp.fuente) q = q.eq("fuente_id", sp.fuente);
  const { data } = await q;
  const filas = data ?? [];
  const total = filas.filter((f) => f.estado !== "anulado").reduce((s, f) => s + Number(f.importe), 0);

  return (
    <>
      <div className="titulo-ventana">
        <h1>Comprobantes de pago · {nombrePeriodo(periodo)}</h1>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="barra">
        <form method="get" style={{ display: "contents" }}>
        <label className="campo">Mes<input type="month" name="mes" defaultValue={periodo} /></label>
        <label className="campo">
          Se paga con
          <select name="fuente" defaultValue={sp.fuente ?? ""}>
            <option value="">Todas</option>
            {ctx.fuentes.map((f) => (
              <option key={f.id} value={f.id}>{f.municipalidad}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="aprobado">Aprobado</option>
            <option value="rendido">Rendido</option>
            <option value="anulado">Anulado</option>
          </select>
        </label>
        <button className="btn" type="submit">Filtrar</button>
        </form>
        <span className="espacio" />
        <VentanaFlotante boton="Nuevo comprobante directo" titulo="Nuevo comprobante de pago directo" accion={crearComprobanteDirecto} textoGuardar="Guardar en borrador" abierta={sp.nuevo === "1"}>
          <CamposComprobanteDirecto fuentes={ctx.fuentes} />
        </VentanaFlotante>
      </div>

      <div className="tabla-marco">
        <table className="tabla" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>N° CP</th><th>Fecha</th><th>Origen</th><th>Fuente</th><th>Beneficiario</th><th>Concepto</th>
              <th>N° cheque</th><th>Estado</th><th className="num">Importe S/</th><th className="num">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className="tenue">No hay comprobantes en este mes.</td></tr>}
            {filas.map((c) => {
              const f = c.fuentes as unknown as { municipalidad: string; tipo: string } | null;
              return (
                <tr key={c.id} className={c.estado === "anulado" ? "anulado" : undefined}>
                  <td style={{ fontWeight: 600 }}>{codigoCP(c.numero, c.origen)}</td>
                  <td>{fecha(c.fecha)}</td>
                  <td>{ORIGEN[c.origen]}</td>
                  <td>{f?.tipo === "distrito" ? "Distrito" : f?.tipo === "provincia" ? "Provincia" : "Ingresos propios"}</td>
                  <td>{c.beneficiario}</td>
                  <td className="envolver tachar">{c.concepto}</td>
                  <td>{c.cheque ?? <span className="falta">Pendiente</span>}</td>
                  <td><Estado valor={c.estado} /></td>
                  <td className="num tachar">{soles(c.importe)}</td>
                  <td><div className="acciones-fila"><Link className="btn chico contorno" href={`/comprobantes/${c.id}`}>Abrir</Link></div></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={8}>Total vigente</td><td className="num">{soles(total)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      <div className="pie">
        <span>{filas.length} comprobantes</span>
        <span>Solo los aprobados y con cheque entran en la rendición.</span>
      </div>
    </>
  );
}
