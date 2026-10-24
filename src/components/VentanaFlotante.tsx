"use client";

import { useEffect, useRef } from "react";
import BotonConfirmar from "./BotonConfirmar";
import BotonVistaPrevia, { type BaseVistaPrevia } from "./BotonVistaPrevia";
import type { Mcp } from "@/lib/contexto";

/**
 * Botón que abre una ventana flotante con un formulario para crear algo.
 * El formulario (children) se arma en el servidor; aquí solo se abre y se cierra.
 */
export default function VentanaFlotante({
  boton,
  titulo,
  children,
  accion,
  textoGuardar = "Guardar",
  abierta = false,
  ancha = false,
  claseBoton = "btn primario",
  confirmar,
  error,
  vistaPrevia,
}: {
  boton: string;
  titulo: string;
  children: React.ReactNode;
  accion: (fd: FormData) => Promise<void>;
  textoGuardar?: string;
  /** Se abre sola al cargar (por ejemplo, para corregir un error). */
  abierta?: boolean;
  ancha?: boolean;
  claseBoton?: string;
  /** Pregunta de confirmación antes de guardar. */
  confirmar?: string;
  /** Mensaje de error del último intento, se muestra dentro de la ventana. */
  error?: string;
  /** Si se indica, antes de emitir se muestra el documento tal como se imprimirá. */
  vistaPrevia?: { base: BaseVistaPrevia; mcp: Mcp };
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (abierta && ref.current && !ref.current.open) ref.current.showModal();
  }, [abierta]);

  return (
    <>
      <button type="button" className={`${claseBoton} no-imprimir`} onClick={() => ref.current?.showModal()}>
        {boton}
      </button>
      <dialog ref={ref} className={`ventana-flotante${ancha ? " ancha" : ""}`} aria-label={titulo}>
        <form action={accion} className="vf-marco">
          <div className="vf-cab">
            <h2>{titulo}</h2>
            <button type="button" className="vf-cerrar" aria-label="Cerrar" onClick={() => ref.current?.close()}>
              ×
            </button>
          </div>
          <div className="vf-cuerpo">
            {error && (
              <div className="aviso error" role="alert">
                <strong>No se pudo guardar.</strong> {error}
              </div>
            )}
            {children}
          </div>
          <div className="vf-pie">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            {vistaPrevia ? (
              <BotonVistaPrevia base={vistaPrevia.base} mcp={vistaPrevia.mcp} texto="Ver vista previa" textoEmitir={`Sí, ${textoGuardar.toLowerCase()}`} titulo={`Vista previa · ${titulo}`} />
            ) : (
              <BotonConfirmar pregunta={confirmar ?? `¿Está seguro de ${textoGuardar.toLowerCase()}?`} detalle="Revise que los datos estén bien antes de continuar." textoConfirmar={`Sí, ${textoGuardar.toLowerCase()}`}>
                {textoGuardar}
              </BotonConfirmar>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
