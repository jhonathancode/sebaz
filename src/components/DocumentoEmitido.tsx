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
  urlImprimir,
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
  /** Página del documento que se abre sola en el diálogo de impresión. */
  urlImprimir: string;
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
  const [impresion, setImpresion] = useState(0);

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
    setOcupado("wsp");
    setAviso("");
    try {
      const pdf = await crearPdf(".doc-emitido .hoja");
      if (!pdf) return;
      const blob = pdf.output("blob");
      const archivoPdf = new File([blob], nombre, { type: "application/pdf" });
      // En el celular se comparte el PDF directo; en computadora se descarga y se abre el chat
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [archivoPdf] })) {
        try {
          await navigator.share({ files: [archivoPdf], text: textoWhatsapp });
          return;
        } catch {
          return; // el usuario canceló
        }
      }
      pdf.save(nombre);
      const tel = celular.replace(/\D/g, "");
      const destino = tel.length === 9 ? `51${tel}` : tel.length > 9 ? tel : "";
      window.open(`https://wa.me/${destino}?text=${encodeURIComponent(textoWhatsapp)}`, "_blank", "noopener");
      setAviso("Se descargó el PDF y se abrió WhatsApp: adjunte el archivo en la conversación.");
    } finally {
      setOcupado("");
    }
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
            <label className="de-wsp-cel">
              <span>Celular para WhatsApp (opcional)</span>
              <input value={celular} onChange={(e) => setCelular(e.target.value.replace(/[^\d+ ]/g, ""))} inputMode="tel" placeholder="9 dígitos" maxLength={14} />
            </label>
            <div className="de-botones">
              <button type="button" className="btn" onClick={descargar} disabled={ocupado !== ""}>{ocupado === "pdf" ? "Preparando…" : "Descargar PDF"}</button>
              <button type="button" className="btn de-wsp" onClick={whatsapp} disabled={ocupado !== ""}>{ocupado === "wsp" ? "Preparando…" : "Enviar por WhatsApp"}</button>
              <button type="button" className="btn" onClick={() => setImpresion((n) => n + 1)}>Imprimir</button>
              <button type="button" className="btn" onClick={() => { ref.current?.close(); router.replace(urlNuevo); }}>{textoNuevo}</button>
              <button type="button" className="btn primario" onClick={cerrar}>Listo</button>
            </div>
            {aviso && <p className="pequeno tenue de-aviso">{aviso}</p>}
          </div>
        </div>
      </dialog>
      {impresion > 0 && <iframe key={impresion} title="Impresión" src={urlImprimir} style={{ position: "fixed", width: 0, height: 0, border: 0, opacity: 0 }} />}
    </>
  );
}
