"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Res = { grupo: string; titulo: string; detalle: string; href: string };

/** Búsqueda global: botón en la cabecera o Ctrl+K. Encuentra expedientes, comprobantes, recibos, proveedores y pagos fijos. */
export default function BuscadorGlobal() {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Res[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto(true);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    if (abierto && ref.current && !ref.current.open) {
      ref.current.showModal();
      setTimeout(() => entrada.current?.focus(), 30);
    }
  }, [abierto]);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setRes([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/buscar?q=${encodeURIComponent(texto)}`, { signal: ctl.signal });
        const j = (await r.json()) as { resultados: Res[] };
        setRes(j.resultados ?? []);
        setSel(0);
      } catch {
        /* cancelado */
      } finally {
        setCargando(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  function ir(r: Res) {
    ref.current?.close();
    router.push(r.href);
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(res.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter" && res[sel]) {
      e.preventDefault();
      ir(res[sel]);
    }
  }

  const grupos = res.reduce<Record<string, { r: Res; i: number }[]>>((acc, r, i) => {
    (acc[r.grupo] ??= []).push({ r, i });
    return acc;
  }, {});

  return (
    <>
      <button type="button" className="bg-boton no-imprimir" onClick={() => setAbierto(true)} aria-label="Buscar en el sistema (Ctrl+K)" title="Buscar (Ctrl+K)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="bg-texto">Buscar</span>
        <kbd>Ctrl K</kbd>
      </button>
      <dialog
        ref={ref}
        className="bg-dialogo"
        aria-label="Búsqueda global"
        onClose={() => {
          setAbierto(false);
          setQ("");
          setRes([]);
        }}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="bg-marco">
          <div className="bg-caja">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={entrada} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclas} placeholder="Buscar expediente, cheque, recibo, proveedor, DNI o número…" aria-label="Buscar" />
            <kbd>Esc</kbd>
          </div>
          <div className="bg-lista">
            {q.trim().length < 2 && <div className="bg-vacio">Escriba al menos 2 letras o un número. Se busca en expedientes, comprobantes, recibos de ingreso, proveedores y pagos fijos.</div>}
            {q.trim().length >= 2 && !cargando && res.length === 0 && <div className="bg-vacio">Sin resultados para «{q.trim()}».</div>}
            {Object.entries(grupos).map(([g, items]) => (
              <div key={g} className="bg-grupo">
                <div className="bg-grupo-et">{g}</div>
                {items.map(({ r, i }) => (
                  <button key={i} type="button" className={`bg-item${i === sel ? " sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => ir(r)}>
                    <span className="bg-titulo">{r.titulo}</span>
                    {r.detalle && <span className="bg-detalle">{r.detalle}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
