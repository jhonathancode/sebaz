import { fechaHora } from "@/lib/formato";

/**
 * Marca de «ANULADO» para los documentos: un sello grande en diagonal sobre la hoja y,
 * arriba, la fecha y el motivo. Se imprime y sale en el PDF. Va como primer elemento de «.hoja».
 */
export default function MarcaAnulado({ motivo, en }: { motivo?: string | null; en?: string | null }) {
  return (
    <>
      <div className="marca-anulado en-hoja" aria-hidden="true"><span>ANULADO</span></div>
      <div className="nota-anulado">
        <b>DOCUMENTO ANULADO</b>
        {en ? ` el ${fechaHora(en)}` : ""}
        {motivo ? ` · Motivo: ${motivo}` : ""}
      </div>
    </>
  );
}

/** Al imprimir, el sello cubre cada página de esquina a esquina (se pone una sola vez por impresión). */
export function MarcaAnuladaPagina() {
  return (
    <div className="marca-anulado en-pagina" aria-hidden="true">
      <span>ANULADO</span>
    </div>
  );
}
