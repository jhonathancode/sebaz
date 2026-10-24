"use client";

import { useEffect } from "react";

export default function BotonImprimir({ texto = "Imprimir" }: { texto?: string }) {
  return (
    <button type="button" className="btn primario no-imprimir" onClick={() => window.print()}>
      {texto}
    </button>
  );
}

/** Abre el diálogo de impresión al cargar (ahí se elige "Guardar como PDF"). */
export function ImprimirAlAbrir() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
