"use client";

import { useRef, useState } from "react";
import { reducirFoto } from "@/components/formularios/CampoArchivoEstado";

/** Casilla de un documento del pago fijo: al marcarla se puede subir el archivo en el acto (queda para todos los meses). */
export default function CasillaDocumento({ clave, texto, marcado, existente }: { clave: string; texto: string; marcado: boolean; existente?: { nombre: string; url?: string | null } | null }) {
  const [activo, setActivo] = useState(marcado);
  const [info, setInfo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function alElegir() {
    const el = entrada.current;
    const f = el?.files?.[0];
    if (!el || !f) return setInfo(null);
    try {
      const listo = await reducirFoto(f);
      const dt = new DataTransfer();
      dt.items.add(listo);
      el.files = dt.files;
      setInfo(`${listo.name} · ${(listo.size / 1024 / 1024).toFixed(1)} MB${listo.size > 3 * 1024 * 1024 ? " (pesado: si falla, súbalo solo)" : ""}`);
    } catch {
      setInfo(f.name);
    }
  }

  return (
    <div className={`casilla-doc${activo ? " activa" : ""}`}>
      <label className="casilla-doc-cab">
        <input type="checkbox" name="documentos" value={clave} checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ width: "auto" }} />
        <span>{texto}</span>
        {activo && existente && <span className="casilla-doc-ok">✔ Subido{existente.url ? <> · <a href={existente.url} target="_blank" rel="noreferrer">ver</a></> : null}</span>}
      </label>
      {activo && (
        <div className="casilla-doc-sub">
          <input ref={entrada} type="file" name={`archivo_${clave}`} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} />
          <span className="pequeno tenue">
            {info ?? (existente ? "Para cambiarlo, elija otro archivo." : "Suba aquí el archivo si es el mismo todos los meses (DNI, credencial…): los expedientes saldrán con él ya marcado. Si cambia cada mes (planilla), déjelo vacío y se pide en cada expediente.")}
          </span>
        </div>
      )}
    </div>
  );
}
