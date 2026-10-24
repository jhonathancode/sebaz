"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hace, TIPOS_AVISO, type Aviso } from "@/lib/notificaciones";

/** Campana de la cabecera: bandeja con los últimos avisos, cada tipo con su color. */
export default function Bandeja({
  avisos,
  sinLeer,
  abrir,
  marcarTodas,
}: {
  avisos: Aviso[];
  sinLeer: number;
  abrir: (fd: FormData) => Promise<void>;
  marcarTodas: () => Promise<void>;
}) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const ruta = usePathname();

  useEffect(() => setAbierta(false), [ruta]);
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierta]);

  return (
    <div className="bandeja" ref={caja}>
      <button type="button" className="boton-tema bandeja-boton" aria-haspopup="dialog" aria-expanded={abierta} aria-label={sinLeer ? `Mensajes: ${sinLeer} sin leer` : "Mensajes"} title="Mensajes" onClick={() => setAbierta((v) => !v)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {sinLeer > 0 && <span className="bandeja-n">{sinLeer > 9 ? "9+" : sinLeer}</span>}
      </button>
      {abierta && (
        <div className="bandeja-panel" role="dialog" aria-label="Mensajes">
          <div className="bandeja-cab">
            <b>Mensajes</b>
            {sinLeer > 0 && (
              <form action={marcarTodas}>
                <button type="submit" className="enlace-chico">Marcar todo como leído</button>
              </form>
            )}
          </div>
          <div className="bandeja-lista">
            {avisos.length === 0 && <div className="vacio">No tiene mensajes todavía.</div>}
            {avisos.map((a) => (
              <form key={a.id} action={abrir}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className={`aviso-item nt-${a.tipo}${a.leida_en ? "" : " nuevo"}`}>
                  <span className="nt-ico" aria-hidden="true">{TIPOS_AVISO[a.tipo].simbolo}</span>
                  <span className="nt-texto">
                    <span className="nt-titulo">{a.titulo}</span>
                    {a.detalle && <span className="nt-detalle">{a.detalle}</span>}
                    <span className="nt-pie"><span className="nt-etq">{TIPOS_AVISO[a.tipo].nombre}</span> · {hace(a.creado_en)}</span>
                  </span>
                </button>
              </form>
            ))}
          </div>
          <Link className="bandeja-pie" href="/mensajes">Ver todos los mensajes</Link>
        </div>
      )}
    </div>
  );
}
