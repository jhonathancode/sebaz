"use client";

import { useState } from "react";

/** Campo de contraseña con ojito para ver u ocultar lo que se escribe. */
export default function CampoClave(props: { name: string; autoComplete: string; minLength?: number }) {
  const [ver, setVer] = useState(false);
  return (
    <span className="clave-caja">
      <input name={props.name} type={ver ? "text" : "password"} required minLength={props.minLength} autoComplete={props.autoComplete} />
      <button type="button" className="clave-ojo" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} title={ver ? "Ocultar contraseña" : "Mostrar contraseña"}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {ver && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
