"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Caja de búsqueda grande: va filtrando el padrón mientras se escribe (apellido, nombre o DNI). */
export default function BuscadorRC({ q, tipo, tipos }: { q: string; tipo: string; tipos: { codigo: string; nombre: string }[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);
  const [t, setT] = useState(tipo);
  const [pendiente, empezar] = useTransition();
  const primera = useRef(true);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const espera = setTimeout(() => {
      const p = new URLSearchParams();
      if (texto.trim()) p.set("q", texto.trim());
      if (t) p.set("tipo", t);
      empezar(() => router.replace(`/registro-civil${p.toString() ? `?${p}` : ""}`, { scroll: false }));
    }, 250);
    return () => clearTimeout(espera);
  }, [texto, t, router]);

  return (
    <div className="rc-buscador">
      <input
        className="rc-buscar-caja"
        type="search"
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por apellido, nombre o DNI…"
        aria-label="Buscar en el padrón"
        autoComplete="off"
        inputMode="search"
      />
      <div className="rc-tipos" role="group" aria-label="Tipo de acta">
        <button type="button" className={`rc-tipo${t === "" ? " sel" : ""}`} onClick={() => setT("")}>Todos</button>
        {tipos.map((x) => (
          <button key={x.codigo} type="button" className={`rc-tipo${t === x.codigo ? " sel" : ""}`} onClick={() => setT(x.codigo)}>{x.nombre}</button>
        ))}
      </div>
      <span className="rc-estado tenue pequeno" aria-live="polite">{pendiente ? "Buscando…" : ""}</span>
    </div>
  );
}
