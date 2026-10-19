import { CLASIFICADORES } from "@/lib/catalogos";
import type { Fuente } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";

/** Campos del requerimiento (se usan dentro de una ventana flotante). */
export default function CamposRequerimiento({ fuentes }: { fuentes: Fuente[] }) {
  const filas = Array.from({ length: 8 }, (_, i) => i + 1);
  return (
    <>
      <div className="rejilla">
        <label className="campo">
          Fecha
          <input type="date" name="fecha" defaultValue={hoyISO()} required />
        </label>
        <label className="campo">
          Tipo
          <select name="tipo" defaultValue="servicio">
            <option value="servicio">Servicio (orden de servicio)</option>
            <option value="compra">Compra (orden de compra)</option>
          </select>
        </label>
        <label className="campo">
          Municipalidad que transfiere
          <select name="fuente_id" required>
            {fuentes.map((f) => (
              <option key={f.id} value={f.id}>{f.municipalidad}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          Unidad orgánica / área usuaria
          <input name="area_usuaria" placeholder="Gerencia de Administración" />
        </label>
        <label className="campo">
          Meta / actividad
          <input name="meta" placeholder="Secretaría general" />
        </label>
        <label className="campo">
          Específica del gasto
          <select name="clasificador" defaultValue="2.3 Bienes y servicios">
            {CLASIFICADORES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="campo ancho">
          Descripción del requerimiento
          <input name="descripcion" required placeholder="Ej.: Servicio de tesorería del mes de octubre" />
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
                  <td><input name={`cant_${i}`} inputMode="decimal" style={{ width: 80 }} aria-label={`Cantidad ítem ${i}`} /></td>
                  <td><input name={`und_${i}`} placeholder="UND" style={{ width: 80 }} aria-label={`Unidad ítem ${i}`} /></td>
                  <td style={{ width: "60%" }}><input name={`desc_${i}`} style={{ width: "100%" }} aria-label={`Descripción ítem ${i}`} /></td>
                  <td className="num"><input name={`precio_${i}`} inputMode="decimal" style={{ width: 110, textAlign: "right" }} aria-label={`Precio ítem ${i}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
