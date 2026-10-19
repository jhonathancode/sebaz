import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { CLASIFICADORES } from "@/lib/catalogos";
import { contextoMcp } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";
import { crearExpediente } from "../acciones";

export default async function NuevoExpediente({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const filas = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <>
      <div className="titulo-ventana">
        <h1>Nuevo requerimiento</h1>
        <span className="espacio" />
        <Link className="btn" href="/expedientes">Volver</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <form action={crearExpediente} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="panel">
          <div className="panel-cab">Datos generales</div>
          <div className="panel-cuerpo rejilla">
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
                {ctx.fuentes.map((f) => (
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
        </div>

        <div className="panel">
          <div className="panel-cab">Detalle (las filas vacías no se guardan)</div>
          <div className="tabla-marco" style={{ border: "none" }}>
            <table className="tabla" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>IT</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                  <th>Descripción detallada</th>
                  <th className="num">Precio unitario referencial</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((i) => (
                  <tr key={i}>
                    <td>{i}</td>
                    <td><input name={`cant_${i}`} inputMode="decimal" style={{ width: 90 }} /></td>
                    <td><input name={`und_${i}`} placeholder="UND" style={{ width: 90 }} /></td>
                    <td style={{ width: "60%" }}><input name={`desc_${i}`} style={{ width: "100%" }} /></td>
                    <td className="num"><input name={`precio_${i}`} inputMode="decimal" style={{ width: 120, textAlign: "right" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primario" type="submit">Guardar requerimiento</button>
          <Link className="btn" href="/expedientes">Cancelar</Link>
        </div>
      </form>
    </>
  );
}
