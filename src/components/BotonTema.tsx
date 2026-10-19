"use client";

import { useEffect, useState } from "react";

type Tema = "light" | "dark";

/** Selector Claro / Oscuro; se recuerda en este navegador. */
export default function BotonTema({ inicial }: { inicial: Tema | null }) {
  const [tema, setTema] = useState<Tema | null>(inicial);

  useEffect(() => {
    if (tema === null) setTema(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, [tema]);

  function elegir(nuevo: Tema) {
    document.documentElement.dataset.theme = nuevo;
    document.cookie = `tema=${nuevo}; path=/; max-age=31536000; samesite=lax`;
    setTema(nuevo);
  }

  return (
    <div className="selector-tema" role="radiogroup" aria-label="Apariencia">
      <button type="button" role="radio" aria-checked={tema === "light"} className={tema === "light" ? "activo" : undefined} onClick={() => elegir("light")} title="Modo claro">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <span>Claro</span>
      </button>
      <button type="button" role="radio" aria-checked={tema === "dark"} className={tema === "dark" ? "activo" : undefined} onClick={() => elegir("dark")} title="Modo oscuro">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        <span>Oscuro</span>
      </button>
    </div>
  );
}
