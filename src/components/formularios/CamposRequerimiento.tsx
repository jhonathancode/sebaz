import { CLASIFICADORES } from "@/lib/catalogos";
import type { Fuente } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";
import CampoCheque from "./CampoCheque";
import ReinicioPorTipo from "./ReinicioPorTipo";
import ItemsRequerimiento from "./ItemsRequerimiento";
import SelectorPagoFijo from "./SelectorPagoFijo";
import SugerenciaConcepto from "./SugerenciaConcepto";
import CampoConcepto from "./CampoConcepto";
import ChipsConcepto from "./ChipsConcepto";
import CompletarTodo from "./CompletarTodo";
import type { ProveedorConocido } from "./CamposProveedor";
import type { ItemHistorial } from "@/lib/atajos";
import type { PagoFijoCatalogo } from "@/lib/pagosFijos";
import { periodoActual } from "@/lib/formato";

export type ValoresRequerimiento = {
  fecha: string;
  tipo: string;
  fuente_id: string | null;
  area_usuaria: string | null;
  meta: string | null;
  clasificador: string | null;
  descripcion: string;
  cheque_previsto?: string | null;
  items: { cantidad: number; unidad: string; descripcion: string; precio_unitario: number }[];
};

const TIPOS = [
  { valor: "compra", trazo: "M6 7h12l1 13H5zM9 7a3 3 0 0 1 6 0", titulo: "Compra de bienes", texto: "Útiles, materiales, herramientas. Lleva cotizaciones, orden de compra y entra al almacén (NEA)." },
  { valor: "servicio", trazo: "M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z", titulo: "Servicio externo", texto: "Un trabajo por un tiempo: alquiler, mantenimiento, asesoría. Lleva cotizaciones y orden de servicio." },
  { valor: "pago_fijo", trazo: "M4 12a8 8 0 0 1 14-5l2-2v6h-6l2.2-2.2A5.5 5.5 0 1 0 17.5 14", titulo: "Pago fijo", texto: "Dietas del alcalde y regidores, personal contratado, asesores. No lleva cotizaciones." },
];

/** Orden en pantalla: ingresos propios, luego la distrital (Perené) y la provincial (Chanchamayo). */
export const ORDEN_FUENTES: Record<Fuente["tipo"], number> = { propios: 0, distrito: 1, provincia: 2 };

/** Nombre corto y claro de cada fuente de dinero. */
export function nombreFuente(f: Fuente) {
  if (f.tipo === "propios") return "Ingresos propios";
  const lugar = f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "");
  return `Transferencia de ${lugar}`;
}

export function detalleFuente(f: Fuente) {
  if (f.tipo === "propios") return "Lo recaudado por la MCP: copias, constancias, alquileres";
  return f.tipo === "distrito" ? "Municipalidad distrital" : "Municipalidad provincial";
}

