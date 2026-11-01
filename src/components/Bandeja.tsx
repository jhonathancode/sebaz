"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hace, TIPOS_AVISO, type Aviso } from "@/lib/notificaciones";
import type { Pendiente } from "@/lib/pendientes";

/** Campana de la cabecera: bandeja con los últimos avisos, cada tipo con su color. */
export default function Bandeja({
  avisos,
  sinLeer,
  pendientes = [],
  abrir,
  marcarLeida,
  dejarPendiente,
  marcarTodas,
}: {
  avisos: Aviso[];
  sinLeer: number;
  pendientes?: Pendiente[];
  abrir: (fd: FormData) => Promise<void>;
  marcarLeida: (fd: FormData) => Promise<void>;
  dejarPendiente: (fd: FormData) => Promise<void>;
  marcarTodas: () => Promise<void>;
}) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const ruta = usePathname();
  // Las rendiciones por armar no son mensajes guardados: lo «leído» se recuerda en este navegador
  const [leidos, setLeidos] = useState<string[]>([]);
  useEffect(() => {
    try {
      setLeidos(JSON.parse(localStorage.getItem("zebaz-pend-leidos") ?? "[]"));
    } catch {
      setLeidos([]);
    }
  }, []);
  const guardarLeidos = (xs: string[]) => {
    setLeidos(xs);
    try {
      localStorage.setItem("zebaz-pend-leidos", JSON.stringify(xs));
    } catch {}
  };
  const total = sinLeer + pendientes.filter((p) => !leidos.includes(p.id)).length;

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
      <button type="button" className="boton-tema bandeja-boton" aria-haspopup="dialog" aria-expanded={abierta} aria-label={total ? `Notificaciones: ${total} por atender` : "Notificaciones"} title="Notificaciones" onClick={() => setAbierta((v) => !v)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {total > 0 && <span className="bandeja-n">{total > 9 ? "9+" : total}</span>}
      </button>
      {abierta && (
        <div className="bandeja-panel" role="dialog" aria-label="Notificaciones">
          <div className="bandeja-cab">
            <b>Notificaciones</b>
            {sinLeer > 0 && (
              <form action={marcarTodas}>
                <button type="submit" className="enlace-chico">Marcar todo como leído</button>
              </form>
            )}
          </div>
          <div className="bandeja-lista">
            {pendientes.map((p) => {
              const leido = leidos.includes(p.id);
              const abierto = true;
              return (
                <div key={p.id} className={`aviso-fila${abierto ? " abierto" : ""}`}>
                  <div className={`aviso-item nt-pend${p.vencido ? " vencido" : ""}${leido ? "" : " nuevo"}`}>
                    <span className="nt-ico" aria-hidden="true">{p.vencido ? "!" : "⏱"}</span>
                    <span className="nt-texto">
                      <span className="nt-titulo">{p.titulo}</span>
                      <span className="nt-detalle">{p.detalle}</span>
                      <span className="nt-pie"><span className="nt-etq">{p.vencido ? "Vencido" : "Por hacer"}</span> · {leido ? "Leído, sigue pendiente" : "Pendiente"}</span>
                    </span>
                  </div>
                  {abierto && (
                    <div className="aviso-acciones">
                      <Link className="btn chico primario" href={p.enlace}>Armar ahora</Link>
                      {leido ? (
                        <button type="button" className="btn chico contorno" onClick={() => { guardarLeidos(leidos.filter((x) => x !== p.id)); }}>Dejar pendiente</button>
                      ) : (
                        <button type="button" className="btn chico contorno" onClick={() => { guardarLeidos([...leidos, p.id]); }}>✓ Marcar como leído</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {avisos.length === 0 && pendientes.length === 0 && <div className="vacio">No tiene notificaciones todavía.</div>}
            {avisos.map((a) => {
              const abierto = true;
              return (
                <div key={a.id} className={`aviso-fila${abierto ? " abierto" : ""}`}>
                  <div className={`aviso-item nt-${a.tipo}${a.leida_en ? "" : " nuevo"}`}>
                    <span className="nt-ico" aria-hidden="true">{TIPOS_AVISO[a.tipo].simbolo}</span>
                    <span className="nt-texto">
                      <span className="nt-titulo">{a.titulo}</span>
                      {a.detalle && <span className="nt-detalle">{a.detalle}</span>}
                      <span className="nt-pie"><span className="nt-etq">{TIPOS_AVISO[a.tipo].nombre}</span> · {hace(a.creado_en)}{a.leida_en ? " · leído" : ""}</span>
                    </span>
                  </div>
                  {abierto && (
                    <div className="aviso-acciones">
                      <form action={abrir}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="btn chico primario">Abrir</button>
                      </form>
                      {a.leida_en ? (
                        <form action={dejarPendiente}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="btn chico contorno">Dejar pendiente</button>
                        </form>
                      ) : (
                        <form action={marcarLeida}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="btn chico contorno">✓ Marcar como leído</button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Link className="bandeja-pie" href="/mensajes">Ver todos los mensajes</Link>
        </div>
      )}
    </div>
  );
}
