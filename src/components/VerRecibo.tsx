"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BotonPdf from "@/components/BotonPdf";

/** «Ver recibo»: abre al instante una ventana emergente con el recibo y las opciones de descargar PDF e imprimir. */
export default function VerRecibo({ titulo, nombrePdf, children, acciones }: { titulo: string; nombrePdf: string; children: React.ReactNode; acciones?: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (abierto && ref.current && !ref.current.open) ref.current.showModal();
  }, [abierto]);

  function imprimir() {
    const h = document.documentElement;
    h.classList.add("imp-recibo");
    const quitar = () => {
      h.classList.remove("imp-recibo");
      window.removeEventListener("afterprint", quitar);
    };
    window.addEventListener("afterprint", quitar);
    window.print();
  }

  return (
    <>
      <button type="button" className="btn chico contorno" onClick={() => setAbierto(true)}>Ver recibo</button>
      {abierto && typeof document !== "undefined" && createPortal(
        <dialog ref={ref} className="ventana-flotante ancha recibo-ventana" aria-label={titulo} onClose={() => setAbierto(false)} onClick={(e) => e.target === ref.current && ref.current?.close()}>
          <div className="vf-marco">
            <div className="vf-cab no-imprimir">
              <h2>{titulo}</h2>
              <div className="rv-acciones">
                <BotonPdf nombre={nombrePdf} selector=".recibo-ventana .hoja" className="btn chico primario" />
                <button type="button" className="btn chico contorno no-imprimir" onClick={imprimir}>Imprimir</button>
                {acciones}
                <button type="button" className="vf-cerrar" aria-label="Cerrar" onClick={() => ref.current?.close()}>×</button>
              </div>
            </div>
            <div className="vf-cuerpo rv-cuerpo">
              <div className="documentos mesa">{children}</div>
            </div>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
