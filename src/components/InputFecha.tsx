"use client";

import { useEffect, useRef, useState } from "react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const dos = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dos(m + 1)}-${dos(d)}`;
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const valida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const bonita = (v: string) => (valida(v) ? v.split("-").reverse().join("/") : "");

/**
 * Selector de fecha moderno (reemplaza al calendario del navegador). Se usa igual que un campo de fecha:
 * name, defaultValue o value (+ onChange), required, min y max. Envía la fecha como AAAA-MM-DD.
 */
export default function InputFecha({
  name,
  defaultValue,
  value,
  onChange,
  required,
  disabled,
  min,
  max,
  placeholder = "Elegir fecha",
}: {
  name?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (valor: string) => void;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  const [propio, setPropio] = useState(defaultValue && valida(defaultValue) ? defaultValue : "");
  const v = value !== undefined ? value : propio;
  const [abierto, setAbierto] = useState(false);
  const base = valida(v) ? v : hoyLima();
  const [vista, setVista] = useState({ a: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
  const [pos, setPos] = useState<{ x: number; y: number; arriba: boolean }>({ x: 0, y: 0, arriba: false });
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const avisar = useRef(false);

  // Después de elegir, se avisa al formulario como si fuera un campo normal
  useEffect(() => {
    if (avisar.current) {
      avisar.current = false;
      campo.current?.dispatchEvent(new Event("input", { bubbles: true }));
      campo.current?.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [v]);

  // Se puede cambiar desde fuera sin tocar el calendario (evento «zebaz:fecha», con {valor, silencioso})
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    const alRecibir = (e: Event) => {
      const d = (e as CustomEvent<{ valor: string; silencioso?: boolean }>).detail;
      if (!d || !valida(d.valor)) return;
      avisar.current = !d.silencioso;
      setPropio(d.valor);
    };
    el.addEventListener("zebaz:fecha", alRecibir);
    return () => el.removeEventListener("zebaz:fecha", alRecibir);
  }, []);

  // Cerrar al hacer clic fuera o con Esc
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [abierto]);

  function abrir() {
    if (disabled) return;
    const r = boton.current?.getBoundingClientRect();
    if (r) {
      const alto = 330;
      const arriba = r.bottom + alto > window.innerHeight && r.top > alto;
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 300)), y: arriba ? r.top - 6 : r.bottom + 6, arriba });
    }
    const b = valida(v) ? v : hoyLima();
    setVista({ a: Number(b.slice(0, 4)), m: Number(b.slice(5, 7)) - 1 });
    setAbierto(true);
  }

  function elegir(nuevo: string) {
    if ((min && nuevo < min) || (max && nuevo > max)) return;
    avisar.current = true;
    setPropio(nuevo);
    onChange?.(nuevo);
    setAbierto(false);
    boton.current?.focus();
  }

  function mover(delta: number) {
    setVista((s) => {
      const t = s.m + delta;
      return { a: s.a + Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
    });
  }

  // Cuadrícula del mes (semana desde el lunes)
  const primero = new Date(vista.a, vista.m, 1);
  const desfase = (primero.getDay() + 6) % 7;
  const diasMes = new Date(vista.a, vista.m + 1, 0).getDate();
  const celdas: { d: number; m: number; a: number; fuera: boolean }[] = [];
  for (let i = desfase; i > 0; i--) {
    const f = new Date(vista.a, vista.m, 1 - i);
    celdas.push({ d: f.getDate(), m: f.getMonth(), a: f.getFullYear(), fuera: true });
  }
  for (let d = 1; d <= diasMes; d++) celdas.push({ d, m: vista.m, a: vista.a, fuera: false });
  while (celdas.length % 7 !== 0 || celdas.length < 42) {
    const f = new Date(vista.a, vista.m, diasMes + (celdas.length - desfase - diasMes) + 1);
    celdas.push({ d: f.getDate(), m: f.getMonth(), a: f.getFullYear(), fuera: true });
  }
  const hoy = hoyLima();

  return (
    <div className="if-caja" ref={caja}>
      <button type="button" ref={boton} className={`if-boton${v ? "" : " vacio"}`} onClick={() => (abierto ? setAbierto(false) : abrir())} disabled={disabled} aria-haspopup="dialog" aria-expanded={abierto}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
        <span>{bonita(v) || placeholder}</span>
      </button>
      {/* Campo real: es el que viaja con el formulario y el que valida «obligatorio» */}
      <input ref={campo} className="if-real" name={name} value={v} readOnly required={required} tabIndex={-1} aria-hidden="true" onFocus={() => boton.current?.focus()} />
      {abierto && (
        <div className="if-pop" role="dialog" aria-label="Elegir fecha" style={{ left: pos.x, top: pos.y, transform: pos.arriba ? "translateY(-100%)" : undefined }}>
          <div className="if-cab">
            <button type="button" className="if-nav" onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
            <div className="if-titulo">
              <b>{MESES[vista.m]}</b>
              <span>{vista.a}</span>
            </div>
            <button type="button" className="if-nav" onClick={() => mover(1)} aria-label="Mes siguiente">›</button>
          </div>
          <div className="if-sem">
            {DIAS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="if-dias">
            {celdas.map((c, i) => {
              const f = iso(c.a, c.m, c.d);
              const bloqueado = (!!min && f < min) || (!!max && f > max);
              return (
                <button key={i} type="button" disabled={bloqueado} onClick={() => elegir(f)} className={`if-dia${c.fuera ? " fuera" : ""}${f === v ? " sel" : ""}${f === hoy ? " hoy" : ""}`}>
                  {c.d}
                </button>
              );
            })}
          </div>
          <div className="if-pie">
            <button type="button" className="if-link" onClick={() => elegir(hoy)}>Hoy</button>
            {!required && v && (
              <button
                type="button"
                className="if-link quitar"
                onClick={() => {
                  avisar.current = true;
                  setPropio("");
                  onChange?.("");
                  setAbierto(false);
                }}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
