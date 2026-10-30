"use client";

import { useState } from "react";

/**
 * Descarga como PDF (A4) las hojas del documento que se ven en pantalla.
 * Cada ".hoja" empieza en una página nueva; si es larga, sigue en la siguiente.
 */
export default function BotonPdf({
  nombre,
  selector = "main .hoja",
  texto = "Descargar PDF",
  className = "btn",
}: {
  nombre: string;
  selector?: string;
  texto?: string;
  className?: string;
}) {
  const [cargando, setCargando] = useState(false);

  async function descargar() {
    const hojas = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (hojas.length === 0) return;
    setCargando(true);
    // Para el PDF las hojas se capturan a tamaño real, sin la reducción de la vista previa
    document.documentElement.classList.add("pdf-captura");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const margen = 10;
      const ancho = W - margen * 2;
      const alto = H - margen * 2;
      let primera = true;

      for (const hoja of hojas) {
        const lienzo = await html2canvas(hoja, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const pxPorPagina = Math.floor((lienzo.width * alto) / ancho);
        for (let y = 0; y < lienzo.height; y += pxPorPagina) {
          const trozo = document.createElement("canvas");
          trozo.width = lienzo.width;
          trozo.height = Math.min(pxPorPagina, lienzo.height - y);
          const ctx = trozo.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, trozo.width, trozo.height);
          ctx.drawImage(lienzo, 0, y, lienzo.width, trozo.height, 0, 0, lienzo.width, trozo.height);
          if (!primera) pdf.addPage();
          primera = false;
          pdf.addImage(trozo.toDataURL("image/jpeg", 0.92), "JPEG", margen, margen, ancho, (trozo.height * ancho) / trozo.width);
        }
      }
      pdf.save(`${nombre.replace(/[^\w\- ]+/g, "").trim() || "documento"}.pdf`);
    } finally {
      document.documentElement.classList.remove("pdf-captura");
      setCargando(false);
    }
  }

  return (
    <button type="button" className={`${className} no-imprimir`} onClick={descargar} disabled={cargando}>
      {cargando ? "Preparando PDF…" : texto}
    </button>
  );
}
