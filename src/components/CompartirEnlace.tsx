"use client";

import { useState } from "react";

export default function CompartirEnlace({ url, titulo }: { url: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const enc = encodeURIComponent;
  return (
    <div className="sw-compartir">
      <b>Compartir:</b>
      <a href={`https://wa.me/?text=${enc(`${titulo} ${url}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`} target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            window.prompt("Copie el enlace", url);
          }
        }}
      >
        {copiado ? "✓ Enlace copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}
