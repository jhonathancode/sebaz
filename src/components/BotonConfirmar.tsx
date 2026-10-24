"use client";

import { useRef } from "react";

/**
 * Botón que antes de ejecutar la acción pregunta "¿Está seguro?".
 * Va dentro del <form> de la acción; al confirmar, envía ese formulario.
 */
export default function BotonConfirmar({
  children,
  pregunta,
  detalle,
  textoConfirmar = "Sí, continuar",
  className = "btn primario",
  disabled = false,
  peligro = false,
}: {
  children: React.ReactNode;
  pregunta: string;
  detalle?: string;
  textoConfirmar?: string;
  className?: string;
  disabled?: boolean;
  peligro?: boolean;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  function abrir() {
    const form = boton.current?.form;
    // Si faltan datos obligatorios, que el navegador lo diga antes de preguntar.
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    dialogo.current?.showModal();
  }

  function confirmar() {
    dialogo.current?.close();
    boton.current?.form?.requestSubmit();
  }

  return (
    <>
      <button ref={boton} type="button" className={className} onClick={abrir} disabled={disabled}>
        {children}
      </button>
      <dialog ref={dialogo} className="dialogo" aria-label={pregunta}>
        <div className="dialogo-cab">{pregunta}</div>
        {detalle && (
          <div className="dialogo-cuerpo">
            <p style={{ margin: 0 }}>{detalle}</p>
          </div>
        )}
        <div className="dialogo-pie">
          <button type="button" className="btn" onClick={() => dialogo.current?.close()}>
            No, volver
          </button>
          <button type="button" className={`btn ${peligro ? "peligro" : "primario"}`} onClick={confirmar} autoFocus>
            {textoConfirmar}
          </button>
        </div>
      </dialog>
    </>
  );
}
