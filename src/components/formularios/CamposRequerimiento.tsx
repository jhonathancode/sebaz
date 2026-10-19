import { CLASIFICADORES } from "@/lib/catalogos";
import type { Fuente } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";

/** Campos del requerimiento (se usan dentro de una ventana flotante). */
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

export default function CamposRequerimiento({ fuentes, valores }: { fuentes: Fuente[]; valores?: ValoresRequerimiento }) {
  const filas = Array.from({ length: Math.max(8, (valores?.items.length ?? 0) + 2) }, (_, i) => i + 1);
  const it = (i: number) => valores?.items[i - 1];
  return (
    <>
      <div className="rejilla">
        <label className="campo">
          Fecha
          <input type="date" name="fecha" defaultValue={valores?.fecha ?? hoyISO()} required />
        </label>
        <label className="campo ancho">
          Tipo de gasto
          <select name="tipo" defaultValue={valores?.tipo ?? "compra"}>
            <option value="compra">Compra de bienes · con cotizaciones y orden de compra</option>
            <option value="servicio">Servicio externo temporal · con cotizaciones y orden de servicio</option>
            <option value="pago_fijo">Pago fijo · dietas, alcalde, personal contratado (sin cotizaciones)</option>
          </select>
        </label>
        <label className="campo">
          Se paga con
          <select name="fuente_id" required defaultValue={valores?.fuente_id ?? undefined}>
            {fuentes.map((f) => (
              <option key={f.id} value={f.id}>{f.municipalidad}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          Unidad orgánica / área usuaria
          <input name="area_usuaria" defaultValue={valores?.area_usuaria ?? ""} placeholder="Gerencia de Administración" />
        </label>
        <label className="campo">
          Meta / actividad
          <input name="meta" defaultValue={valores?.meta ?? ""} placeholder="Secretaría general" />
        </label>
        <label className="campo">
          Específica del gasto
          <select name="clasificador" defaultValue={valores?.clasificador ?? "2.3 Bienes y servicios"}>
            {CLASIFICADORES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="campo ancho">
          Descripción del requerimiento
          <input name="descripcion" required defaultValue={valores?.descripcion ?? ""} placeholder="Ej.: Servicio de tesorería del mes de octubre" />
        </label>
      </div>
      <div>
        <div className="etiqueta" style={{ marginBottom: 6 }}>Detalle · las filas vacías no se guardan</div>
        <div className="tabla-marco">
          <table className="tabla" style={{ minWidth: 680 }}>
            <thead>
              <tr><th>IT</th><th>Cantidad</th><th>Unidad</th><th>Descripción detallada</th><th className="num">P. unitario referencial</th></tr>
            </thead>
            <tbody>
              {filas.map((i) => (
                <tr key={i}>
                  <td style={{ verticalAlign: "middle" }}>{i}</td>
                  <td><input name={`cant_${i}`} defaultValue={it(i)?.cantidad ?? ""} inputMode="decimal" style={{ width: 80 }} aria-label={`Cantidad ítem ${i}`} /></td>
                  <td><input name={`und_${i}`} defaultValue={it(i)?.unidad ?? ""} placeholder="UND" style={{ width: 80 }} aria-label={`Unidad ítem ${i}`} /></td>
                  <td style={{ width: "60%" }}><input name={`desc_${i}`} defaultValue={it(i)?.descripcion ?? ""} style={{ width: "100%" }} aria-label={`Descripción ítem ${i}`} /></td>
                  <td className="num"><input name={`precio_${i}`} defaultValue={it(i)?.precio_unitario ?? ""} inputMode="decimal" style={{ width: 110, textAlign: "right" }} aria-label={`Precio ítem ${i}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
