"use client";

import { useRef, useState } from "react";

const aPuntos = (t: string) => {
  const p = t.split(/\r?\n/).map((l) => l.replace(/^\s*[-–•*]+\s*/, "").trim()).filter(Boolean);
  return p.length ? p : [""];
};

/** Lista de puntos con guiones: Enter agrega otro punto; se guarda como texto con un guion por línea. */
export default function ListaPuntos({ name, valor, ejemplo, disabled = false }: { name: string; valor: string; ejemplo?: string; disabled?: boolean }) {
  const [puntos, setPuntos] = useState<string[]>(() => aPuntos(valor));
  const campos = useRef<(HTMLTextAreaElement | null)[]>([]);
  const foco = (i: number) => setTimeout(() => campos.current[i]?.focus(), 0);
  const cambiar = (i: number, v: string) => setPuntos((ps) => ps.map((p, j) => (j === i ? v.replace(/\n/g, " ") : p)));
  const agregarDespues = (i: number) => {
    setPuntos((ps) => [...ps.slice(0, i + 1), "", ...ps.slice(i + 1)]);
    foco(i + 1);
  };
  const quitar = (i: number) => {
    setPuntos((ps) => (ps.length === 1 ? [""] : ps.filter((_, j) => j !== i)));
    foco(Math.max(0, i - 1));
  };
  const crece = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const guardado = puntos.map((p) => p.trim()).filter(Boolean).map((p) => `- ${p}`).join("\n");
  return (
    <div className="lp">
      <input type="hidden" name={name} value={guardado} />
      <ul className="lp-lista">
        {puntos.map((p, i) => (
          <li key={i} className="lp-fila">
            <span className="lp-guion" aria-hidden="true">–</span>
            <textarea
              ref={(el) => { campos.current[i] = el; crece(el); }}
              rows={1}
              value={p}
              disabled={disabled}
              placeholder={i === 0 ? ejemplo ?? "Escriba un punto" : "Otro punto"}
              aria-label={`Punto ${i + 1}`}
              onChange={(e) => { cambiar(i, e.target.value); crece(e.target); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); if (p.trim()) agregarDespues(i); }
                else if (e.key === "Backspace" && p === "" && puntos.length > 1) { e.preventDefault(); quitar(i); }
              }}
            />
            {!disabled && puntos.length > 1 && <button type="button" className="lp-x" onClick={() => quitar(i)} aria-label={`Quitar el punto ${i + 1}`}>×</button>}
          </li>
        ))}
      </ul>
      {!disabled && (
        <button type="button" className="btn chico contorno" onClick={() => agregarDespues(puntos.length - 1)} disabled={!puntos[puntos.length - 1].trim()}>
          + Agregar punto
        </button>
      )}
    </div>
  );
}
