"use client";

import { useEffect, useRef, useState } from "react";
import { conceptoSinSeRequiere } from "@/lib/requerimiento";
import { MESES, soles } from "@/lib/formato";
import { ciclosDe, detalleDeClave, pagoLlevaPlanilla, pasarAlMes, pendienteDe, type PagoFijoCatalogo } from "@/lib/pagosFijos";

const CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

/** Cambia el valor de un campo como si lo escribiera la persona (React y el formulario se enteran). */
function escribir(el: HTMLInputElement | HTMLSelectElement | null, valor: string) {
  if (!el) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5)) - 1].toUpperCase()} ${mes.slice(0, 4)}`;

/**
 * Lista de pagos fijos de la MCP, pensada para muchos (hasta 20 o más): fila compacta con el
 * mes que toca y un botón «Pagar», buscador y filtros. Solo se puede pagar el mes que sigue:
 * si se toca uno más adelante, avisa cuál está pendiente. Los meses se ven al abrir la fila.
 */
export default function SelectorPagoFijo({ pagos, periodo }: { pagos: PagoFijoCatalogo[]; periodo: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [anio, setAnio] = useState(Number(periodo.slice(0, 4)));
  const [elegido, setElegido] = useState<{ id: string; mes: string } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "aldia">("todos");
  const [aviso, setAviso] = useState<{ id: string; texto: string } | null>(null);

  // Al cambiar de tipo de gasto se suelta el pago elegido
  useEffect(() => {
    const soltar = () => {
      setElegido(null);
      setAviso(null);
      window.dispatchEvent(new CustomEvent("sebaz:pago-fijo", { detail: null }));
    };
    window.addEventListener("sebaz:reiniciar", soltar);
    return () => window.removeEventListener("sebaz:reiniciar", soltar);
  }, []);

  function elegir(p: PagoFijoCatalogo, mes: string) {
    setAviso(null);
    setElegido({ id: p.id, mes });
    window.dispatchEvent(new CustomEvent("sebaz:pago-fijo", { detail: { id: p.id, beneficiario: p.beneficiario, beneficiario_doc: p.beneficiario_doc, completo: p.expediente_completo, planilla: pagoLlevaPlanilla(p), concepto: p.concepto, sustentos: p.sustentos } }));
    const form = caja.current?.closest("form");
    if (!form) return;
    // Si este pago ya se registró antes, se usa su redacción guardada, cambiando solo el mes y el año
    const det = detalleDeClave(p, mes);
    const guardada = !det.ciclo && p.descripcion_modelo && p.mes_modelo ? pasarAlMes(p.descripcion_modelo, p.mes_modelo, mes) : null;
    const texto = guardada ?? `${p.concepto} - ${det.etiqueta}`;
    escribir(form.querySelector<HTMLInputElement>('input[name="descripcion"]'), texto);
    if (guardada) window.dispatchEvent(new CustomEvent("sebaz:redaccion-guardada", { detail: { texto } }));
    if (p.fuente_id) form.querySelector<HTMLInputElement>(`input[name="fuente_id"][value="${p.fuente_id}"]`)?.click();
    if (p.clasificador) escribir(form.querySelector<HTMLSelectElement>('select[name="clasificador"]'), p.clasificador);
    window.dispatchEvent(
      new CustomEvent("sebaz:llenar-items", { detail: [{ cantidad: "1", unidad: p.unidad || "MES", descripcion: conceptoSinSeRequiere(texto), precio: String(det.monto) }] }),
    );
  }

  /** Solo se puede pagar el mes que sigue; los demás avisan cuál está pendiente. */
  function tocarMes(p: PagoFijoCatalogo, mes: string, pendiente: string) {
    if (mes === pendiente) return elegir(p, mes);
    setAviso({
      id: p.id,
      texto:
        mes > pendiente
          ? `No se puede pagar ${nombreMes(mes)} todavía: está pendiente el mes de ${nombreMes(pendiente)}. Pague primero ese.`
          : `Ese mes ya no puede pagarse así: está pendiente el mes de ${nombreMes(pendiente)}.`,
    });
  }

  /** Cómo se llama lo que se paga: «Mar 2026» (pago fijo simple) o «18/03 al 17/04» (ciclo de un contrato). */
  function rotulo(p: PagoFijoCatalogo, clave: string) {
    const c = ciclosDe(p).find((x) => x.clave === clave);
    if (c) return `${c.desde.slice(8, 10)}/${c.desde.slice(5, 7)} al ${c.hasta.slice(8, 10)}/${c.hasta.slice(5, 7)}`;
    const [ya, ym] = clave.split("-").map(Number);
    return ym ? `${CORTO[ym - 1]} ${ya}` : clave;
  }

  const info = pagos.map((p) => {
    const pendiente = pendienteDe(p, periodo);
    return { p, pendiente, atrasado: pendiente <= periodo };
  });
  const q = busqueda.trim().toLocaleLowerCase("es-PE");
  const visibles = info.filter(({ p, atrasado }) => {
    if (filtro === "pendientes" && !atrasado) return false;
    if (filtro === "aldia" && atrasado) return false;
    return !q || `${p.concepto} ${p.beneficiario ?? ""}`.toLocaleLowerCase("es-PE").includes(q);
  });
  const nPend = info.filter((x) => x.atrasado).length;

  const sel = pagos.find((p) => p.id === elegido?.id);

  /** Suelta el pago elegido y vacía lo que se había llenado, para volver a ver la lista. */
  function cambiarPago() {
    setElegido(null);
    setAviso(null);
    window.dispatchEvent(new CustomEvent("sebaz:pago-fijo", { detail: null }));
    const form = caja.current?.closest("form");
    escribir(form?.querySelector<HTMLInputElement>('input[name="descripcion"]') ?? null, "");
    window.dispatchEvent(new CustomEvent("sebaz:limpiar-items"));
  }

  // Con un pago elegido se oculta todo lo demás: solo se ve el pago que se hará
  if (sel && elegido) {
    const [ea, em] = elegido.mes.split("-").map(Number);
    return (
      <div className="selector-pf" ref={caja}>
        <input type="hidden" name="pago_fijo_id" value={elegido.id} />
        <input type="hidden" name="mes_pagado" value={elegido.mes} />
        <div className="pfx-elegido">
          <span className="pfx-elegido-et">Pago fijo elegido</span>
          <div className="pfx-elegido-cuerpo">
            <div className="pfx-datos">
              <span className="pfx-elegido-concepto">{sel.concepto}</span>
              {sel.descripcion_modelo && <span className="pfx-guardada">✓ Con la redacción ya aprobada de este pago</span>}
              {sel.beneficiario && <span className="pfx-quien">A: {sel.beneficiario}{sel.beneficiario_doc ? ` · ${sel.beneficiario_doc}` : ""}</span>}
            </div>
            <div className="pfx-elegido-mes">
              <span className="pfx-estado">{ciclosDe(sel).length ? rotulo(sel, elegido.mes) : `${MESES[em - 1].toUpperCase()} ${ea}`}</span>
              <span className="pfx-elegido-monto">S/ {soles(detalleDeClave(sel, elegido.mes).monto)}</span>
            </div>
          </div>
          <button type="button" className="btn chico contorno" onClick={cambiarPago}>Cambiar pago</button>
        </div>
      </div>
    );
  }

  return (
    <div className="selector-pf" ref={caja}>
      <input type="hidden" name="pago_fijo_id" value={elegido?.id ?? ""} />
      <input type="hidden" name="mes_pagado" value={elegido?.mes ?? ""} />
      <div className="pf-cab">
        <div>
          <span className="pf-titulo">¿Qué pago fijo es?</span>
          <span className="pf-guia">Pulse «Pagar» en el mes que sigue. Solo se puede pagar el mes pendiente, en orden.</span>
        </div>
        <label className="pf-anio">
          Año de los meses
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
        <>
          {pagos.length > 5 && (
            <div className="pfx-herr">
              <input type="search" className="pfx-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por pago o por persona…" aria-label="Buscar pago fijo" />
              <div className="pfx-filtros" role="group" aria-label="Filtrar">
                <button type="button" className={`f-chip${filtro === "todos" ? " activo" : ""}`} onClick={() => setFiltro("todos")}>Todos <span className="n">{pagos.length}</span></button>
                <button type="button" className={`f-chip${filtro === "pendientes" ? " activo" : ""}`} onClick={() => setFiltro("pendientes")}>Pendientes <span className="n">{nPend}</span></button>
                <button type="button" className={`f-chip${filtro === "aldia" ? " activo" : ""}`} onClick={() => setFiltro("aldia")}>Al día <span className="n">{pagos.length - nPend}</span></button>
              </div>
            </div>
          )}
          <div className="pfx-lista">
            {visibles.length === 0 && <div className="vacio">Ningún pago fijo con ese filtro.</div>}
            {visibles.map(({ p, pendiente, atrasado }) => {
              const esElegido = elegido?.id === p.id;
              const expandido = abierto === p.id || esElegido;
              const ciclos = ciclosDe(p);
              const pagadosAnio = ciclos.length ? ciclos.filter((c) => p.pagados.includes(c.clave)).length : p.pagados.filter((x) => x.startsWith(`${anio}-`)).length;
              const totalAnio = ciclos.length || 12;
              const terminado = pendiente === "9999-12";
              const [, pm] = pendiente.split("-").map(Number);
              return (
                <div key={p.id} className={`pfx-fila${esElegido ? " elegido" : ""}`}>
                  <div className="pfx-linea">
                    <div className="pfx-datos">
                      <span className="pfx-concepto">{p.concepto}</span>
                      {p.beneficiario && <span className="pfx-quien">{p.beneficiario}</span>}
                    </div>
                    <span className={`pfx-estado ${atrasado ? "pend" : "ok"}`} title={atrasado ? "Falta pagar este mes" : "Está al día; el siguiente es de un mes futuro"}>
                      {terminado ? "Contrato pagado" : `${atrasado ? "Pendiente" : "Al día"} · ${rotulo(p, pendiente)}`}
                    </span>
                    <span className="pfx-monto">S/ {soles(terminado ? p.monto : detalleDeClave(p, pendiente).monto)}</span>
                    <button type="button" className={`btn chico${esElegido ? "" : " primario"}`} disabled={terminado} onClick={() => elegir(p, pendiente)}>
                      {esElegido ? "✓ Elegido" : terminado ? "Sin ciclos" : ciclos.length ? "Pagar ciclo" : `Pagar ${CORTO[pm - 1]}`}
                    </button>
                    <button type="button" className="pfx-abrir" aria-expanded={expandido} aria-label={`Ver los meses de ${p.concepto}`} title="Ver los meses" onClick={() => setAbierto(expandido && !esElegido ? null : p.id)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expandido ? "rotate(180deg)" : undefined }}><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                  </div>
                  {expandido && (
                    <div className="pfx-detalle">
                      <div className="pf-avance">
                        <div className="pf-barra"><div style={{ width: `${(pagadosAnio / totalAnio) * 100}%` }} /></div>
                        <span>{ciclos.length ? `${pagadosAnio} de ${totalAnio} ciclos pagados · contrato ${p.fecha_inicio?.slice(8, 10)}/${p.fecha_inicio?.slice(5, 7)} al ${p.fecha_fin?.slice(8, 10)}/${p.fecha_fin?.slice(5, 7)}/${p.fecha_fin?.slice(0, 4)}` : `${pagadosAnio} de 12 pagados en ${anio}`}</span>
                      </div>
                      <div className="pf-meses" role="group" aria-label={`Meses de ${p.concepto}`}>
                        {(ciclos.length ? ciclos.map((c) => ({ mes: c.clave, c: rotulo(p, c.clave), i: Number(c.clave.slice(5, 7)) - 1 })) : CORTO.map((c, i) => ({ mes: `${anio}-${String(i + 1).padStart(2, "0")}`, c, i }))).map(({ mes, c, i }) => {
                          const pagado = p.pagados.includes(mes);
                          const esPendiente = mes === pendiente;
                          const activo = esElegido && elegido?.mes === mes;
                          return (
                            <button
                              key={mes}
                              type="button"
                              disabled={pagado}
                              title={pagado ? `${MESES[i]}: ya pagado` : esPendiente ? `Pagar ${nombreMes(mes)}` : `Falta pagar antes ${rotulo(p, pendiente)}`}
                              className={`pf-mes${pagado ? " pagado" : ""}${esPendiente ? " pendiente" : ""}${activo ? " activo" : ""}${!pagado && !esPendiente ? " bloqueado" : ""}`}
                              onClick={() => tocarMes(p, mes, pendiente)}
                            >
                              {pagado ? "✓ " : !esPendiente ? "🔒 " : ""}
                              {c}
                            </button>
                          );
                        })}
                      </div>
                      {aviso?.id === p.id && <div className="aviso alerta pfx-aviso" role="alert" style={{ margin: 0 }}>{aviso.texto}</div>}
                      {!terminado && !ciclos.length && !pendiente.startsWith(`${anio}-`) && <div className="pequeno tenue">El mes pendiente es {nombreMes(pendiente)}, de otro año: cambie el año de arriba para verlo.</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {pagos.length > 0 && <p className="pequeno tenue" style={{ margin: "10px 0 0" }}>Al elegir, se llenan solos el «para qué es» y el monto.</p>}
    </div>
  );
}
