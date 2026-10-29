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
  const [apertura, setApertura] = useState(0);

  function abrir() {
    const form = boton.current?.form;
    // Si faltan datos obligatorios, que el navegador lo diga antes de preguntar.
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setOpcional(!!pinOpcionalSi && !!form?.querySelector(pinOpcionalSi));
    setPinEscrito("");
    setApertura((n) => n + 1); // el PIN siempre se muestra limpio
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
      <dialog ref={dialogo} className={`dialogo${pin || opcional ? " dialogo-seguro" : ""}`} aria-label={pregunta}>
        {pin || opcional ? (
          <div className="seguro-cab">
            <span className="seguro-candado" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                <circle cx="12" cy="15.5" r="1.2" fill="currentColor" />
              </svg>
            </span>
            <span className="seguro-etq">Confirmación de seguridad</span>
            <span className="seguro-titulo">{pregunta}</span>
          </div>
        ) : (
          <div className="dialogo-cab">{pregunta}</div>
        )}
        {(detalle || opcional) && (
          <div className={`dialogo-cuerpo${pin || opcional ? " seguro-texto" : ""}`}>
            <p style={{ margin: 0 }}>
              {opcional ? "Si usted es quien aprueba, escriba su PIN para aprobar este pago fijo en el acto. Sin PIN, solo se registra y se aprueba después." : detalle}
            </p>
          </div>
        )}
        {(pin || opcional) && (
          <div className="dialogo-cuerpo seguro-pin">
            <CampoPin key={apertura} ref={campoPin} name="pin" etiqueta={opcional ? "Su PIN (opcional)" : "Su PIN personal"} onEnter={confirmar} onCambio={setPinEscrito} verificar />
          </div>
        )}
        {(pin || opcional) && <p className="seguro-nota">Su PIN es personal y se verifica de forma cifrada. Nunca lo comparta.</p>}
        <div className={`dialogo-pie${pin || opcional ? " seguro-pie" : ""}`}>
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
