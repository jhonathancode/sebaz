"use client";

import { useEffect, useRef, useState } from "react";
import { conceptoSeRequiere } from "@/lib/requerimiento";

type Opcion = { nombre: string; icono: string };

/** Iconos de trazo (24×24) para cada categoría. */
const TRAZO: Record<string, string> = {
  lapiz: "M4 20l4-1 11-11-3-3L5 16z",
  gota: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  llave: "M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  ladrillo: "M3 8h18v8H3zM9 8v8M15 8v8",
  rayo: "M13 3L5 14h6l-1 7 8-11h-6z",
  herramienta: "M5 20h14M8 20V9h8v11M10 9V5h4v4",
  surtidor: "M6 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h14M8 8h6",
  engranaje: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3",
  tinta: "M12 3v6M8 9h8l-1 12H9zM10 14h4",
  taza: "M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2",
  cruz: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  camisa: "M8 3l-5 4 3 3 2-1v11h8V9l2 1 3-3-5-4a4 4 0 0 1-8 0z",
  pc: "M4 5h16v10H4zM9 19h6M12 15v4",
  silla: "M7 4h10v7H7zM6 11h12M8 11v9M16 11v9",
  edificio: "M4 21V8l8-5 8 5v13M9 21v-6h6v6",
  parlante: "M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 0 1 0 6",
  auto: "M5 16l1.5-5h11L19 16M5 16v3M19 16v3M7 16h10",
  impresora: "M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  bus: "M5 5h14v11H5zM5 11h14M8 19v-3M16 19v-3",
  megafono: "M3 11v3l9 4V7zM12 7l7-3v14l-7-4",
  documento: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  cuadricula: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
};

const COMPRAS: Opcion[] = [
  { nombre: "Útiles de escritorio", icono: "lapiz" },
  { nombre: "Útiles de aseo y limpieza", icono: "gota" },
  { nombre: "Materiales de ferretería", icono: "llave" },
  { nombre: "Materiales de construcción", icono: "ladrillo" },
  { nombre: "Material eléctrico", icono: "rayo" },
  { nombre: "Combustible y lubricantes", icono: "surtidor" },
  { nombre: "Alimentos y bebidas", icono: "taza" },
  { nombre: "Herramientas", icono: "herramienta" },
  { nombre: "Repuestos y accesorios", icono: "engranaje" },
  { nombre: "Tinta y tóner para impresora", icono: "tinta" },
  { nombre: "Medicinas y primeros auxilios", icono: "cruz" },
  { nombre: "Uniformes y vestimenta", icono: "camisa" },
  { nombre: "Equipos de cómputo", icono: "pc" },
  { nombre: "Mobiliario de oficina", icono: "silla" },
];
const SERVICIOS: Opcion[] = [
  { nombre: "Alquiler de local", icono: "edificio" },
  { nombre: "Alquiler de equipo de sonido", icono: "parlante" },
  { nombre: "Mantenimiento de vehículo", icono: "auto" },
  { nombre: "Mantenimiento de equipos de cómputo", icono: "pc" },
  { nombre: "Impresión y fotocopiado", icono: "impresora" },
  { nombre: "Transporte y movilidad", icono: "bus" },
  { nombre: "Refrigerio y atención", icono: "taza" },
  { nombre: "Publicidad y difusión", icono: "megafono" },
  { nombre: "Reparación de local o equipos", icono: "llave" },
  { nombre: "Asesoría", icono: "documento" },
];
const VISIBLES = 7;

function Icono({ nombre }: { nombre: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZO[nombre]} />
    </svg>
  );
}

/**
 * Los conceptos más frecuentes como tarjetas con icono: al tocar una se llena el «Se requiere…»
 * y el cursor pasa al detalle, donde se escribe lo específico (marca, medida, cantidad, precio).
 */
export default function ChipsConcepto() {
  const marca = useRef<HTMLDivElement>(null);
  const [tipo, setTipo] = useState("compra");
  const [todas, setTodas] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const puesto = useRef("");

  useEffect(() => {
    const form = marca.current?.closest("form");
    if (!form) return;
    const leer = () => setTipo(form.querySelector<HTMLInputElement>('input[name="tipo"]:checked')?.value ?? "compra");
    leer();
    form.addEventListener("change", leer);
    // Si la persona cambia el texto a mano, la tarjeta deja de verse como elegida
    const input = form.querySelector<HTMLInputElement>('input[name="descripcion"]');
    const alEscribir = () => {
      if (input && input.value !== puesto.current) setElegida(null);
    };
    input?.addEventListener("input", alEscribir);
    return () => {
      form.removeEventListener("change", leer);
      input?.removeEventListener("input", alEscribir);
    };
  }, []);

  function usar(texto: string) {
    const form = marca.current?.closest("form");
    const input = form?.querySelector<HTMLInputElement>('input[name="descripcion"]');
    if (!form || !input) return;
    const minus = texto.toLocaleLowerCase("es-PE");
    const frase = tipo === "servicio" ? `el servicio de ${minus}` : `la adquisición de ${minus}`;
    const valor = conceptoSeRequiere(frase);
    puesto.current = valor;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, valor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setElegida(texto);
    // Lo específico se escribe en el detalle
    form.querySelector<HTMLInputElement>('input[name="desc_1"]')?.focus();
  }

  if (tipo !== "compra" && tipo !== "servicio") return <div ref={marca} hidden />;
  const lista = tipo === "servicio" ? SERVICIOS : COMPRAS;
  const mostradas = todas ? lista : lista.slice(0, VISIBLES);
  return (
    <div ref={marca} className="mosaico" role="group" aria-label="Sugerencias de concepto">
      <span className="mosaico-et">Más usados</span>
      <div className="mosaico-rejilla">
        {mostradas.map((o) => {
          const sel = elegida === o.nombre;
          return (
            <button key={o.nombre} type="button" className={`mosaico-tarjeta${sel ? " elegida" : ""}`} aria-pressed={sel} onClick={() => usar(o.nombre)}>
              <span className="mosaico-icono"><Icono nombre={o.icono} /></span>
              <span className="mosaico-texto">{o.nombre}</span>
              {sel && (
                <svg className="mosaico-ok" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          );
        })}
        <button type="button" className="mosaico-mas" onClick={() => setTodas((v) => !v)} aria-expanded={todas}>
          {todas ? "Ver menos ↑" : `Ver todas (${lista.length}) →`}
        </button>
      </div>
    </div>
  );
}
