"use client";

import { useRef, useState } from "react";
import { reducirFoto } from "@/components/formularios/CampoArchivoEstado";

/** Fila de un documento del pago fijo: se activa con un interruptor y, si es el mismo todos los meses, se sube aquí (queda para todos los meses). */
export default function CasillaDocumento({ clave, texto, marcado, existente, automatico = false }: { clave: string; texto: string; marcado: boolean; automatico?: boolean; existente?: { nombre: string; url?: string | null } | null }) {
  const [activo, setActivo] = useState(marcado);
  const [elegido, setElegido] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function alElegir() {
    const el = entrada.current;
    const f = el?.files?.[0];
    if (!el || !f) return setElegido(null);
    try {
      const listo = await reducirFoto(f);
      const dt = new DataTransfer();
      dt.items.add(listo);
      el.files = dt.files;
      setElegido(`${listo.name} · ${(listo.size / 1024 / 1024).toFixed(1)} MB`);
    } catch {
      setElegido(f.name);
    }
  }

  const estado = automatico ? <span className="pf-doc-estado auto">Automática</span>
    : existente ? <span className="pf-doc-estado ok">✓ Subido</span>
    : <span className="pf-doc-estado">Se pide cada mes</span>;

  return (
    <div className={`pf-doc${activo ? " activa" : ""}`}>
      <div className="pf-doc-fila">
        <label className="pf-interruptor" aria-label={texto}>
          <input type="checkbox" name="documentos" value={clave} checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <span className="pf-pista" aria-hidden="true" />
        </label>
        <div className="pf-doc-texto">
          <b>{texto}</b>
          <span>
            {automatico
              ? "La arma el sistema cada mes con nombre, cargo, DNI y monto de este pago."
              : "Si es el mismo todos los meses, súbalo una vez; si cambia, déjelo vacío y se pedirá en cada expediente."}
          </span>
        </div>
        {activo && estado}
        {activo && !automatico && (
          <div className="pf-doc-acciones">
            {existente?.url && <a className="pf-ver" href={existente.url} target="_blank" rel="noreferrer">Ver</a>}
            <label className="pf-subir">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></svg>
              {existente ? "Reemplazar" : "Subir archivo"}
              <input ref={entrada} type="file" name={`archivo_${clave}`} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} />
            </label>
          </div>
        )}
      </div>
      {activo && !automatico && elegido && <div className="pf-doc-elegido">Listo para guardar: {elegido}</div>}
    </div>
  );
}
