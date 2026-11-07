"use client";

import { useEffect, useState } from "react";
import { mensajeWhatsApp, urlCompartir } from "@/lib/sitio/texto";

type Props = { url: string; titulo: string; resumen?: string | null };

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function medir(metodo: string, url: string) {
  try {
    window.gtag?.("event", "share", { method: metodo, content_type: "article", item_id: url });
  } catch {
    /* sin analítica no pasa nada */
  }
}

const IcoWa = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.43 15.1L2 22l5.05-1.32A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .78.8-2.92-.2-.31a8.2 8.2 0 1 1 6.88 3.77Zm4.5-6.1c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.33-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47c-.16 0-.42.06-.64.3-.22.25-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.1 3.64 1.52.66 2.12.72 2.88.6.46-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28Z" /></svg>
);
const IcoCompartir = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
);
const IcoCopiar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
);

function useCompartir({ url, titulo, resumen }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [nativo, setNativo] = useState(false);
  useEffect(() => setNativo(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const wa = `https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp(titulo, resumen, url))}`;
  async function copiar() {
    medir("copiar", url);
    try {
      await navigator.clipboard.writeText(urlCompartir(url, "enlace"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      window.prompt("Copie el enlace", url);
    }
  }
  async function abrirNativo() {
    medir("nativo", url);
    try {
      await navigator.share({ title: titulo, text: resumen ?? titulo, url: urlCompartir(url, "nativo") });
    } catch {
      /* la persona canceló */
    }
  }
  return { wa, copiado, nativo, copiar, abrirNativo };
}

/** Bloque grande al final del artículo: pide el favor y lo pone fácil. */
export default function CompartirEnlace(props: Props) {
  const { url, titulo } = props;
  const { wa, copiado, nativo, copiar, abrirNativo } = useCompartir(props);
  const enc = encodeURIComponent;
  return (
    <section className="sb-comparte" aria-label="Compartir este artículo">
      <h3>¿Le fue útil? Compártalo</h3>
      <p>Envíelo al grupo de WhatsApp de su centro poblado o a otro alcalde, tesorero o regidor que lo necesite. Así llega a más autoridades.</p>
      <div className="sb-comparte-botones">
        <a className="sb-btn sb-btn-wa" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => medir("whatsapp", url)}><IcoWa /> Enviar por WhatsApp</a>
        {nativo && <button type="button" className="sb-btn" onClick={abrirNativo}><IcoCompartir /> Compartir…</button>}
        <button type="button" className="sb-btn" onClick={copiar}><IcoCopiar /> {copiado ? "¡Enlace copiado!" : "Copiar enlace"}</button>
      </div>
      <div className="sb-comparte-otros">
        <span>También en:</span>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${enc(urlCompartir(url, "facebook"))}`} target="_blank" rel="noopener noreferrer" onClick={() => medir("facebook", url)}>Facebook</a>
        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(urlCompartir(url, "linkedin"))}`} target="_blank" rel="noopener noreferrer" onClick={() => medir("linkedin", url)}>LinkedIn</a>
        <a href={`https://twitter.com/intent/tweet?text=${enc(titulo)}&url=${enc(urlCompartir(url, "x"))}`} target="_blank" rel="noopener noreferrer" onClick={() => medir("x", url)}>X</a>
        <a href={`mailto:?subject=${enc(titulo)}&body=${enc(`${titulo}\n\n${urlCompartir(url, "correo")}`)}`} onClick={() => medir("correo", url)}>Correo</a>
      </div>
    </section>
  );
}

/** Barra fija abajo, solo en celular, que aparece al avanzar en la lectura. */
export function BarraCompartirMovil(props: Props) {
  const { url } = props;
  const { wa, copiado, nativo, copiar, abrirNativo } = useCompartir(props);
  const [ver, setVer] = useState(false);
  useEffect(() => {
    const f = () => {
      const fin = document.querySelector(".sb-comparte");
      const r = fin?.getBoundingClientRect();
      setVer(window.scrollY > 420 && !(r && r.top < window.innerHeight - 40));
    };
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <div className={`sb-barra-compartir${ver ? " visible" : ""}`} role="group" aria-label="Compartir">
      <a className="sb-btn sb-btn-wa" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => medir("whatsapp_barra", url)}><IcoWa /> WhatsApp</a>
      {nativo ? (
        <button type="button" className="sb-btn" onClick={abrirNativo} aria-label="Más opciones para compartir"><IcoCompartir /></button>
      ) : (
        <button type="button" className="sb-btn" onClick={copiar} aria-label="Copiar enlace"><IcoCopiar /> {copiado ? "Copiado" : ""}</button>
      )}
    </div>
  );
}
