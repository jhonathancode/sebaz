"use client";

import { useEffect, useRef, useState } from "react";

type Uso = { rubro: string; concepto: string };

/** Recomendaciones de concepto por rubro: lo más común en una MCP. */
const SUGERENCIAS: Record<string, string[]> = {
  servicio: ["Tipeo de documentos", "Copias e impresión de documentos", "Escaneo de documentos", "Servicio de fotocopiado", "Servicio de internet"],
  tasa: ["Constancia de posesión", "Certificado de domicilio", "Copia certificada de documentos", "Derecho de trámite", "Certificado de residencia"],
  venta: ["Venta de formatos y bases", "Venta de material reciclable", "Venta de productos de la zona", "Venta de bienes en desuso"],
  alquiler: ["Alquiler del local comunal", "Alquiler de equipo de sonido", "Alquiler de sillas y mesas", "Alquiler del salón de usos múltiples", "Alquiler de maquinaria"],
  otro: ["Aporte voluntario", "Donación", "Multa comunal", "Actividad pro fondos"],
};

/**
 * Concepto del recibo con recomendaciones: primero lo que ya se cobró antes con ese rubro,
 * luego lo más común. Un clic lo escribe en el campo; sigue siendo texto libre.
 */
export default function CampoConceptoIngreso({ historial }: { historial: Uso[] }) {
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [rubro, setRubro] = useState("servicio");

  useEffect(() => {
    const form = raiz.current?.closest("form");
    const sel = form?.querySelector<HTMLSelectElement>('select[name="rubro"]');
    if (!sel) return;
    const leer = () => setRubro(sel.value);
    leer();
    sel.addEventListener("change", leer);
    return () => sel.removeEventListener("change", leer);
  }, []);

  const usados = [...new Set(historial.filter((h) => h.rubro === rubro).map((h) => h.concepto))].slice(0, 4);
  const comunes = (SUGERENCIAS[rubro] ?? []).filter((c) => !usados.some((u) => u.toLowerCase() === c.toLowerCase()));

  function poner(texto: string) {
    if (!campo.current) return;
    campo.current.value = texto;
    campo.current.focus();
  }

  return (
    <div ref={raiz} className="campo-concepto-ing">
      <label className="campo ancho">
        Concepto
        <input ref={campo} name="concepto" required placeholder="Tipeo, copias e impresión de documentos" autoComplete="off" />
      </label>
      {usados.length > 0 && (
        <div className="chips-concepto">
          <span className="grupo-et">Cobrados antes</span>
          <div className="plantillas">
            {usados.map((c) => (
              <button key={c} type="button" className="f-chip" onClick={() => poner(c)}>{c}</button>
            ))}
          </div>
        </div>
      )}
      {comunes.length > 0 && (
        <div className="chips-concepto">
          <span className="grupo-et">Recomendados</span>
          <div className="plantillas">
            {comunes.map((c) => (
              <button key={c} type="button" className="f-chip" onClick={() => poner(c)}>{c}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
