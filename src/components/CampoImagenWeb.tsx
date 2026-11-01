"use client";

import { useRef, useState } from "react";
import { subirImagenWeb } from "@/app/(app)/superadmin/web/acciones";

/** Reduce fotos grandes antes de subirlas. */
export async function reducirImagen(archivo: File, ancho = 1800): Promise<File> {
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif" || archivo.size <= 900 * 1024) return archivo;
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, ancho / bmp.width);
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob: Blob | null = await new Promise((r) => lienzo.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : archivo;
  } catch {
    return archivo;
  }
}

export default function CampoImagenWeb({ nombre, titulo, inicial, carpeta = "blog", ayuda }: { nombre: string; titulo: string; inicial?: string | null; carpeta?: "blog" | "ajustes"; ayuda?: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(inicial ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/web/`;

  async function elegir() {
    const f = entrada.current?.files?.[0];
    if (!f) return;
    setSubiendo(true);
    setError(null);
    const listo = await reducirImagen(f);
    const fd = new FormData();
    fd.set("imagen", listo);
    fd.set("carpeta", carpeta);
    const r = await subirImagenWeb(fd);
    setSubiendo(false);
    if (r.error) setError(r.error);
    else if (r.path) setPath(r.path);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="campo imgweb">
      <span>{titulo}</span>
      <input type="hidden" name={nombre} value={path} />
      <div className="imgweb-fila">
        <div className="imgweb-muestra">
          {path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={/^https?:/.test(path) ? path : base + path} alt="" />
          ) : (
            <span className="tenue pequeno">Sin imagen</span>
          )}
        </div>
        <div className="imgweb-acc">
          <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={elegir} aria-label={titulo} />
          {subiendo && <span className="pequeno tenue">Subiendo…</span>}
          {path && !subiendo && <button type="button" className="btn chico contorno" onClick={() => setPath("")}>Quitar</button>}
          {error && <span className="pequeno" style={{ color: "var(--rojo)" }}>{error}</span>}
          {ayuda && <span className="pequeno tenue">{ayuda}</span>}
        </div>
      </div>
    </div>
  );
}
