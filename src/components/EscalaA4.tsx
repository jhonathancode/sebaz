"use client";

import { useEffect, useRef, useState } from "react";

/** Ancho de una hoja A4 vertical en pantalla (210 mm a 96 ppp) y de una horizontal (297 mm). */
const ANCHO = 794;
const ANCHO_H = 1123;

/**
 * Muestra los documentos como hojas A4 verticales, completas (sin barras de desplazamiento),
 * reducidas para que quepan en el ancho disponible.
 */
export default function EscalaA4({ children }: { children: React.ReactNode }) {
  const medida = useRef<HTMLDivElement>(null);
  const interior = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [base, setBase] = useState(ANCHO);
  const [alto, setAlto] = useState<number | undefined>(undefined);

  useEffect(() => {
    const ajustar = () => {
      const ancho = medida.current?.clientWidth ?? ANCHO;
      // Si el documento es una hoja horizontal (como la NEA), se reduce a partir de su ancho
      const b = interior.current?.querySelector(".hoja.horizontal") ? ANCHO_H : ANCHO;
      const e = Math.min(1, ancho / b);
      setBase(b);
      setEscala(e);
      setAlto((interior.current?.offsetHeight ?? 0) * e);
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    // El documento puede cambiar (otra pestaña) sin que cambie el tamaño: se vuelve a medir
    const mo = new MutationObserver(ajustar);
    if (interior.current) mo.observe(interior.current, { childList: true, subtree: true });
    if (medida.current) ro.observe(medida.current);
    if (interior.current) ro.observe(interior.current);
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <div ref={medida} className="escala-a4-medida">
      <div className="escala-a4" style={{ width: base * escala, height: alto }}>
        <div ref={interior} className="escala-a4-interior" style={{ width: base, transform: `scale(${escala})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
