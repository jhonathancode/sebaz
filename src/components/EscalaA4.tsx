"use client";

import { useEffect, useRef, useState } from "react";

/** Ancho de una hoja A4 en pantalla (210 mm a 96 ppp). */
const ANCHO = 794;

/**
 * Muestra los documentos como hojas A4 verticales, completas (sin barras de desplazamiento),
 * reducidas para que quepan en el ancho disponible.
 */
export default function EscalaA4({ children }: { children: React.ReactNode }) {
  const medida = useRef<HTMLDivElement>(null);
  const interior = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [alto, setAlto] = useState<number | undefined>(undefined);

  useEffect(() => {
    const ajustar = () => {
      const ancho = medida.current?.clientWidth ?? ANCHO;
      const e = Math.min(1, ancho / ANCHO);
      setEscala(e);
      setAlto((interior.current?.offsetHeight ?? 0) * e);
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    if (medida.current) ro.observe(medida.current);
    if (interior.current) ro.observe(interior.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={medida} className="escala-a4-medida">
      <div className="escala-a4" style={{ width: ANCHO * escala, height: alto }}>
        <div ref={interior} className="escala-a4-interior" style={{ width: ANCHO, transform: `scale(${escala})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
