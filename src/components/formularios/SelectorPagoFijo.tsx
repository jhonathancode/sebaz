"use client";

import { useEffect, useRef, useState } from "react";
import { MESES, soles } from "@/lib/formato";
import { mesPendiente, type PagoFijoCatalogo } from "@/lib/pagosFijos";

const CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

/** Cambia el valor de un campo como si lo escribiera la persona (React y el formulario se enteran). */
function escribir(el: HTMLInputElement | HTMLSelectElement | null, valor: string) {
  if (!el) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Lista de pagos fijos de la MCP con los meses del año: los pagados salen con ✓
 * y no se pueden elegir; se propone el primer mes pendiente.
 */
export default function SelectorPagoFijo({ pagos, periodo }: { pagos: PagoFijoCatalogo[]; periodo: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [anio, setAnio] = useState(Number(periodo.slice(0, 4)));
  const [elegido, setElegido] = useState<{ id: string; mes: string } | null>(null);
  const mesActual = periodo;

  // Al cambiar de tipo de gasto se suelta el pago elegido
  useEffect(() => {
    const soltar = () => setElegido(null);
    window.addEventListener("sebaz:reiniciar", soltar);
    return () => window.removeEventListener("sebaz:reiniciar", soltar);
  }, []);

  function elegir(p: PagoFijoCatalogo, mes: string) {
    setElegido({ id: p.id, mes });
    const form = caja.current?.closest("form");
    if (!form) return;
    const [a, m] = mes.split("-").map(Number);
    const texto = `${p.concepto} - ${MESES[m - 1].toUpperCase()} ${a}`;
    escribir(form.querySelector<HTMLInputElement>('input[name="descripcion"]'), texto);
    if (p.fuente_id) form.querySelector<HTMLInputElement>(`input[name="fuente_id"][value="${p.fuente_id}"]`)?.click();
    if (p.clasificador) escribir(form.querySelector<HTMLSelectElement>('select[name="clasificador"]'), p.clasificador);
    window.dispatchEvent(
      new CustomEvent("sebaz:llenar-items", { detail: [{ cantidad: "1", unidad: p.unidad || "MES", descripcion: texto, precio: String(p.monto) }] }),
    );
  }

  const sel = pagos.find((p) => p.id === elegido?.id);
  const resumen = sel && elegido ? `${sel.concepto} · ${MESES[Number(elegido.mes.slice(5)) - 1].toUpperCase()} ${elegido.mes.slice(0, 4)}` : null;

  return (
    <div className="selector-pf" ref={caja}>
      <input type="hidden" name="pago_fijo_id" value={elegido?.id ?? ""} />
      <input type="hidden" name="mes_pagado" value={elegido?.mes ?? ""} />
      <div className="pf-cab">
        <div>
          <span className="pf-titulo">¿Qué pago fijo es?</span>
          <span className="pf-guia">Toque el mes que va a pagar. Los meses con ✓ ya están pagados.</span>
        </div>
        <label className="pf-anio">
          Año
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[anio - 1, anio, anio + 1].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>

      {pagos.length === 0 ? (
        <div className="aviso info" style={{ margin: 0 }}>
          Aún no hay pagos fijos en la lista de la MCP. Agréguelos en <a href="/configuracion#pagos-fijos">Configuración → Pagos fijos</a> para que salgan aquí. Por ahora,
          escriba el pago abajo.
        </div>
      ) : (
        <div className="pf-lista">
          {pagos.map((p) => {
            const pendiente = mesPendiente(p.pagados, mesActual);
            const esElegido = elegido?.id === p.id;
            const pagadosAnio = p.pagados.filter((x) => x.startsWith(`${anio}-`)).length;
            return (
              <div key={p.id} className={`pf-fila${esElegido ? " elegido" : ""}`}>
                <div className="pf-encab">
                  <div className="pf-datos">
                    <span className="pf-concepto">{p.concepto}</span>
                    {p.beneficiario && <span className="pf-quien">{p.beneficiario}</span>}
                  </div>
                  <div className="pf-monto">
                    S/ {soles(p.monto)}
                    <small>por mes</small>
                  </div>
                </div>
                <div className="pf-avance" aria-label={`${pagadosAnio} de 12 meses pagados en ${anio}`}>
                  <div className="pf-barra"><div style={{ width: `${(pagadosAnio / 12) * 100}%` }} /></div>
                  <span>{pagadosAnio} de 12 pagados en {anio}</span>
                </div>
                <div className="pf-meses" role="group" aria-label={`Meses de ${p.concepto}`}>
                  {CORTO.map((c, i) => {
                    const mes = `${anio}-${String(i + 1).padStart(2, "0")}`;
                    const pagado = p.pagados.includes(mes);
                    const esPendiente = mes === pendiente;
                    const activo = esElegido && elegido?.mes === mes;
                    return (
                      <button
                        key={mes}
                        type="button"
                        disabled={pagado}
                        title={pagado ? `${MESES[i]}: ya pagado` : `Pagar ${MESES[i]} ${anio}`}
                        className={`pf-mes${pagado ? " pagado" : ""}${esPendiente ? " pendiente" : ""}${activo ? " activo" : ""}`}
                        onClick={() => elegir(p, mes)}
                      >
                        {pagado ? "✓ " : ""}
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {resumen ? (
        <div className="pf-resumen">
          <span className="s-et">Se va a pagar</span>
          <b>{resumen}</b>
          <span>S/ {soles(sel!.monto)}</span>
        </div>
      ) : (
        pagos.length > 0 && <p className="pequeno tenue" style={{ margin: "10px 0 0" }}>Con borde azul está el mes que toca. Al elegir, se llenan solos el «para qué es» y el monto.</p>
      )}
    </div>
  );
}
