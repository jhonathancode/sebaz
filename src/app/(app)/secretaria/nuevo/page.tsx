import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { contextoMcp, tiene } from "@/lib/contexto";
import { MODELOS_BASE, TIPOS_SEC, tipoSec } from "@/lib/secretaria";
import { supabaseServidor } from "@/lib/supabase/server";
import { archivarModelo, crearDesdeModelo, importarModeloWord } from "../acciones";

export default async function NuevoDocumento({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) {
    return <div className="aviso info">No tiene permiso para redactar documentos.</div>;
  }
  const supabase = await supabaseServidor();
  const { data: propios } = await supabase.from("sec_modelos").select("id, tipo, nombre, asunto").eq("mcp_id", ctx.mcp.id).eq("activo", true).order("creado_en", { ascending: false });

  return (
    <>
      <div className="titulo-ventana">
        <h1>Nuevo documento</h1>
        <span className="espacio" />
        <VentanaFlotante boton="Cargar mi modelo desde Word" titulo="Cargar un modelo desde Word" accion={importarModeloWord} textoGuardar="Cargar modelo" claseBoton="btn">
          <label className="campo">Nombre del modelo<input name="nombre" required placeholder="Ej.: Acuerdo de consejo de audiencia pública" /></label>
          <label className="campo">
            Tipo de documento
            <select name="tipo" defaultValue="acuerdo">
              {TIPOS_SEC.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </select>
          </label>
          <CampoArchivoEstado etiqueta="Archivo de Word (.docx)" multiple={false} ayuda="Solo .docx, máximo 4 MB. Se conservan el texto, negritas, listas y tablas; si algo cambia, se corrige en el editor." />
        </VentanaFlotante>
        <Link className="btn" href="/secretaria">Volver al archivo</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <p className="tenue pequeno" style={{ marginTop: 0 }}>Elija un modelo: se copia como borrador y usted lo edita. El modelo original no cambia.</p>

      {(propios ?? []).length > 0 && (
        <>
          <h2 className="sec-grupo">Mis modelos</h2>
          <div className="sec-modelos">
            {(propios ?? []).map((m) => (
              <div key={m.id} className="sec-modelo">
                <span className="etq">{tipoSec(m.tipo).nombre}</span>
                <b>{m.nombre}</b>
                {m.asunto && <small>{m.asunto}</small>}
                <form action={crearDesdeModelo}>
                  <input type="hidden" name="origen" value={`propio:${m.id}`} />
                  <button className="btn primario chico" type="submit">Usar este modelo</button>
                </form>
                <form action={archivarModelo}>
                  <input type="hidden" name="id" value={m.id} />
                  <BotonConfirmar className="btn chico contorno" pregunta="¿Archivar este modelo?" detalle="Dejará de aparecer en la lista. Los documentos ya hechos con él no cambian." textoConfirmar="Sí, archivar">Archivar</BotonConfirmar>
                </form>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="sec-grupo">Modelos de ZEBAZ</h2>
      <div className="sec-modelos">
        {MODELOS_BASE.map((m) => (
          <div key={m.id} className="sec-modelo">
            <span className="etq">{tipoSec(m.tipo).nombre}</span>
            <b>{m.nombre}</b>
            <small>{m.detalle}</small>
            <form action={crearDesdeModelo}>
              <input type="hidden" name="origen" value={`base:${m.id}`} />
              <button className="btn primario chico" type="submit">Usar este modelo</button>
            </form>
          </div>
        ))}
      </div>

      <h2 className="sec-grupo">En blanco</h2>
      <div className="sec-tipos">
        {TIPOS_SEC.map((t) => (
          <form key={t.clave} action={crearDesdeModelo} style={{ display: "inline" }}>
            <input type="hidden" name="origen" value={`blanco:${t.clave}`} />
            <button type="submit" className="btn chico contorno">{t.nombre} en blanco</button>
          </form>
        ))}
      </div>
    </>
  );
}
