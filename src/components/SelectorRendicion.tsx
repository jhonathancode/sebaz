"use client";

import { useMemo, useState } from "react";
import BotonConfirmar from "./BotonConfirmar";

export type FilaCP = {
  id: string;
  codigo: string;
  fecha: string;
  beneficiario: string;
  concepto: string;
  cheque: string | null;
  importe: number;
  disponible: boolean;
  motivo?: string;
  /** Pagado con ingresos propios (sale aparte en el informe). */
  propio?: boolean;
};

const fmt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lista de comprobantes de pago con casillas: al marcar, el total y el saldo
 * se recalculan al instante. Envía los marcados a la acción del servidor.
 */
export default function SelectorRendicion({
  filas,
  transferencia,
  municipalidad,
  accion,
  ocultos,
  puedeGenerar,
}: {
  filas: FilaCP[];
  transferencia: number;
  municipalidad: string;
  accion: (fd: FormData) => Promise<void>;
  ocultos: Record<string, string>;
  puedeGenerar: boolean;
}) {
  const disponibles = filas.filter((f) => f.disponible);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());

  const total = useMemo(() => filas.filter((f) => marcados.has(f.id) && !f.propio).reduce((s, f) => s + f.importe, 0), [filas, marcados]);
  const totalPropios = useMemo(() => filas.filter((f) => marcados.has(f.id) && f.propio).reduce((s, f) => s + f.importe, 0), [filas, marcados]);
  const hayPropios = filas.some((f) => f.propio);
  const saldo = Math.round((transferencia - total) * 100) / 100;
  const cuadra = marcados.size > 0 && saldo === 0;
  const pct = transferencia ? Math.min(100, Math.round((total / transferencia) * 100)) : 0;
  const todos = disponibles.length > 0 && disponibles.every((f) => marcados.has(f.id));

  function alternar(id: string) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  const [ver, setVer] = useState<"todos" | "listos" | "pendientes">("todos");
  const visibles = filas.filter((f) => (ver === "listos" ? f.disponible : ver === "pendientes" ? !f.disponible : true));
  const pendientes = filas.filter((f) => !f.disponible);
  const ancho = transferencia ? Math.min(100, (total / transferencia) * 100) : 0;

  return (
    <form action={accion} className="rend-grid">
      {Object.entries(ocultos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="cp" value={id} />
      ))}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div className="filtros">
          <div className="grupo" role="group" aria-label="Mostrar">
            <button type="button" className={`f-chip${ver === "todos" ? " activo" : ""}`} onClick={() => setVer("todos")}>Todos <span className="n">{filas.length}</span></button>
            <button type="button" className={`f-chip${ver === "listos" ? " activo" : ""}`} onClick={() => setVer("listos")}>Listos <span className="n">{disponibles.length}</span></button>
            <button type="button" className={`f-chip${ver === "pendientes" ? " activo rojo" : ""}`} onClick={() => setVer("pendientes")}>Por completar <span className="n">{pendientes.length}</span></button>
          </div>
          <span style={{ flex: 1 }} />
          {disponibles.length > 0 && (
            <button type="button" className="btn chico contorno" onClick={() => setMarcados(todos ? new Set() : new Set(disponibles.map((f) => f.id)))}>
              {todos ? "Desmarcar todos" : "Marcar todos los listos"}
            </button>
          )}
        </div>

        <div className="filas">
          {visibles.length === 0 && (
            <div className="vacio">{filas.length === 0 ? "No hay comprobantes de pago de esta municipalidad pendientes de rendir." : "Nada en este filtro."}</div>
          )}
          {visibles.map((f) => {
            const m = marcados.has(f.id);
            return (
              <label key={f.id} className={`cp-sel${m ? " marcado" : ""}${!f.disponible ? " bloqueado" : ""}`}>
                <input type="checkbox" checked={m} disabled={!f.disponible} onChange={() => alternar(f.id)} aria-label={`Marcar ${f.codigo}`} />
                <div className="f-num" style={{ fontWeight: 700 }}>
                  {f.codigo}
                  <small style={{ display: "block", fontWeight: 400, color: "var(--tenue)", fontSize: 12 }}>{f.fecha}</small>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.beneficiario}</div>
                  <div className="f-meta" style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12.5, color: "var(--tenue)", marginTop: 3 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{f.concepto}</span>
                    {f.cheque && <span className="etq">Cheque {f.cheque}</span>}
                    {f.propio && <span className="etq azul">Ingresos propios</span>}
                  </div>
                </div>
                <div className="c-monto">S/ {fmt(f.importe)}</div>
                <div className="c-estado">
                  {f.disponible ? <span className="estado aprobado">Listo</span> : <span className="estado anulado">{f.motivo}</span>}
                </div>
              </label>
            );
          })}
        </div>
        {pendientes.length > 0 && (
          <p className="pequeno tenue" style={{ margin: 0 }}>
            Los que dicen «Falta aprobar» o «Falta el cheque» no se pueden marcar: complételos en su comprobante de pago.
          </p>
        )}
      </div>

      <aside className="rend-cuadro" aria-live="polite">
        <span className="r-et">{cuadra ? "¡Cuadra!" : saldo < 0 ? "Se pasa de lo transferido" : "Falta para cuadrar"}</span>
        <span className={`r-saldo ${cuadra ? "ok" : saldo < 0 ? "mal" : ""}`}>S/ {fmt(Math.abs(saldo))}</span>
        <div className="r-barra"><div className={saldo < 0 ? "pasa" : undefined} style={{ width: `${ancho}%` }} /></div>
        <dl>
          <dt>Transferencia</dt><dd>{fmt(transferencia)}</dd>
          <dt>Marcado ({[...marcados].filter((id) => !filas.find((x) => x.id === id)?.propio).length})</dt><dd>{fmt(total)}</dd>
          {hayPropios && (<><dt>Ingresos propios <span className="tenue pequeno">(aparte)</span></dt><dd>{fmt(totalPropios)}</dd></>)}
          <dt>Avance</dt><dd>{pct} %</dd>
        </dl>
        {cuadra ? (
          <div className="aviso ok" style={{ margin: 0 }}>Lo marcado es igual a lo transferido de {municipalidad}. Ya puede generar la rendición.</div>
        ) : saldo < 0 ? (
          <div className="aviso error" style={{ margin: 0 }}>Desmarque comprobantes por S/ {fmt(-saldo)}.</div>
        ) : (
          <div className="aviso info" style={{ margin: 0 }}>La rendición se arma cuando lo marcado llega exacto a lo transferido.</div>
        )}
        {puedeGenerar && (
          <BotonConfirmar
            pin
            className="btn primario grande"
            disabled={!cuadra}
            pregunta="¿Generar la rendición?"
            detalle={`Se rendirán ${marcados.size} comprobante(s) por S/ ${fmt(total + totalPropios)}. Después quedan bloqueados; para corregir habría que anular la rendición.`}
            textoConfirmar="Sí, generar rendición"
          >
            Generar rendición
          </BotonConfirmar>
        )}
        <span className="pequeno tenue">Al generar, los comprobantes quedan como rendidos. Para corregir se anula la rendición con motivo.</span>
      </aside>
    </form>
  );
}
