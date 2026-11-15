import { SubirAdjunto } from "@/components/AdjuntosExpediente";
import Motivo from "@/components/Motivo";
import type { AnexoVista } from "@/lib/adjuntosVista";
import { anularAdjunto } from "@/app/(app)/expedientes/adjuntos";

const MOTIVOS = ["Se subió el documento equivocado", "La foto no se lee bien", "Se subió dos veces (duplicado)", "Corresponde a otro expediente"];

/** Un archivo adjunto a página completa: la foto se ve y se imprime; el PDF se ve aquí y en papel sale una hoja de anexo. */
export default function VisorAnexo({ anexo, expedienteId, puede = false }: { anexo: AnexoVista; expedienteId?: string; puede?: boolean }) {
  if (anexo.origen === "pendiente") {
    return (
      <div className="anexo-hoja">
        <div className="aviso alerta" style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>Aún no hay archivo de «{anexo.nombre}». {puede && expedienteId ? "Súbalo aquí: queda en este expediente." : "Pida a la tesorera que lo suba."}</span>
          {puede && expedienteId && <SubirAdjunto id={expedienteId} tipo={anexo.tipo} boton={`Subir ${anexo.nombre.toLowerCase()}`} clase="btn chico primario" />}
        </div>
      </div>
    );
  }
  const pdf = anexo.mime === "application/pdf";
  return (
    <div className="anexo-hoja">
      <div className="anexo-cab no-imprimir pequeno tenue">
        {anexo.nombre}{anexo.origen === "permanente" ? " · permanente (vale todos los meses)" : anexo.origen === "heredado" ? " · tomado de otro mes de este mismo gasto" : ""} ·{" "}
        <a href={anexo.url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>
        {puede && expedienteId && anexo.origen === "propio" && anexo.clave.startsWith("adj-") && (
          <> · <Motivo chico accion={anularAdjunto} boton="Anular" titulo="Anular adjunto" ayuda="Motivo (mínimo 10 letras)" campos={{ id: expedienteId, adjunto_id: anexo.clave.slice(4) }} motivos={MOTIVOS} /></>
        )}
      </div>
      {pdf ? (
        <>
          <iframe className="anexo-pdf no-imprimir" src={anexo.url} title={anexo.nombre} />
          <div className="anexo-nota">
            <b>ANEXO · {anexo.nombre.toUpperCase()}</b>
            <span>Documento en PDF adjunto a este expediente. Ábralo desde el sistema para imprimirlo.</span>
          </div>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="anexo-img" src={anexo.url} alt={anexo.nombre} />
      )}
    </div>
  );
}
