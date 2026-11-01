"use client";

import { useEffect, useState } from "react";

type Hoja = { id: string; nombre: string; tipo: string; url: string };

/** Muestra las hojas subidas (PDF o foto) para tenerlas a la vista mientras se copia. */
export default function PanelArchivos({ hojas }: { hojas: Hoja[] }) {
  const [activa, setActiva] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [fuentes, setFuentes] = useState<Record<string, string>>({});
  const hoja = hojas[activa];

  useEffect(() => {
    if (!hoja || fuentes[hoja.id]) return;
    let cancelado = false;
    fetch(hoja.url)
      .then((r) => r.blob())
      .then((b) => {
        if (!cancelado) setFuentes((f) => ({ ...f, [hoja.id]: URL.createObjectURL(b) }));
      })
      .catch(() => {
        if (!cancelado) setFuentes((f) => ({ ...f, [hoja.id]: hoja.url }));
      });
    return () => {
      cancelado = true;
    };
  }, [hoja, fuentes]);

  if (!hoja) return <div className="panel-cuerpo tenue">No hay archivos subidos para este mes.</div>;
  const src = fuentes[hoja.id];
  const esPdf = hoja.tipo === "application/pdf";

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
        {!esPdf && (
          <span className="pa-zoom">
            <button type="button" className="btn chico contorno" onClick={() => setZoom((z) => Math.max(60, z - 20))} aria-label="Alejar">−</button>
            <b>{zoom} %</b>
            <button type="button" className="btn chico contorno" onClick={() => setZoom((z) => Math.min(300, z + 20))} aria-label="Acercar">+</button>
          </span>
        )}
      </div>
      <div className="pa-visor">
        {!src && <p className="tenue" style={{ margin: "auto" }}>Abriendo el archivo…</p>}
        {src && esPdf && <iframe src={src} title={hoja.nombre} />}
        {src && !esPdf && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={hoja.nombre} style={{ width: `${zoom}%` }} />
        )}
      </div>
    </div>
  );
}
