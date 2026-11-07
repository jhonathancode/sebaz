"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

function canalDe(params: URLSearchParams) {
  const utm = params.get("utm_source");
  if (utm) return utm.toLowerCase().slice(0, 40);
  let ref = "";
  try {
    ref = document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    ref = "";
  }
  if (!ref) return "directo";
  if (ref === location.hostname) return "interno";
  if (/google\./.test(ref)) return "google";
  if (/bing\./.test(ref)) return "bing";
  if (/facebook|fb\.com|fb\.me|l\.messenger/.test(ref)) return "facebook";
  if (/(^|\.)t\.co$|twitter|(^|\.)x\.com$/.test(ref)) return "x";
  if (/linkedin|lnkd\.in/.test(ref)) return "linkedin";
  if (/whatsapp|wa\.me/.test(ref)) return "whatsapp";
  if (/youtube|youtu\.be/.test(ref)) return "youtube";
  if (/tiktok/.test(ref)) return "tiktok";
  return ref.replace(/^www\./, "").slice(0, 40);
}

/** Cuenta una visita por página y por sesión. No cuenta robots (no ejecutan JavaScript) ni a quien activó «sin_conteo». */
export default function RegistrarVisita({ endpoint }: { endpoint: string }) {
  const pathname = usePathname() || "/";
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      // Para no contar sus propias visitas: abra su blog una vez con ?sin_conteo=1 (y con ?sin_conteo=0 vuelve a contar).
      if (params.get("sin_conteo") === "1") localStorage.setItem("sin_conteo", "1");
      if (params.get("sin_conteo") === "0") localStorage.removeItem("sin_conteo");
      if (localStorage.getItem("sin_conteo")) return;
      const ruta = pathname.replace(/^\/sitio(?=\/|$)/, "") || "/";
      const clave = `visita:${ruta}`;
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, "1");
      const m = ruta.match(/^\/blog\/([^/]+)$/);
      const slug = m && m[1] !== "categoria" ? m[1] : "";
      const datos = JSON.stringify({ slug, ruta, canal: canalDe(params), dispositivo: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "movil" : "escritorio" });
      if (!navigator.sendBeacon?.(endpoint, new Blob([datos], { type: "application/json" }))) {
        void fetch(endpoint, { method: "POST", body: datos, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    } catch {
      /* sin almacenamiento o sin red: no se cuenta y ya */
    }
  }, [pathname, endpoint]);
  return null;
}
