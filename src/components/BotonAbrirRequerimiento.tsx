"use client";

import { useRouter } from "next/navigation";

/**
 * Abre la ventana «Nuevo requerimiento» sin salir de la página. Si la ventana aún no terminó de cargar,
 * lleva a Expedientes (que también la abre).
 */
export default function BotonAbrirRequerimiento({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const d = { tomado: false };
        window.dispatchEvent(new CustomEvent("sebaz:abrir-nuevo-requerimiento", { detail: d }));
        if (!d.tomado) router.push("/expedientes?nuevo=1");
      }}
    >
      {children}
    </button>
  );
}
