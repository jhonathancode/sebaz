"use client";

import { useState } from "react";

export type PuntoMes = { x: number; y: number; corto: string; largo: string; total: number; n: number };

const fmt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Curva de ingresos por mes con vida: al apuntar cada mes se ve su monto. */
export default function CurvaIngresos({ puntos, trazo }: { puntos: PuntoMes[]; trazo: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const ult = puntos.length - 1;
  const act = sel ?? ult;
  const p = puntos[act];
  const ancho = puntos.length > 1 ? 460 / (puntos.length - 1) : 460;
  // Globo con el monto: siempre dentro del dibujo
  const txt1 = p ? p.largo : "";
  const txt2 = p ? `S/ ${fmt(p.total)}` : "";
  const txt3 = p ? `${p.n} recibo${p.n === 1 ? "" : "s"}` : "";
  const W = 128;
  const bx = p ? Math.min(Math.max(p.x - W / 2, 4), 520 - W - 4) : 0;
  const by = p ? Math.max(p.y - 62, 2) : 0;

  return (
    <svg className="ini-curva viva" viewBox="0 0 520 150" role="img" aria-label="Ingresos propios por mes. Apunte un mes para ver su monto." onPointerLeave={() => setSel(null)}>
      <defs>
        <linearGradient id="iniRelleno" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primario)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--primario)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[38, 68, 98].map((y) => <line key={y} x1="30" x2="490" y1={y} y2={y} className="ini-rejilla" />)}
      {trazo && puntos.length > 1 && <path d={`${trazo} L ${puntos[ult].x} 118 L ${puntos[0].x} 118 Z`} fill="url(#iniRelleno)" />}
      {trazo && <path d={trazo} className="ini-linea" pathLength={1} />}

      {p && sel !== null && <line x1={p.x} x2={p.x} y1={p.y} y2="118" className="ini-guia" />}
      {puntos.map((q, i) => (
        <circle key={q.corto + i} cx={q.x} cy={q.y} r={i === act ? 6 : 3} className={`ini-punto-mes${i === act ? " act" : ""}${i === ult ? " ult" : ""}`} />
      ))}

      {puntos.map((q, i) => (
        <text key={`e${i}`} x={q.x} y="142" textAnchor="middle" className={`ini-eje${i === act ? " act" : ""}`}>{q.corto}</text>
      ))}

      {p && (
        <g transform={`translate(${bx} ${by})`} pointerEvents="none">
          <g className="ini-globo">
            <rect width={W} height="50" rx="10" />
            <text x={W / 2} y="16" textAnchor="middle" className="g-mes">{txt1}</text>
            <text x={W / 2} y="33" textAnchor="middle" className="g-monto">{txt2}</text>
            <text x={W / 2} y="45" textAnchor="middle" className="g-n">{txt3}</text>
          </g>
        </g>
      )}

      {/* Zonas para apuntar (o tocar) cada mes */}
      {puntos.map((q, i) => (
        <rect key={`z${i}`} x={q.x - ancho / 2} y="0" width={ancho} height="150" fill="transparent" onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i)} style={{ cursor: "pointer" }} />
      ))}
    </svg>
  );
}
