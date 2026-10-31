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
    const elegidos = Array.from(el?.files ?? []);
    if (!el || elegidos.length === 0) return setInfo(null);
    setInfo("Preparando los archivos…");
    try {
      const listos = await Promise.all(elegidos.map(reducirFoto));
      const dt = new DataTransfer();
      listos.forEach((f) => dt.items.add(f));
      el.files = dt.files;
      const peso = listos.reduce((t, f) => t + f.size, 0);
      setInfo(`${listos.length} archivo(s) · ${(peso / 1024 / 1024).toFixed(1)} MB en total${peso > 4 * 1024 * 1024 ? ": pesa más de 4 MB, súbalos en dos veces" : ""}`);
    } catch {
      setInfo(`${elegidos.length} archivo(s) elegidos`);
    }
  }

  return (
    <label className="campo ancho">
      Hojas del estado de cuenta (foto o PDF)
      <input ref={entrada} type="file" name="archivo" required multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} />
      <span className="pequeno tenue">{info ?? "Puede elegir varias hojas a la vez. PDF o foto (JPG, PNG, WEBP); máximo 4 MB en total. Las fotos grandes se reducen solas."}</span>
    </label>
  );
}
