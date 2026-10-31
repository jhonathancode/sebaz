"use client";

import { useEffect, useRef, useState } from "react";

/**
 * N° del documento de sustento. Con declaración jurada el número es automático (correlativo del año):
 * se muestra el que corresponde y no se escribe; con los demás sustentos se escribe el número del papel.
 */
export default function NumeroSustento({ automatico, defaultValue = "" }: { automatico: string; defaultValue?: string }) {
  const raiz = useRef<HTMLLabelElement>(null);
  const [dj, setDj] = useState(true);

  useEffect(() => {
    const sel = raiz.current?.closest("form")?.querySelector<HTMLSelectElement>('select[name="sustento_tipo"]');
    if (!sel) return;
    const leer = () => setDj(sel.value === "DJ");
    leer();
    sel.addEventListener("change", leer);
    return () => sel.removeEventListener("change", leer);
  }, []);

  return (
    <label ref={raiz} className="campo">
      N° del documento
      {dj ? (
        <input value={automatico} readOnly disabled aria-label="Número automático de la declaración jurada" />
      ) : (
        <input name="sustento_numero" defaultValue={defaultValue} placeholder="B001-3516" required />
      )}
      {dj && <span className="pequeno tenue">Automático: lo pone el sistema.</span>}
    </label>
  );
}
