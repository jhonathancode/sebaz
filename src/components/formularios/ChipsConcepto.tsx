"use client";

import { useEffect, useRef, useState } from "react";
import { conceptoSeRequiere } from "@/lib/requerimiento";

const COMPRAS = [
  "Útiles de escritorio",
  "Útiles de aseo y limpieza",
  "Materiales de ferretería",
  "Materiales de construcción",
  "Material eléctrico",
  "Herramientas",
  "Combustible y lubricantes",
  "Repuestos y accesorios",
  "Tinta y tóner para impresora",
  "Alimentos y bebidas",
  "Medicinas y material de primeros auxilios",
  "Uniformes y vestimenta",
  "Equipos de cómputo",
  "Mobiliario de oficina",
];
const SERVICIOS = [
  "Alquiler de local",
  "Alquiler de equipo de sonido",
  "Mantenimiento de vehículo",
  "Mantenimiento de equipos de cómputo",
  "Impresión y fotocopiado",
  "Transporte y movilidad",
  "Refrigerio y atención",
  "Publicidad y difusión",
  "Reparación de local o equipos",
  "Asesoría",
];

/**
 * Sugerencias de un clic para el concepto: según el tipo de gasto elegido llenan el «Se requiere…»
 * y pasan al detalle, donde se escribe lo específico (marca, medida, cantidad, precio).
 */
export default function ChipsConcepto() {
  const marca = useRef<HTMLDivElement>(null);
  const [tipo, setTipo] = useState("compra");

  useEffect(() => {
    const form = marca.current?.closest("form");
    if (!form) return;
    const leer = () => setTipo(form.querySelector<HTMLInputElement>('input[name="tipo"]:checked')?.value ?? "compra");
    leer();
    form.addEventListener("change", leer);
    return () => form.removeEventListener("change", leer);
  }, []);

  function usar(texto: string) {
    const form = marca.current?.closest("form");
    const input = form?.querySelector<HTMLInputElement>('input[name="descripcion"]');
    if (!form || !input) return;
    const frase = tipo === "servicio" ? `el servicio de ${texto.toLocaleLowerCase("es-PE")}` : `la adquisición de ${texto.toLocaleLowerCase("es-PE")}`;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, conceptoSeRequiere(frase));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    // Lo específico se escribe en el detalle
    form.querySelector<HTMLInputElement>('input[name="desc_1"]')?.focus();
  }

  if (tipo !== "compra" && tipo !== "servicio") return <div ref={marca} hidden />;
  const lista = tipo === "servicio" ? SERVICIOS : COMPRAS;
  return (
    <div ref={marca} className="chips-concepto" role="group" aria-label="Sugerencias de concepto">
      <span className="plantillas-et">{tipo === "servicio" ? "Servicios frecuentes" : "Compras frecuentes"}</span>
      <div className="plantillas-lista">
        {lista.map((t) => (
          <button key={t} type="button" className="f-chip" onClick={() => usar(t)}>
            {t}
          </button>
        ))}
      </div>
      <p className="pequeno tenue" style={{ margin: 0 }}>Toque una o escriba la suya. Lo específico (marca, medida, cantidad, precio) va en el paso 4.</p>
    </div>
  );
}
