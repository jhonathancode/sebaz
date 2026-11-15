"use client";

import { useState } from "react";
import { crearPaquete } from "@/lib/pdf";

/** Descarga en un solo PDF todo lo que se ve en la página: informe, documentos de cada expediente y sus anexos. */
export default function BotonPaquete({ nombre }: { nombre: string }) {
  const [estado, setEstado] = useState<string | null>(null);
  async function descargar() {
    setEstado("Preparando…");
    try {
      const pdf = await crearPaquete("main .hoja, main img.anexo-img, main [data-anexo-pdf]", (h, t) => setEstado(`Armando el PDF… ${h} de ${t}`));
      pdf?.save(`${nombre.replace(/[^\w\- ]+/g, "").trim() || "rendicion"}.pdf`);
    } catch {
      setEstado("No se pudo armar el PDF. Intente de nuevo.");
      return;
    }
    setEstado(null);
  }
  return (
    <button type="button" className="btn primario no-imprimir" onClick={descargar} disabled={estado !== null && !estado.startsWith("No se")}>
      {estado ?? "Descargar paquete completo (PDF)"}
    </button>
  );
}
