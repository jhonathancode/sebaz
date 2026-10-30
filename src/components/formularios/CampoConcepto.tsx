"use client";

import { useEffect, useRef } from "react";
import { conceptoSeRequiere } from "@/lib/requerimiento";

/**
 * Concepto del requerimiento: al salir del campo (o cuando se llena solo) queda empezando con
 * «SE REQUIERE…», por ejemplo «la compra de útiles» → «SE REQUIERE LA COMPRA DE ÚTILES».
 */
export default function CampoConcepto({ defaultValue = "" }: { defaultValue?: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const normalizar = () => {
      const v = conceptoSeRequiere(el.value);
      if (v === el.value) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    el.addEventListener("change", normalizar);
    return () => el.removeEventListener("change", normalizar);
  }, []);

  return <input ref={ref} name="descripcion" defaultValue={defaultValue} placeholder="SE REQUIERE la compra de útiles de oficina para la tesorería" />;
}
