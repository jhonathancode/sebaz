import { CLASIFICADORES } from "@/lib/catalogos";
import type { Fuente } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";
import CampoCheque from "./CampoCheque";
import ReinicioPorTipo from "./ReinicioPorTipo";
import ItemsRequerimiento from "./ItemsRequerimiento";
import SelectorPagoFijo from "./SelectorPagoFijo";
import SugerenciaConcepto from "./SugerenciaConcepto";
import PlantillasRecientes from "./PlantillasRecientes";
import CompletarTodo from "./CompletarTodo";
import type { ProveedorConocido } from "./CamposProveedor";
import type { ItemHistorial, Plantilla } from "@/lib/atajos";
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
  items: { cantidad: number; unidad: string; descripcion: string; precio_unitario: number }[];
};

const TIPOS = [
  { valor: "compra", titulo: "Compra de bienes", texto: "Útiles, materiales, herramientas. Lleva cotizaciones, orden de compra y entra al almacén (NEA)." },
  { valor: "servicio", titulo: "Servicio externo", texto: "Un trabajo por un tiempo: alquiler, mantenimiento, asesoría. Lleva cotizaciones y orden de servicio." },
  { valor: "pago_fijo", titulo: "Pago fijo", texto: "Dietas del alcalde y regidores, personal contratado, asesores. No lleva cotizaciones." },
];

/** Nombre corto y claro de cada fuente de dinero. */
export function nombreFuente(f: Fuente) {
  if (f.tipo === "propios") return "Ingresos propios";
  const lugar = f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "");
  return `Transferencia de ${lugar}`;
}

function detalleFuente(f: Fuente) {
  if (f.tipo === "propios") return "Lo recaudado por la MCP: copias, constancias, alquileres";
  return f.tipo === "distrito" ? "Municipalidad distrital" : "Municipalidad provincial";
}

/** Formulario del requerimiento, en preguntas simples. */
export default function CamposRequerimiento({ fuentes, valores, pagosFijos, chequeSugerido, plantillas, historial, fuenteFrecuente, proveedores }: { proveedores?: ProveedorConocido[]; fuentes: Fuente[]; valores?: ValoresRequerimiento; pagosFijos?: PagoFijoCatalogo[]; chequeSugerido?: string; plantillas?: Plantilla[]; historial?: ItemHistorial[]; fuenteFrecuente?: string | null }) {
  const tipo = valores?.tipo ?? "compra";
  // La fuente que más se usó; si no hay historial, la transferencia distrital
  const fuentePorDefecto = (fuenteFrecuente && fuentes.some((f) => f.id === fuenteFrecuente) ? fuenteFrecuente : undefined) ?? fuentes.find((f) => f.tipo === "distrito")?.id ?? fuentes[0]?.id;
  // Al corregir un requerimiento que aún no tiene dinero definido, queda marcada «Definir después».
  const fuente = valores ? valores.fuente_id ?? "" : fuentePorDefecto;
  const hayPropios = fuentes.some((f) => f.tipo === "propios");

  return (
    <>
      {!valores && plantillas && <PlantillasRecientes plantillas={plantillas} />}
      {!valores && <ReinicioPorTipo fuenteInicial={fuentePorDefecto} clasificadorInicial="2.3 Bienes y servicios" />}
      <fieldset className="pregunta">
        <legend>1. ¿Qué tipo de gasto es?</legend>
        <div className="opciones compacta">
          {TIPOS.map((t) => (
            <label key={t.valor} className="opcion" title={t.texto}>
              <input type="radio" name="tipo" value={t.valor} defaultChecked={t.valor === tipo} required />
              <span className="opcion-titulo">{t.titulo}</span>
              <span className="opcion-texto">{t.texto}</span>
            </label>
          ))}
        </div>
        {pagosFijos && <SelectorPagoFijo pagos={pagosFijos} periodo={periodoActual()} />}
      </fieldset>

      <fieldset className="pregunta">
        <legend>2. ¿Con qué dinero se paga?</legend>
        <div className="opciones compacta">
          {fuentes.map((f) => (
            <label key={f.id} className="opcion" title={detalleFuente(f)}>
              <input type="radio" name="fuente_id" value={f.id} defaultChecked={f.id === fuente} required />
              <span className="opcion-titulo">{nombreFuente(f)}</span>
              <span className="opcion-texto">{detalleFuente(f)}</span>
            </label>
          ))}
          <label className="opcion">
            <input type="radio" name="fuente_id" value="" defaultChecked={fuente === ""} />
            <span className="opcion-titulo">Definir después</span>
            <span className="opcion-texto">Aún no se sabe. Antes de generar el comprobante de pago se le preguntará.</span>
          </label>
        </div>
        {!hayPropios && <p className="pequeno tenue" style={{ margin: "6px 0 0" }}>La opción «Ingresos propios» aún no está activa en su MCP. Avise a soporte.</p>}
      </fieldset>

      <fieldset className="pregunta">
        <legend>3. Detalle: ¿qué se necesita y cuánto cuesta? <span className="legend-nota">(cosa por cosa)</span></legend>
        <ItemsRequerimiento inicial={valores?.items} historial={historial} />
      </fieldset>

      <fieldset className="pregunta">
        <legend>4. Resumen del gasto <span className="legend-nota">(opcional: si lo deja vacío se arma solo con lo anterior)</span></legend>
        <label className="campo">
          <input name="descripcion" defaultValue={valores?.descripcion ?? ""} placeholder="Se completa solo con la primera cosa del detalle" />
        </label>
        <SugerenciaConcepto tambienItem={false} />
      </fieldset>

      {!valores && (
        <fieldset className="pregunta">
          <legend>5. Cheque <span className="legend-nota">(opcional)</span></legend>
          <CampoCheque sugerido={chequeSugerido} />
        </fieldset>
      )}

      {!valores && proveedores && <CompletarTodo proveedores={proveedores} />}

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
