import type { AnexoVista } from "@/lib/adjuntosVista";

/** Un archivo adjunto a página completa: la foto se ve y se imprime; el PDF se ve aquí y en papel sale una hoja de anexo. */
export default function VisorAnexo({ anexo }: { anexo: AnexoVista }) {
  const pdf = anexo.mime === "application/pdf";
  return (
    <div className="anexo-hoja">
      <div className="anexo-cab no-imprimir pequeno tenue">
        {anexo.nombre}{anexo.permanente ? " · permanente (vale todos los meses)" : ""} ·{" "}
        <a href={anexo.url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>
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
