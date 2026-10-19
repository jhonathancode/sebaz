"use client";

import { useEffect, useState } from "react";

type Tema = "light" | "dark";

/** Botón redondo con ícono: luna para pasar a oscuro, sol para volver a claro. */
export default function BotonTema({ inicial }: { inicial: Tema | null }) {
  const [tema, setTema] = useState<Tema | null>(inicial);

  useEffect(() => {
    if (tema === null) setTema(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, [tema]);

  function cambiar() {
    const nuevo: Tema = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    document.cookie = `tema=${nuevo}; path=/; max-age=31536000; samesite=lax`;
    setTema(nuevo);
  }

  const oscuro = tema === "dark";
  const etiqueta = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  return (
    <button type="button" className="boton-tema" onClick={cambiar} aria-label={etiqueta} title={etiqueta}>
      {oscuro ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
