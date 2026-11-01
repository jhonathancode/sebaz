"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Hoja = { id: string; nombre: string; tipo: string; url: string };

/** Una página lista para dibujar (de un PDF o de una foto), con su tamaño natural. */
type Pagina = {
  ancho: number;
  alto: number;
  dibujar: (lienzo: HTMLCanvasElement, cssAncho: number, giro: number) => Promise<void>;
};

async function cargarPaginas(hoja: Hoja, blob: Blob): Promise<Pagina[]> {
  if (hoja.tipo === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const paginas: Pagina[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const v = p.getViewport({ scale: 1 });
      paginas.push({
        ancho: v.width,
        alto: v.height,
        dibujar: async (lienzo, cssAncho, giro) => {
          const rotacion = (p.rotate + giro) % 360;
          const base = p.getViewport({ scale: 1, rotation: rotacion });
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const escala = (cssAncho / base.width) * dpr;
          const vp = p.getViewport({ scale: escala, rotation: rotacion });
          lienzo.width = Math.floor(vp.width);
          lienzo.height = Math.floor(vp.height);
          lienzo.style.width = `${cssAncho}px`;
          lienzo.style.height = `${(vp.height / vp.width) * cssAncho}px`;
          const ctx = lienzo.getContext("2d")!;
          await p.render({ canvas: lienzo, canvasContext: ctx, viewport: vp }).promise;
        },
      });
    }
    return paginas;
  }
  const bmp = await createImageBitmap(blob);
  return [
    {
      ancho: bmp.width,
      alto: bmp.height,
      dibujar: async (lienzo, cssAncho, giro) => {
        const vuelta = giro % 180 !== 0;
        const w = vuelta ? bmp.height : bmp.width;
        const h = vuelta ? bmp.width : bmp.height;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const px = Math.min(Math.round(cssAncho * dpr), Math.max(w, 1200));
        const factor = px / w;
        lienzo.width = Math.round(w * factor);
        lienzo.height = Math.round(h * factor);
        lienzo.style.width = `${cssAncho}px`;
        lienzo.style.height = `${(h / w) * cssAncho}px`;
        const ctx = lienzo.getContext("2d")!;
        ctx.save();
        ctx.translate(lienzo.width / 2, lienzo.height / 2);
        ctx.rotate((giro * Math.PI) / 180);
        ctx.drawImage(bmp, (-bmp.width * factor) / 2, (-bmp.height * factor) / 2, bmp.width * factor, bmp.height * factor);
        ctx.restore();
      },
    },
  ];
}

/** Muestra las hojas subidas (PDF o foto) completas, con acercar, alejar, ajustar y girar. */
export default function PanelArchivos({ hojas }: { hojas: Hoja[] }) {
  const [activa, setActiva] = useState(0);
  const [modo, setModo] = useState<"ancho" | "pagina">("ancho");
  const [zoom, setZoom] = useState(100);
  const [giro, setGiro] = useState(0);
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);
  const [error, setError] = useState(false);
  const visor = useRef<HTMLDivElement>(null);
  const lienzos = useRef<(HTMLCanvasElement | null)[]>([]);
  const ficha = useRef(0);
  const [tamano, setTamano] = useState({ w: 0, h: 0 });
  const hoja = hojas[activa];

  // Medidas del visor (para ajustar al ancho o a la página completa)
  useEffect(() => {
    const el = visor.current;
    if (!el) return;
    const medir = () => setTamano({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Carga del archivo elegido
  useEffect(() => {
    if (!hoja) return;
    let cancelado = false;
    setPaginas(null);
    setError(false);
    setGiro(0);
    fetch(hoja.url)
      .then((r) => {
        if (!r.ok) throw new Error("no");
        return r.blob();
      })
      .then((b) => cargarPaginas(hoja, b))
      .then((p) => {
        if (!cancelado) setPaginas(p);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
    };
  }, [hoja]);

  const dibujarTodo = useCallback(async () => {
    if (!paginas || tamano.w === 0) return;
    const mio = ++ficha.current;
    const util = Math.max(200, tamano.w - 28);
    for (let i = 0; i < paginas.length; i++) {
      const p = paginas[i];
      const vuelta = giro % 180 !== 0;
      const nat = vuelta ? { w: p.alto, h: p.ancho } : { w: p.ancho, h: p.alto };
      const ancho = modo === "pagina" ? Math.min(util, ((tamano.h - 28) * nat.w) / nat.h) : util;
      const css = Math.max(120, (ancho * zoom) / 100);
      const lienzo = lienzos.current[i];
      if (!lienzo) continue;
      await p.dibujar(lienzo, css, giro);
      if (mio !== ficha.current) return;
    }
  }, [paginas, tamano, modo, zoom, giro]);

  useEffect(() => {
    const t = setTimeout(() => void dibujarTodo(), 60);
    return () => clearTimeout(t);
  }, [dibujarTodo]);

  if (!hoja) return <div className="panel-cuerpo tenue">No hay archivos subidos para este mes.</div>;

  return (
    <div className="pa">
      <div className="pa-barra">
        {hojas.length > 1 && (
          <div className="pa-tabs">
            {hojas.map((h, i) => (
              <button key={h.id} type="button" className={`pa-tab${i === activa ? " activa" : ""}`} onClick={() => setActiva(i)}>Hoja {i + 1}</button>
            ))}
          </div>
        )}
        <span className="pa-nombre">{hoja.nombre}</span>
      </div>
      <div className="pa-herr" role="toolbar" aria-label="Ver el estado de cuenta">
        <button type="button" className="btn chico contorno" onClick={() => setZoom((z) => Math.max(40, z - 20))} aria-label="Alejar">−</button>
        <b className="pa-pct">{zoom} %</b>
        <button type="button" className="btn chico contorno" onClick={() => setZoom((z) => Math.min(400, z + 20))} aria-label="Acercar">+</button>
        <button type="button" className={`btn chico ${modo === "ancho" && zoom === 100 ? "primario" : "contorno"}`} onClick={() => { setModo("ancho"); setZoom(100); }}>Ancho</button>
        <button type="button" className={`btn chico ${modo === "pagina" && zoom === 100 ? "primario" : "contorno"}`} onClick={() => { setModo("pagina"); setZoom(100); }}>Página completa</button>
        <button type="button" className="btn chico contorno" onClick={() => setGiro((g) => (g + 90) % 360)} aria-label="Girar">⟳ Girar</button>
      </div>
      <div className="pa-visor" ref={visor}>
        {!paginas && !error && <p className="tenue" style={{ margin: "auto" }}>Abriendo el archivo…</p>}
        {error && (
          <p className="tenue" style={{ margin: "auto", padding: 20 }}>
            No se pudo mostrar aquí. <a href={hoja.url} target="_blank" rel="noreferrer">Ábralo en otra pestaña</a>.
          </p>
        )}
        {paginas && (
          <div className="pa-paginas">
            {paginas.map((_, i) => (
              <canvas key={`${hoja.id}-${i}`} ref={(el) => { lienzos.current[i] = el; }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
