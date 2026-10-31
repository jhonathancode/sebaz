"use client";

import { useRef, useState } from "react";

/** Reduce una foto grande (de celular) para que entre en el envío; los PDF no se tocan. */
async function reducirFoto(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/") || archivo.size <= 1.5 * 1024 * 1024) return archivo;
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const blob: Blob | null = await new Promise((r) => lienzo.toBlob(r, "image/jpeg", 0.85));
  if (!blob) return archivo;
  return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function CampoArchivoEstado() {
  const entrada = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function alElegir() {
    const el = entrada.current;
    const f = el?.files?.[0];
    if (!el || !f) return setInfo(null);
    setInfo("Preparando el archivo…");
    try {
      const listo = await reducirFoto(f);
      if (listo !== f) {
        const dt = new DataTransfer();
        dt.items.add(listo);
        el.files = dt.files;
      }
      setInfo(`${listo.name} · ${(listo.size / 1024 / 1024).toFixed(1)} MB${listo !== f ? " (foto reducida para subirla)" : ""}`);
    } catch {
      setInfo(`${f.name} · ${(f.size / 1024 / 1024).toFixed(1)} MB`);
    }
  }

  return (
    <label className="campo ancho">
      Foto o PDF del estado de cuenta
      <input ref={entrada} type="file" name="archivo" required accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} />
      <span className="pequeno tenue">{info ?? "PDF o foto (JPG, PNG, WEBP). Máximo 4 MB; las fotos grandes se reducen solas."}</span>
    </label>
  );
}
