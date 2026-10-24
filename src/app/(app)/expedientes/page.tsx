import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import CamposRequerimiento from "@/components/formularios/CamposRequerimiento";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp } from "@/lib/contexto";
import { fecha, nombrePeriodo, num3, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { crearExpediente } from "./acciones";

const FASES: Record<string, string> = {
  requerimiento: "Requerimiento",
  cotizacion: "Cotizaciones",
  orden: "Orden",
  conformidad: "Conformidad",
  comprobante: "Comprobante de pago",
};

export default async function Expedientes({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = sp.mes ?? periodoActual();
  const { desde, hasta } = rangoPeriodo(periodo);

  let consulta = supabase
    .from("expedientes")
    .select("id, anio, numero, fecha, tipo, descripcion, area_usuaria, fase, estado, expediente_items(total, anulado)")
    .eq("mcp_id", ctx.mcp.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("numero", { ascending: false });
  if (sp.estado) consulta = consulta.eq("estado", sp.estado);
  if (sp.q) consulta = consulta.ilike("descripcion", `%${sp.q}%`);
  const { data: lista } = await consulta;

  const filas = (lista ?? []).map((e) => ({
    ...e,
    monto: (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
  }));
  const total = filas.filter((f) => f.estado !== "anulado").reduce((s, f) => s + f.monto, 0);

  return (
    <>
      <div className="titulo-ventana">
        <h1>Expedientes · {nombrePeriodo(periodo)}</h1>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="barra">
        <form method="get" style={{ display: "contents" }}>
        <label className="campo">
          Mes
          <input type="month" name="mes" defaultValue={periodo} />
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
        <label className="campo" style={{ flex: "1 1 200px" }}>
          Buscar
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Descripción del requerimiento" />
        </label>
        <button className="btn" type="submit">Filtrar</button>
        </form>
        <span className="espacio" />
        <VentanaFlotante boton="+ Nuevo requerimiento" claseBoton="btn primario grande" titulo="Nuevo requerimiento" accion={crearExpediente} textoGuardar="Guardar requerimiento" abierta={sp.nuevo === "1"} error={sp.nuevo === "1" ? sp.error : undefined} ancha>
          <CamposRequerimiento fuentes={ctx.fuentes} />
        </VentanaFlotante>
      </div>

      <div className="tabla-marco">
        <table className="tabla" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th>Área usuaria</th>
              <th>Fase</th>
              <th>Estado</th>
              <th className="num">Monto S/</th>
              <th className="num">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={9} className="tenue">No hay expedientes en este mes.</td>
              </tr>
            )}
            {filas.map((e) => (
              <tr key={e.id} className={e.estado === "anulado" ? "anulado" : undefined}>
                <td style={{ fontWeight: 600 }}>{num3(e.numero)}-{e.anio}</td>
                <td>{fecha(e.fecha)}</td>
                <td>{e.tipo === "compra" ? "Compra" : e.tipo === "servicio" ? "Servicio" : "Pago fijo"}</td>
                <td className="envolver tachar">{e.descripcion}</td>
                <td>{e.area_usuaria ?? "—"}</td>
                <td>{FASES[e.fase]}</td>
                <td><Estado valor={e.estado} /></td>
                <td className="num tachar">{soles(e.monto)}</td>
                <td>
                  <div className="acciones-fila">
                    <Link className="btn chico contorno" href={`/expedientes/${e.id}`}>Abrir</Link>
                    <Link className="btn chico" href={`/expedientes/${e.id}/documentos`}>Documentos</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>Total vigente del mes</td>
              <td className="num">{soles(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="pie">
        <span>{filas.length} expedientes</span>
        <span>Nada se elimina: los expedientes se anulan con motivo.</span>
      </div>
    </>
  );
}
