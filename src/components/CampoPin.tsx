"use client";

import { forwardRef, useState } from "react";

/**
 * Campo de PIN: seis casillas y teclado numérico en pantalla.
 * También se puede escribir con el teclado del equipo o del celular.
 */
const CampoPin = forwardRef<
  HTMLInputElement,
  {
    name: string;
    etiqueta?: string;
    required?: boolean;
    onEnter?: () => void;
    teclado?: boolean;
  }
>(function CampoPin({ name, etiqueta, required, onEnter, teclado = true }, ref) {
  const [valor, setValor] = useState("");
  const poner = (v: string) => setValor(v.replace(/\D/g, "").slice(0, 6));

  return (
    <div className="pin-campo">
      {etiqueta && <span className="pin-etiqueta">{etiqueta}</span>}
      <div className="pin-casillas">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`pin-casilla ${i < valor.length ? "llena" : ""} ${i === valor.length ? "activa" : ""}`} aria-hidden>
            {i < valor.length ? "●" : ""}
          </span>
        ))}
        <input
          ref={ref}
          name={name}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          pattern="\d{4,6}"
          required={required}
          value={valor}
          aria-label={etiqueta ?? "PIN"}
          onChange={(e) => poner(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          className="pin-real"
        />
      </div>
      {teclado && (
        <div className="pin-teclado">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <button key={n} type="button" tabIndex={-1} onClick={() => poner(valor + n)}>
              {n}
            </button>
          ))}
          <button type="button" tabIndex={-1} className="aux" onClick={() => setValor("")}>
            Borrar
          </button>
          <button type="button" tabIndex={-1} onClick={() => poner(valor + "0")}>
            0
          </button>
          <button type="button" tabIndex={-1} className="aux" onClick={() => setValor(valor.slice(0, -1))} aria-label="Quitar el último número">
            ⌫
          </button>
        </div>
      )}
      <span className="pin-ayuda">De 4 a 6 números</span>
    </div>
  );
});

export default CampoPin;
