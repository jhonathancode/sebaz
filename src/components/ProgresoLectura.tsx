"use client";

import { useEffect, useRef } from "react";

/** Barra fina arriba que avanza mientras se lee el artículo (elemento con id «articulo»). */
export default function ProgresoLectura() {
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let pendiente = false;
    const calcular = () => {
      pendiente = false;
      const el = document.getElementById("articulo");
      if (!el || !barra.current) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const avance = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      barra.current.style.transform = `scaleX(${avance})`;
    };
    const alMover = () => {
      if (!pendiente) {
        pendiente = true;
        requestAnimationFrame(calcular);
      }
    };
    calcular();
    window.addEventListener("scroll", alMover, { passive: true });
    window.addEventListener("resize", alMover);
    return () => {
      window.removeEventListener("scroll", alMover);
      window.removeEventListener("resize", alMover);
    };
  }, []);
  return <div className="sb-progreso" aria-hidden="true"><div ref={barra} /></div>;
}
