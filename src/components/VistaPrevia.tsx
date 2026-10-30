"use client";

import { useEffect, useRef } from "react";

/**
 * Ventana con la vista previa del documento tal como se imprimirá, antes de
 * emitirlo. Desde aquí se corrige (vuelve al formulario) o se emite.
 */
export default function VistaPrevia({
  abierta,
  titulo,
  onCerrar,
  onEmitir,
  textoEmitir,
  aviso,
  children,
}: {
  abierta: boolean;
  titulo: string;
  onCerrar: () => void;
  onEmitir: () => void;
  textoEmitir: string;
  aviso?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  return (
    <dialog ref={ref} className="ventana-flotante ancha vista-previa-dialogo" aria-label={titulo} onClose={onCerrar}>
      <div className="vf-marco">
        <div className="vf-cab">
          <h2>{titulo}</h2>
          <button type="button" className="vf-cerrar" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
        <div className="vf-cuerpo" style={{ padding: 0 }}>
          <div className="aviso info" style={{ margin: 12 }}>
            {aviso ?? "Así quedará el documento. Revíselo: si algo está mal, presione «Corregir». El número es el correlativo que le toca y se asigna solo al emitir."}
          </div>
          <div className="mesa">{children}</div>
        </div>
        <div className="vf-pie">
          <button type="button" className="btn" onClick={onCerrar}>Corregir</button>
          <button type="button" className="btn primario" onClick={onEmitir} autoFocus>{textoEmitir}</button>
        </div>
      </div>
    </dialog>
  );
}
