"use client";

import CampoPin from "@/components/CampoPin";
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
  pin = false,
}: {
  children: React.ReactNode;
  pregunta: string;
  detalle?: string;
  textoConfirmar?: string;
  className?: string;
  disabled?: boolean;
  peligro?: boolean;
  /** Pide el PIN personal antes de enviar (acciones delicadas). */
  pin?: boolean;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const campoPin = useRef<HTMLInputElement>(null);

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
    if (pin && !/^\d{4,6}$/.test(campoPin.current?.value ?? "")) {
      campoPin.current?.focus();
      campoPin.current?.reportValidity();
      return;
    }
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
        {pin && (
          <div className="dialogo-cuerpo">
            <CampoPin ref={campoPin} name="pin" etiqueta="Su PIN personal" onEnter={confirmar} />
          </div>
        )}
        <div className="dialogo-pie">
          <button type="button" className="btn" onClick={() => dialogo.current?.close()}>
            No, volver
          </button>
          <button type="button" className={`btn ${peligro ? "peligro" : "primario"}`} onClick={confirmar} autoFocus={!pin}>
            {textoConfirmar}
          </button>
        </div>
      </dialog>
    </>
  );
}
