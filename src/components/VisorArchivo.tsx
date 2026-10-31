"use client";

import { useRef, useState } from "react";

/**
 * Botón «Ver» que abre el archivo (PDF o foto) en una ventana emergente, ahí mismo,
 * con las opciones de descargar o imprimir.
 */
export default function VisorArchivo({ url, descarga, nombre, tipo, titulo }: { url: string; descarga: string; nombre: string; tipo: string; titulo: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const marco = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "cargando" | "error">("idle");
  const esPdf = tipo === "application/pdf";

  async function abrir() {
    dialogo.current?.showModal();
    if (src) return;
    setEstado("cargando");
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("no");
      const blob = await r.blob();
      setSrc(URL.createObjectURL(blob));
      setEstado("idle");
    } catch {
      setEstado("error");
    }
  }

  function cerrar() {
    dialogo.current?.close();
  }

  function imprimir() {
    const w = marco.current?.contentWindow;
    if (!w) return;
    try {
      w.focus();
      w.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <>
      <button type="button" className="btn chico contorno" onClick={abrir}>Ver</button>
      <dialog ref={dialogo} className="visor" onClick={(e) => e.target === dialogo.current && cerrar()}>
        <div className="visor-cab">
          <strong>{titulo}</strong>
          <span className="tenue pequeno">{nombre}</span>
        </div>
        <div className="visor-cuerpo">
          {estado === "cargando" && <p className="tenue">Abriendo el archivo…</p>}
          {estado === "error" && (
            <p className="tenue">
              No se pudo mostrar aquí. <a href={url} target="_blank" rel="noreferrer">Ábralo en otra pestaña</a> o use «Descargar».
            </p>
          )}
          {src && esPdf && <iframe ref={marco} src={src} title={nombre} />}
          {src && !esPdf && (
            <iframe ref={marco} title={nombre} srcDoc={`<!doctype html><body style="margin:0;display:grid;place-items:start center;background:#fff"><img src="${src}" style="max-width:100%;height:auto" alt=""></body>`} />
          )}
        </div>
        <div className="visor-pie">
          <button type="button" className="btn contorno" onClick={cerrar}>Cerrar</button>
          <span className="espacio" />
          <a className="btn" href={descarga} download={nombre}>Descargar</a>
          <button type="button" className="btn primario" onClick={imprimir} disabled={!src}>Imprimir</button>
        </div>
      </dialog>
    </>
  );
}
