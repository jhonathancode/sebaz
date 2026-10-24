"use client";

import { useEffect, useRef, useState } from "react";
import { sugerirConcepto } from "@/lib/concepto";

function escribir(el: HTMLInputElement | null, valor: string) {
  if (!el) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Mira lo que se escribe en el campo indicado y, si lo reconoce, propone la
 * redacción formal del concepto. Con «Usar» la pone en el campo (y en el primer
 * ítem si está vacío).
 */
export default function SugerenciaConcepto({ campo = "descripcion", tambienItem = true }: { campo?: string; tambienItem?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sug, setSug] = useState<string | null>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    const input = form?.querySelector<HTMLInputElement>(`input[name="${campo}"]`);
    if (!input) return;
    const revisar = () => setSug(sugerirConcepto(input.value));
    input.addEventListener("input", revisar);
    revisar();
    return () => input.removeEventListener("input", revisar);
  }, [campo]);

  function usar() {
    const form = ref.current?.closest("form");
    if (!form || !sug) return;
    escribir(form.querySelector<HTMLInputElement>(`input[name="${campo}"]`), sug);
    if (tambienItem) {
      const item = form.querySelector<HTMLInputElement>('input[name="desc_1"]');
      if (item && !item.value.trim()) escribir(item, sug);
    }
    setSug(null);
  }

  return (
    <div ref={ref} className="sugerencia" hidden={!sug} aria-live="polite">
      {sug && (
        <>
          <span className="s-et">Sugerencia</span>
          <span className="s-txt">{sug}</span>
          <button type="button" className="btn chico primario" onClick={usar}>Usar</button>
        </>
      )}
    </div>
  );
}
