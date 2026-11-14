"use client";

import { useState } from "react";
import { crearPdf } from "@/lib/pdf";

/**
 * Descarga como PDF (A4) las hojas del documento que se ven en pantalla.
 * Cada ".hoja" empieza en una página nueva; si es larga, sigue en la siguiente.
 */
export default function BotonPdf({
  nombre,
  selector = "main .hoja",
  texto = "Descargar PDF",
  className = "btn",
  horizontal = false,
}: {
  nombre: string;
  selector?: string;
  texto?: string;
  className?: string;
  /** Hoja A4 horizontal (para cuadros anchos). */
  horizontal?: boolean;
}) {
  const [cargando, setCargando] = useState(false);

  async function descargar() {
    setCargando(true);
    try {
      const pdf = await crearPdf(selector, horizontal);
      pdf?.save(`${nombre.replace(/[^\w\- ]+/g, "").trim() || "documento"}.pdf`);
    } finally {
      setCargando(false);
    }
  }

  return (
    <button type="button" className={`${className} no-imprimir`} onClick={descargar} disabled={cargando}>
      {cargando ? "Preparando PDF…" : texto}
    </button>
  );
}
