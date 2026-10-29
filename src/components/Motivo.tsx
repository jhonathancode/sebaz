"use client";

import CampoPin from "@/components/CampoPin";
import { useExigirPin, usePrimerNombre } from "@/components/UsuarioContexto";
import { useRef, useState } from "react";

/**
 * Botón que abre una ventana para escribir el motivo antes de ejecutar la
 * acción (anular, devolver, reabrir). El motivo queda en el historial.
 */
export default function Motivo({
  accion,
  boton,
  ayuda,
  campos,
  peligro = true,
  titulo,
  pin = false,
}: {
  accion: (fd: FormData) => Promise<void>;
  boton: string;
  ayuda: string;
  campos: Record<string, string>;
  peligro?: boolean;
  titulo?: string;
  /** Pide también el PIN personal. */
  pin?: boolean;
}) {
  const nombre = usePrimerNombre();
  const pinActivo = useExigirPin();
  const ref = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState("");
  const corto = texto.trim().length < 10;

  return (
    <>
      <button type="button" className={`btn no-imprimir${peligro ? " peligro" : ""}`} onClick={() => ref.current?.showModal()}>
        {boton}
      </button>
      <dialog ref={ref} className="dialogo" aria-label={titulo ?? boton} onClose={() => setTexto("")}>
        <form action={accion}>
          {Object.entries(campos).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className="dialogo-cab">{titulo ?? boton}</div>
          <div className="dialogo-cuerpo">
            {peligro && (
              <p className="tenue" style={{ margin: 0 }}>
                No se borra: queda registrado como anulado, con su motivo, quién lo hizo y cuándo.
              </p>
            )}
            <label className="campo">
              {ayuda}
              <textarea
                name="motivo"
                required
                minLength={10}
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escriba el motivo (mínimo 10 caracteres)"
              />
            </label>
            <span className="pequeno tenue">{texto.trim().length} / 10 caracteres mínimo</span>
            {pin && pinActivo && (
              <CampoPin name="pin" etiqueta={nombre ? `PIN de ${nombre}` : "Su PIN personal"} required verificar />
            )}
          </div>
          <div className="dialogo-pie">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className={`btn ${peligro ? "peligro" : "primario"}`} disabled={corto}>
              Confirmar: {boton.toLowerCase()}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
