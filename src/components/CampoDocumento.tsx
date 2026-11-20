"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";

/**
 * Campo de DNI o RUC con su botón «Buscar». El botón valida que haya 8 dígitos (DNI) u 11 (RUC) y
 * avisa a la página con el evento «sebaz:buscar-documento» (y repite el «input» del campo, que es lo que
 * escucha AutoDocumento). Cuando se conecte la consulta automática, solo se engancha a ese evento.
 */
export default function CampoDocumento(props: InputHTMLAttributes<HTMLInputElement>) {
  const caja = useRef<HTMLSpanElement>(null);
  const [aviso, setAviso] = useState("");

  function buscar() {
    const el = caja.current?.querySelector("input");
    if (!el) return;
    const n = el.value.replace(/\D/g, "");
    if (n.length !== 8 && n.length !== 11) {
      setAviso("Escriba 8 dígitos (DNI) u 11 (RUC) para buscar.");
      return;
    }
    setAviso("");
    el.dispatchEvent(new CustomEvent("sebaz:buscar-documento", { bubbles: true, detail: { numero: n, tipo: n.length === 8 ? "dni" : "ruc" } }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return (
    <>
      <span ref={caja} className="campo-doc">
        <input {...props} onChange={(e) => { setAviso(""); props.onChange?.(e); }} />
        <button type="button" className="btn chico contorno campo-doc-buscar" onClick={buscar} title="Buscar los datos por este número">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          Buscar
        </button>
      </span>
      {aviso && <span className="pequeno" style={{ color: "var(--peligro, #c0392b)", fontWeight: 400 }} role="alert">{aviso}</span>}
    </>
  );
}
