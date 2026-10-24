"use client";

import { useEffect, useRef } from "react";

function escribir(el: HTMLInputElement | HTMLSelectElement | null, valor: string) {
  if (!el) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Al pasar de «Pago fijo» a compra o servicio (o al revés) se vacía lo que se había llenado
 * solo —el pago elegido, el texto, las filas, el dinero, la específica y el cheque— para
 * empezar limpio. Entre compra y servicio no se borra nada.
 */
export default function ReinicioPorTipo({ fuenteInicial, clasificadorInicial }: { fuenteInicial?: string; clasificadorInicial: string }) {
  const marca = useRef<HTMLSpanElement>(null);
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    const form = marca.current?.closest("form");
    if (!form) return;
    anterior.current = form.querySelector<HTMLInputElement>('input[name="tipo"]:checked')?.value ?? null;
    const alCambiar = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.name !== "tipo" || !t.checked) return;
      const de = anterior.current;
      const a = t.value;
      anterior.current = a;
      if (de === a || (de !== "pago_fijo" && a !== "pago_fijo")) return;
      escribir(form.querySelector<HTMLInputElement>('input[name="descripcion"]'), "");
      escribir(form.querySelector<HTMLSelectElement>('select[name="clasificador"]'), clasificadorInicial);
      if (fuenteInicial !== undefined) form.querySelector<HTMLInputElement>(`input[name="fuente_id"][value="${fuenteInicial}"]`)?.click();
      window.dispatchEvent(new CustomEvent("sebaz:reiniciar", { detail: { de, a } }));
    };
    form.addEventListener("change", alCambiar);
    return () => form.removeEventListener("change", alCambiar);
  }, [fuenteInicial, clasificadorInicial]);

  return <span ref={marca} hidden />;
}
