"use client";

import { useEffect } from "react";

const TIPOS_TEXTO = new Set(["text", "search", ""]);

function aplica(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.closest("[data-sin-mayusculas]");
  if (el instanceof HTMLInputElement) {
    const tipo = (el.getAttribute("type") ?? "").toLowerCase();
    return TIPOS_TEXTO.has(tipo) && !el.closest("[data-sin-mayusculas]");
  }
  return false;
}

/**
 * Todo lo que se escribe a mano en el sistema queda en MAYÚSCULAS,
 * se escriba como se escriba. No toca correos, claves, fechas ni números.
 */
export default function Mayusculas() {
  useEffect(() => {
    const alEscribir = (e: Event) => {
      const el = e.target;
      if (!aplica(el)) return;
      if ((e as InputEvent).isComposing) return;
      const mayus = el.value.toLocaleUpperCase("es-PE");
      if (mayus === el.value) return;
      const ini = el.selectionStart;
      const fin = el.selectionEnd;
      // Setter nativo: así React también recibe el valor en mayúsculas.
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, mayus);
      if (ini !== null && fin !== null) el.setSelectionRange(ini, fin);
    };
    // Al guardar, también pasa a mayúsculas lo que venía escrito de antes.
    const alGuardar = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      for (const el of Array.from(form.elements)) {
        if (aplica(el) && !el.readOnly) alEscribir({ target: el } as unknown as Event);
      }
    };
    // Fase de captura en document: corre antes que los manejadores de React.
    document.addEventListener("input", alEscribir, true);
    document.addEventListener("submit", alGuardar, true);
    return () => {
      document.removeEventListener("input", alEscribir, true);
      document.removeEventListener("submit", alGuardar, true);
    };
  }, []);
  return null;
}
