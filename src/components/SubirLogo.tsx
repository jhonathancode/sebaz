"use client";

import { useRef, useState } from "react";
import { reducirFoto } from "@/components/formularios/CampoArchivoEstado";

/** Zona para elegir el logo: se ve al instante cómo queda, sin el botón genérico del navegador. */
export default function SubirLogo({ actual }: { actual: string | null }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function elegir(f: File | undefined) {
    const el = entrada.current;
    if (!el || !f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setNota("Use una imagen PNG, JPG o WEBP.");
    try {
      const listo = await reducirFoto(f);
      const dt = new DataTransfer();
      dt.items.add(listo);
      el.files = dt.files;
      setVista(URL.createObjectURL(listo));
      setNota(`${listo.name} · ${(listo.size / 1024).toFixed(0)} KB`);
    } catch {
      setNota("No se pudo preparar la imagen. Pruebe con otra.");
    }
  }

  const mostrar = vista ?? actual;
  return (
    <div
      className={`logo-zona${arrastrando ? " arrastrando" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); void elegir(e.dataTransfer.files?.[0]); }}
    >
      <div className="logo-zona-vista">
        {mostrar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mostrar} alt="Logo" />
        ) : (
          <span aria-hidden="true">🏛️</span>
        )}
      </div>
      <div className="logo-zona-texto">
        <b>{vista ? "Así quedará el logo" : actual ? "Logo actual" : "Aún no tiene logo"}</b>
        <span>{nota ?? "Arrastre una imagen aquí o elíjala. PNG, JPG o WEBP."}</span>
      </div>
      <label className="pf-subir">
        {actual || vista ? "Elegir otra imagen" : "Elegir imagen"}
        <input ref={entrada} type="file" name="logo" accept="image/png,image/jpeg,image/webp" required onChange={() => void elegir(entrada.current?.files?.[0])} />
      </label>
    </div>
  );
}
