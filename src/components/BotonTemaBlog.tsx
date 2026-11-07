"use client";

import { useEffect, useState } from "react";

const CLAVE = "sw-tema";

/** Interruptor de modo claro / oscuro del blog. La elección se recuerda en este navegador. */
export default function BotonTemaBlog() {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    setOscuro(document.documentElement.dataset.swTema === "oscuro");
  }, []);

  function alternar() {
    const nuevo = !oscuro;
    setOscuro(nuevo);
    document.documentElement.dataset.swTema = nuevo ? "oscuro" : "claro";
    try {
      localStorage.setItem(CLAVE, nuevo ? "oscuro" : "claro");
    } catch {}
  }

  return (
    <button type="button" className="sw-tema" onClick={alternar} aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={oscuro ? "Modo claro" : "Modo oscuro"}>
      {oscuro ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
