"use client";

import { useEffect, useRef } from "react";

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
          <div className="vf-cuerpo">{children}</div>
          <div className="vf-pie">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn primario">
              {textoGuardar}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
