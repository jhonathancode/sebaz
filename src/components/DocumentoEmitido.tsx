"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { crearPdf } from "@/lib/pdf";

/**
 * Ventana que aparece apenas se emite un documento (recibo, comprobante…):
 * muestra el documento ya emitido y ofrece imprimirlo, descargarlo en PDF,
 * enviarlo por WhatsApp, emitir otro o cerrar. El documento (children) llega
 * armado desde el servidor.
 */
export default function DocumentoEmitido({
  titulo,
  mensaje,
  archivo,
  textoWhatsapp,
  urlCerrar,
  textoNuevo,
  urlNuevo,
  children,
}: {
  titulo: string;
  mensaje: string;
  /** Nombre del archivo PDF, sin extensión. */
  archivo: string;
  textoWhatsapp: string;
  urlCerrar: string;
  textoNuevo: string;
  urlNuevo: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [celular, setCelular] = useState("");
  const [ocupado, setOcupado] = useState<"" | "pdf" | "wsp">("");
  const [aviso, setAviso] = useState("");
  const [wspAbierto, setWspAbierto] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const nombre = `${archivo.replace(/[^\w\- ]+/g, "").trim() || "documento"}.pdf`;

  async function descargar() {
    setOcupado("pdf");
    try {
      const pdf = await crearPdf(".doc-emitido .hoja");
      pdf?.save(nombre);
    } finally {
      setOcupado("");
    }
  }

  async function whatsapp() {
    const tel = celular.replace(/\D/g, "").replace(/^51(?=\d{9}$)/, "");
    if (tel.length !== 9) {
      setAviso("Escriba el celular de 9 dígitos.");
      return;
    }
    setOcupado("wsp");
    setAviso("");
    try {
      const pdf = await crearPdf(".doc-emitido .hoja");
      pdf?.save(nombre);
      window.open(`https://wa.me/51${tel}?text=${encodeURIComponent(textoWhatsapp)}`, "_blank", "noopener");
      setAviso("Se descargó el PDF y se abrió WhatsApp: adjunte el archivo en la conversación.");
    } finally {
      setOcupado("");
    }
  }

  /** Imprime solo el documento, en una ventana aparte con los mismos estilos. */
  function imprimir() {
    const hoja = ref.current?.querySelector(".hoja");
    if (!hoja) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      setAviso("El navegador bloqueó la ventana de impresión. Permítala e intente de nuevo.");
      return;
    }
    const estilos = Array.from(document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style'))
      .map((n) => (n instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${n.href}">` : n.outerHTML))
      .join("");
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo.replace(/</g, "")}</title>${estilos}<style>html,body{background:#fff!important;color:#000;margin:0;padding:0}.hoja{box-shadow:none!important;margin:0 auto!important;max-width:none!important;border-color:#000!important}@page{size:A4;margin:12mm}</style></head><body><div style="padding:0">${hoja.outerHTML}</div></body></html>`);
    w.document.close();
    w.onload = () => {
      setTimeout(() => {
        w.focus();
        w.print();
        w.onafterprint = () => w.close();
      }, 300);
    };
  }

  function cerrar() {
    ref.current?.close();
    router.replace(urlCerrar);
  }

  return (
    <>
      <dialog ref={ref} className="ventana-flotante ancha vista-previa-dialogo doc-emitido" aria-label={titulo} onCancel={(e) => { e.preventDefault(); cerrar(); }}>
        <div className="vf-marco">
          <div className="vf-cab">
            <h2>{titulo}</h2>
            <button type="button" className="vf-cerrar" aria-label="Cerrar" onClick={cerrar}>×</button>
          </div>
          <div className="vf-cuerpo" style={{ padding: 0 }}>
            <div className="de-exito"><span aria-hidden>✓</span>{mensaje}</div>
            <div className="mesa">{children}</div>
          </div>
          <div className="vf-pie de-pie">
            {wspAbierto && (
              <div className="de-wsp-fila">
                <span className="de-pref">+51</span>
                <input value={celular} onChange={(e) => setCelular(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="Celular del cliente (9 dígitos)" autoFocus aria-label="Celular del cliente" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); whatsapp(); } }} />
                <button type="button" className="btn de-wsp" onClick={whatsapp} disabled={ocupado !== "" || celular.length !== 9}>{ocupado === "wsp" ? "Preparando…" : "Enviar"}</button>
              </div>
            )}
            <div className="de-botones">
              <button type="button" className="btn" onClick={descargar} disabled={ocupado !== ""}>{ocupado === "pdf" ? "Preparando…" : "Descargar PDF"}</button>
              <button type="button" className={`btn de-wsp${wspAbierto ? " activo" : ""}`} onClick={() => setWspAbierto((v) => !v)}>WhatsApp</button>
              <button type="button" className="btn" onClick={imprimir}>Imprimir</button>
              <button type="button" className="btn" onClick={() => { ref.current?.close(); router.replace(urlNuevo); }}>{textoNuevo}</button>
              <button type="button" className="btn primario" onClick={cerrar}>Listo</button>
            </div>
            {aviso && <p className="pequeno tenue de-aviso">{aviso}</p>}
          </div>
        </div>
      </dialog>
    </>
  );
}
