import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import DocumentoEmitido from "@/components/DocumentoEmitido";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import FormatoSecretaria from "@/components/formatos/FormatoSecretaria";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoSec } from "@/lib/secretaria";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularDocumento, clonarDocumento, emitirDocumento, guardarComoModelo, subirEscaneado } from "../acciones";

const MOTIVOS = ["Error en el contenido", "Error en el destinatario", "Se emitió dos veces (duplicado)", "Se emitió con fecha equivocada"];

export default async function Documento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: d } = await supabase.from("sec_documentos").select("*").eq("id", id).eq("mcp_id", ctx.mcp.id).maybeSingle();
  if (!d) notFound();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const codigo = codigoSec(d.tipo, d.numero, d.anio, ctx.mcp.nombre);
  const firmada = d.archivo_path ? await supabase.storage.from("sustentos").createSignedUrl(d.archivo_path, 1800) : null;
  const formato = (
    <FormatoSecretaria
      mcp={ctx.mcp}
      d={{ tipo: d.tipo, numero: d.numero, anio: d.anio, fecha: d.fecha, destinatario: d.destinatario, destinatario_cargo: d.destinatario_cargo, asunto: d.asunto, referencia: d.referencia, cuerpo: d.cuerpo, firmante: d.firmante, firmante_cargo: d.firmante_cargo, con_copia: d.con_copia }}
    />
  );

  return (
    <>
      {sp.emitido === "1" && d.estado === "emitido" && (
        <DocumentoEmitido
          titulo={codigo}
          mensaje={`${codigo} emitido correctamente.`}
          archivo={codigo}
          textoWhatsapp={`Hola, le enviamos el documento ${codigo} de ${ctx.mcp.nombre}. Asunto: ${d.asunto ?? ""}.`}
          urlCerrar={`/secretaria/${id}`}
          textoNuevo="Nuevo documento"
          urlNuevo="/secretaria/nuevo"
        >
          {formato}
        </DocumentoEmitido>
      )}
      <div className="titulo-ventana no-imprimir">
        <h1>{d.numero ? codigo : `${codigo.split(" N°")[0]} · borrador`}</h1>
        <Estado valor={d.estado} />
        <span className="espacio" />
        {puede && d.estado === "borrador" && (
          <>
            <Link className="btn" href={`/secretaria/${id}/editar`}>Editar</Link>
            <form action={emitirDocumento}>
              <input type="hidden" name="id" value={id} />
              <BotonConfirmar pregunta="¿Emitir este documento?" detalle="Recibirá su número correlativo y ya no se podrá editar. Si hay un error, se anula con motivo y se emite otro." textoConfirmar="Sí, emitir">Emitir</BotonConfirmar>
            </form>
          </>
        )}
        {d.estado !== "borrador" && (
          <>
            <BotonPdf nombre={codigo} />
            <BotonImprimir />
          </>
        )}
        {puede && (
          <form action={clonarDocumento}>
            <input type="hidden" name="id" value={id} />
            <button className="btn" type="submit">Clonar y editar</button>
          </form>
        )}
        {puede && d.estado !== "anulado" && (
          <VentanaFlotante boton="Guardar como modelo" titulo="Guardar como modelo propio" accion={guardarComoModelo} textoGuardar="Guardar modelo" claseBoton="btn">
            <input type="hidden" name="id" value={id} />
            <label className="campo">Nombre del modelo<input name="nombre" required placeholder="Ej.: Oficio de invitación a faena" /></label>
            <p className="pequeno tenue" style={{ margin: 0 }}>Se guarda el texto tal como está ahora. Luego aparece en «Mis modelos» para usarlo cuando quiera.</p>
          </VentanaFlotante>
        )}
        {puede && d.estado === "emitido" && (
          <VentanaFlotante boton={d.archivo_path ? "Cambiar escaneado" : "Subir firmado"} titulo="Adjuntar el documento firmado y sellado" accion={subirEscaneado} textoGuardar="Adjuntar" claseBoton="btn">
            <input type="hidden" name="id" value={id} />
            <CampoArchivoEstado etiqueta="PDF o foto del documento firmado" multiple={false} ayuda="PDF o foto (JPG, PNG, WEBP); máximo 4 MB." />
          </VentanaFlotante>
        )}
        {puede && d.estado !== "anulado" && <Motivo accion={anularDocumento} boton="Anular" ayuda="Motivo de la anulación (mínimo 10 letras)" campos={{ id }} peligro motivos={MOTIVOS} />}
        <Link className="btn" href="/secretaria">Cerrar</Link>
      </div>
      <div className="no-imprimir"><Avisos ok={sp.ok} error={sp.error} /></div>
      {d.estado === "anulado" && <div className="aviso error">ANULADO · {d.anulado_motivo}</div>}
      {firmada?.data?.signedUrl && (
        <div className="aviso info no-imprimir">
          Escaneado firmado: <a href={firmada.data.signedUrl} target="_blank" rel="noopener noreferrer">{d.archivo_nombre ?? "ver archivo"}</a>
        </div>
      )}
      <div className="documentos mesa">{formato}</div>
    </>
  );
}
