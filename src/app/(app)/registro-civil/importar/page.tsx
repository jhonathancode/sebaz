import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { COLUMNAS_IMPORT } from "@/lib/registroCivil";
import { importarPadron } from "../acciones";

export default async function Importar({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  return (
    <>
      <div className="titulo-ventana">
        <h1>Importar el padrón desde Excel</h1>
        <span className="espacio" />
        <Link className="btn" href="/registro-civil">Cerrar</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <section className="panel">
        <div className="panel-cuerpo">
          <p>Si el padrón del libro físico (o del sistema anterior) ya está en una hoja de Excel, súbalo aquí y quedará todo buscable de una vez. Las partidas escaneadas se adjuntan después, desde la ficha de cada persona.</p>
          <ol>
            <li>{/* eslint-disable-next-line @next/next/no-html-link-for-pages */}<a href="/registro-civil/plantilla" download>Descargue la plantilla</a> y copie sus datos en ella (una fila por acta; solo son obligatorios <b>apellido paterno</b> y <b>nombres</b>).</li>
            <li>La columna <b>TIPO</b> puede decir Nacimiento, Matrimonio o Defunción. La <b>FECHA</b> puede ir como 15/03/1990.</li>
            <li>Súbala aquí. Hasta 5 000 filas por archivo.</li>
          </ol>
          <p className="tenue pequeno">Columnas: {COLUMNAS_IMPORT.join(" · ")}</p>
          {puede ? (
            <form action={importarPadron} className="barra" style={{ marginTop: 10 }}>
              <label className="campo" style={{ flex: "2 1 260px" }}>Archivo de Excel (.xlsx)<input type="file" name="excel" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label>
              <label className="campo">Origen de estos datos
                <select name="origen" defaultValue="fisico">
                  <option value="fisico">Libro físico (hasta 2022)</option>
                  <option value="digital">Sistema digital (desde 2022)</option>
                </select>
              </label>
              <button className="btn primario" type="submit">Importar</button>
            </form>
          ) : (
            <div className="aviso alerta">Solo el administrador, tesorero, contador o alcalde puede importar.</div>
          )}
        </div>
      </section>
    </>
  );
}
