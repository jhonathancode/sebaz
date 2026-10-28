"use client";

import CampoPin from "@/components/CampoPin";
import { useRef, useState } from "react";

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
  pinOpcionalSi,
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
  /** Selector: si el formulario lo cumple, el PIN se ofrece al final como opcional (para aprobar de una vez). */
  pinOpcionalSi?: string;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const campoPin = useRef<HTMLInputElement>(null);
  const [opcional, setOpcional] = useState(false);
  const [pinEscrito, setPinEscrito] = useState("");

  function abrir() {
    const form = boton.current?.form;
    // Si faltan datos obligatorios, que el navegador lo diga antes de preguntar.
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setOpcional(!!pinOpcionalSi && !!form?.querySelector(pinOpcionalSi));
    setPinEscrito("");
    dialogo.current?.showModal();
  }

  function confirmar() {
    if (pin && !/^\d{4}$/.test(campoPin.current?.value ?? "")) {
      campoPin.current?.focus();
      campoPin.current?.reportValidity();
      return;
    }
    if (opcional && pinEscrito.length > 0 && pinEscrito.length < 4) {
      campoPin.current?.focus();
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
        {(detalle || opcional) && (
          <div className="dialogo-cuerpo">
            <p style={{ margin: 0 }}>
              {opcional ? "Si usted es quien aprueba, escriba su PIN para aprobar este pago fijo en el acto. Sin PIN, solo se registra y se aprueba después." : detalle}
            </p>
          </div>
        )}
        {(pin || opcional) && (
          <div className="dialogo-cuerpo">
            <CampoPin ref={campoPin} name="pin" etiqueta={opcional ? "Su PIN (opcional)" : "Su PIN personal"} onEnter={confirmar} onCambio={setPinEscrito} verificar />
          </div>
        )}
        <div className="dialogo-pie">
          <button type="button" className="btn" onClick={() => dialogo.current?.close()}>
            No, volver
          </button>
          <button type="button" className={`btn ${peligro ? "peligro" : "primario"}`} onClick={confirmar} autoFocus={!pin}>
            {opcional ? (pinEscrito.length === 4 ? "Sí, aprobar y guardar" : "Solo registrar") : textoConfirmar}
          </button>
        </div>
      </dialog>
    </>
  );
}
