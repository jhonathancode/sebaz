"use client";

import { useEffect, useRef, useState } from "react";
import type { DatosDocumento } from "@/lib/consultaDocumento";

/** Pone un valor en un campo como si lo escribiera la persona (los campos de React se enteran). */
function escribir(el: HTMLInputElement | null, valor: string) {
  if (!el) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

type Estado = { tipo: "nada" } | { tipo: "buscando" } | { tipo: "ok"; datos: DatosDocumento; cache: boolean } | { tipo: "aviso"; texto: string };

/**
 * Al escribir un DNI (8 dígitos) o un RUC (11) en el campo indicado, busca el nombre (y la
 * dirección del RUC) y los llena solos en los campos del mismo formulario. No pisa lo que la
 * persona ya escribió a mano. Si la consulta no está activada o falla, no estorba.
 */
export default function AutoDocumento({ doc, nombre, direccion }: { doc: string; nombre: string; direccion?: string }) {
  const marca = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const llenados = useRef<{ nombre: string; direccion: string }>({ nombre: "", direccion: "" });

  useEffect(() => {
    const form = marca.current?.closest("form");
    const entrada = form?.querySelector<HTMLInputElement>(`input[name="${doc}"]`);
    if (!form || !entrada) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let control: AbortController | undefined;

    const llenar = (campo: "nombre" | "direccion", valor: string | null) => {
      const el = form.querySelector<HTMLInputElement>(`input[name="${campo === "nombre" ? nombre : direccion}"]`);
      if (!el) return;
      // Solo si está vacío o lo llenó antes esta misma función (nunca pisa lo escrito a mano)
      if (el.value.trim() === "" || el.value === llenados.current[campo]) {
        escribir(el, valor ?? "");
        llenados.current[campo] = valor ?? "";
      }
    };

    const buscar = async () => {
      const n = entrada.value.replace(/\D/g, "");
      if (n.length !== 8 && n.length !== 11) {
        setEstado({ tipo: "nada" });
        return;
      }
      control?.abort();
      control = new AbortController();
      setEstado({ tipo: "buscando" });
      try {
        const r = await fetch(`/api/documento?n=${n}`, { signal: control.signal, credentials: "same-origin" });
        const j = await r.json();
        if (entrada.value.replace(/\D/g, "") !== n) return;
        if (j.ok) {
          const datos = j.datos as DatosDocumento;
          llenar("nombre", datos.nombre);
          if (datos.tipo === "ruc") llenar("direccion", datos.direccion);
          setEstado({ tipo: "ok", datos, cache: !!j.cache });
        } else if (j.codigo === "no_configurado" || j.codigo === "sin_sesion") {
          setEstado({ tipo: "nada" });
        } else {
          setEstado({ tipo: "aviso", texto: j.mensaje ?? "No se pudo consultar." });
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setEstado({ tipo: "nada" });
      }
    };

    const alEscribir = () => {
      clearTimeout(espera);
      espera = setTimeout(buscar, 350);
    };
    entrada.addEventListener("input", alEscribir);
    return () => {
      entrada.removeEventListener("input", alEscribir);
      clearTimeout(espera);
      control?.abort();
    };
  }, [doc, nombre, direccion]);

  const d = estado.tipo === "ok" ? estado.datos : null;
  const mal = d?.tipo === "ruc" && ((d.estado && d.estado !== "ACTIVO") || (d.condicion && d.condicion !== "HABIDO"));
  return (
    <div ref={marca} className="auto-doc" style={{ gridColumn: "1 / -1" }} aria-live="polite" hidden={estado.tipo === "nada"}>
      {estado.tipo === "buscando" && <span className="auto-doc-buscando">Buscando…</span>}
      {d && (
        <span className={`auto-doc-ok${mal ? " mal" : ""}`}>
          {mal ? "⚠" : "✓"} {d.nombre}
          {d.tipo === "ruc" && (d.estado || d.condicion) ? ` · ${[d.estado, d.condicion].filter(Boolean).join(" / ")}` : ""}
          {mal ? " — verifique antes de contratar o pagar" : ""}
        </span>
      )}
      {estado.tipo === "aviso" && <span className="auto-doc-aviso">{estado.texto}</span>}
    </div>
  );
}
