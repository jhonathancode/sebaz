"use client";

import { useEffect, useRef, useState } from "react";
import { sugerirConcepto } from "@/lib/concepto";
import { conceptoSeRequiere, conceptoSinSeRequiere } from "@/lib/requerimiento";

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
    const tipo = () => form?.querySelector<HTMLInputElement>('input[name="tipo"]:checked')?.value;
    // Si el texto salió de la redacción ya aprobada de un pago fijo, no se sugiere nada mientras no se cambie
    let silenciado: string | null = null;
    const revisar = () => {
      const actual = conceptoSinSeRequiere(input.value);
      setSug(silenciado !== null && actual === conceptoSinSeRequiere(silenciado) ? null : sugerirConcepto(actual, undefined, tipo()));
    };
    const alGuardada = (e: Event) => {
      silenciado = (e as CustomEvent<{ texto: string }>).detail?.texto ?? null;
      revisar();
    };
    window.addEventListener("sebaz:redaccion-guardada", alGuardada);
    input.addEventListener("input", revisar);
    form?.addEventListener("change", revisar);
    revisar();
    return () => {
      window.removeEventListener("sebaz:redaccion-guardada", alGuardada);
      input.removeEventListener("input", revisar);
      form?.removeEventListener("change", revisar);
    };
  }, [campo]);

  function usar() {
    const form = ref.current?.closest("form");
    if (!form || !sug) return;
    escribir(form.querySelector<HTMLInputElement>(`input[name="${campo}"]`), campo === "descripcion" ? conceptoSeRequiere(sug) : sug);
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
          <span className="s-txt">{campo === "descripcion" ? conceptoSeRequiere(sug) : sug}</span>
          <button type="button" className="btn chico primario" onClick={usar}>Usar</button>
        </>
      )}
    </div>
  );
}
