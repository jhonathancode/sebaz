"use client";

import { useRef } from "react";
import type { Plantilla } from "@/lib/atajos";

function escribir(el: HTMLInputElement | HTMLSelectElement | null, valor: string) {
  if (!el) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fila de atajos: un clic copia un requerimiento reciente (tipo, dinero, resumen y cosas) para solo ajustar cantidad y precio. */
export default function PlantillasRecientes({ plantillas }: { plantillas: Plantilla[] }) {
  const marca = useRef<HTMLDivElement>(null);
  if (!plantillas.length) return null;

  function usar(p: Plantilla) {
    const form = marca.current?.closest("form");
    if (!form) return;
    form.querySelector<HTMLInputElement>(`input[name="tipo"][value="${p.tipo}"]`)?.click();
    form.querySelector<HTMLInputElement>(`input[name="fuente_id"][value="${p.fuente_id ?? ""}"]`)?.click();
    escribir(form.querySelector<HTMLInputElement>('input[name="descripcion"]'), p.descripcion);
    if (p.clasificador) escribir(form.querySelector<HTMLSelectElement>('select[name="clasificador"]'), p.clasificador);
    window.dispatchEvent(new CustomEvent("sebaz:llenar-items", { detail: p.items }));
    // El cursor cae en el precio de la primera cosa, que es lo que más cambia
    setTimeout(() => form.querySelector<HTMLInputElement>('input[name="precio_1"]')?.select(), 50);
  }

  return (
    <div ref={marca} className="plantillas" role="group" aria-label="Repetir un requerimiento reciente">
      <span className="plantillas-et">Repetir uno reciente</span>
      <div className="plantillas-lista">
        {plantillas.map((p) => (
          <button key={p.descripcion} type="button" className="f-chip" title={p.items.map((i) => i.descripcion).join(" · ")} onClick={() => usar(p)}>
            {p.descripcion.length > 42 ? p.descripcion.slice(0, 41) + "…" : p.descripcion}
          </button>
        ))}
      </div>
    </div>
  );
}