/** Formulario del requerimiento, en preguntas simples. */
export default function CamposRequerimiento({ fuentes, valores, pagosFijos, chequeSugerido, historial, fuenteFrecuente, proveedores, modo }: { modo?: "asistente"; proveedores?: ProveedorConocido[]; fuentes: Fuente[]; valores?: ValoresRequerimiento; pagosFijos?: PagoFijoCatalogo[]; chequeSugerido?: string; historial?: ItemHistorial[]; fuenteFrecuente?: string | null }) {
  const tipo = valores?.tipo ?? "compra";
  // La fuente que más se usó; si no hay historial, la transferencia distrital
  const fuentePorDefecto = (fuenteFrecuente && fuentes.some((f) => f.id === fuenteFrecuente) ? fuenteFrecuente : undefined) ?? fuentes.find((f) => f.tipo === "distrito")?.id ?? fuentes[0]?.id;
  // Al corregir un requerimiento que aún no tiene dinero definido, queda marcada «Definir después».
  const fuente = valores ? valores.fuente_id ?? "" : fuentePorDefecto;
  const hayPropios = fuentes.some((f) => f.tipo === "propios");

  return (
    <>
            {!valores && <ReinicioPorTipo fuenteInicial={fuentePorDefecto} clasificadorInicial="2.3 Bienes y servicios" />}
      <fieldset className="pregunta">
        <legend>¿Qué tipo de gasto es?</legend>
        <div className="opciones compacta opciones-tipo">
          {TIPOS.map((t) => (
            <label key={t.valor} className="opcion" title={t.texto}>
              <input type="radio" name="tipo" value={t.valor} defaultChecked={t.valor === tipo} required />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.trazo} /></svg>
              <span className="opcion-titulo">{t.titulo}</span>
              <span className="opcion-texto">{t.texto}</span>
            </label>
          ))}
        </div>
        {pagosFijos && <SelectorPagoFijo pagos={pagosFijos} periodo={periodoActual()} />}
      </fieldset>

      <fieldset className="pregunta">
        <legend>¿Con qué dinero se paga?</legend>
        <div className="opciones compacta opciones-dinero">
          {[...fuentes].sort((a, b) => ORDEN_FUENTES[a.tipo] - ORDEN_FUENTES[b.tipo]).map((f) => (
            <label key={f.id} className="opcion" title={detalleFuente(f)}>
              <input type="radio" name="fuente_id" value={f.id} defaultChecked={f.id === fuente} required />
              <span className="opcion-titulo">{nombreFuente(f)}</span>
              <span className="opcion-texto">{detalleFuente(f)}</span>
            </label>
          ))}
          <label className="opcion definir">
            <input type="radio" name="fuente_id" value="" defaultChecked={fuente === ""} />
            <span className="opcion-titulo">Definir después</span>
            <span className="opcion-texto">Se pregunta antes del pago</span>
          </label>
        </div>
        {!hayPropios && <p className="pequeno tenue" style={{ margin: "6px 0 0" }}>La opción «Ingresos propios» aún no está activa en su MCP. Avise a soporte.</p>}
      </fieldset>

      <fieldset className="pregunta">
        <legend>¿Qué se requiere? <span className="legend-nota">(el concepto empieza con «Se requiere…»; si lo deja vacío se arma solo)</span></legend>
        <label className="campo">
          <CampoConcepto defaultValue={valores?.descripcion ?? ""} />
        </label>
        {!valores && <ChipsConcepto />}
        <SugerenciaConcepto tambienItem={false} />
      </fieldset>

      <fieldset className="pregunta">
        <legend>Detalle: ¿qué se necesita y cuánto cuesta? <span className="legend-nota">(cosa por cosa: cantidad, unidad y precio)</span></legend>
        <ItemsRequerimiento inicial={valores?.items} historial={historial} />
      </fieldset>

      {modo !== "asistente" && (
        <fieldset className="pregunta">
          <legend>Cheque <span className="legend-nota">(opcional)</span></legend>
          <CampoCheque sugerido={chequeSugerido} inicial={valores?.cheque_previsto ?? ""} />
        </fieldset>
      )}

      {!valores && proveedores && modo !== "asistente" && <CompletarTodo proveedores={proveedores} />}

      <details className="pregunta mas-datos">
        <summary>Datos para el formato (fecha, área, meta, específica del gasto)</summary>
        <div className="rejilla" style={{ marginTop: 10 }}>
          <label className="campo">
            Fecha
            <input type="date" name="fecha" defaultValue={valores?.fecha ?? hoyISO()} required />
          </label>
          <label className="campo">
            Área que lo pide
            <input name="area_usuaria" defaultValue={valores?.area_usuaria ?? ""} placeholder="Tesorería, alcaldía, regiduría..." />
          </label>
          <label className="campo">
            Meta o actividad
            <input name="meta" defaultValue={valores?.meta ?? ""} placeholder="Opcional" />
          </label>
          <label className="campo">
            Específica del gasto
            <select name="clasificador" defaultValue={valores?.clasificador ?? "2.3 Bienes y servicios"}>
              {CLASIFICADORES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </>
  );
}
