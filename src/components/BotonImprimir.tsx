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
    // Se espera a que carguen las fotos adjuntas (hasta 8 s) para que salgan en el papel
    let activo = true;
    const inicio = Date.now();
    const intentar = () => {
      if (!activo) return;
      const faltan = Array.from(document.images).some((i) => !i.complete);
      if (faltan && Date.now() - inicio < 8000) return void setTimeout(intentar, 250);
      window.print();
    };
    const t = setTimeout(intentar, 400);
    return () => {
      activo = false;
      clearTimeout(t);
    };
  }, []);
  return null;
}
