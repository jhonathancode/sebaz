"use client";

import { forwardRef, useState, useTransition } from "react";
import { verificarMiPin } from "@/app/(app)/cuenta/acciones";

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
    /** Muestra el botón "Verificar": si el PIN es correcto se oculta el teclado y sale el aviso. */
    verificar?: boolean;
  }
>(function CampoPin({ name, etiqueta, required, onEnter, teclado = true, verificar = false }, ref) {
  const [valor, setValor] = useState("");
  const [correcto, setCorrecto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [pendiente, empezar] = useTransition();
  const comprobar = (pin: string) =>
    empezar(async () => {
      const r = await verificarMiPin(pin);
      if (r.ok) {
        setCorrecto(true);
        setAviso("");
      } else {
        setAviso(r.mensaje);
        setValor("");
      }
    });
  const poner = (v: string) => {
    setAviso("");
    const nuevo = v.replace(/\D/g, "").slice(0, 4);
    setValor(nuevo);
    if (verificar && nuevo.length === 4) comprobar(nuevo);
  };
  const cambiar = () => {
    setCorrecto(false);
    setValor("");
    setAviso("");
  };

  return (
    <div className="pin-campo">
      {correcto && (
        <div className="pin-correcto" role="status">
          <span className="pin-visto">✓</span>
          <span>
            <b>PIN correcto</b>
            <small>Identidad confirmada</small>
          </span>
          <button type="button" className="pin-cambiar" onClick={cambiar}>Cambiar</button>
        </div>
      )}
      {!correcto && etiqueta && <span className="pin-etiqueta">{etiqueta}</span>}
      <div className="pin-casillas" style={correcto ? { display: "none" } : undefined}>
        {[0, 1, 2, 3].map((i) => (
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
          maxLength={4}
          pattern="\d{4}"
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
      {teclado && !correcto && (
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
      {pendiente && <span className="pin-ayuda">Verificando…</span>}
      {aviso && <span className="pin-error" role="alert">{aviso}</span>}
      {!correcto && <span className="pin-ayuda">4 números</span>}
    </div>
  );
});

export default CampoPin;
