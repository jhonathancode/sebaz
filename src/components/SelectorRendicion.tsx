"use client";

import { useMemo, useState } from "react";

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
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(disponibles.map((f) => f.id)));

  const total = useMemo(() => filas.filter((f) => marcados.has(f.id)).reduce((s, f) => s + f.importe, 0), [filas, marcados]);
  const saldo = transferencia - total;
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

  return (
    <form action={accion} className="columnas">
      {Object.entries(ocultos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="cp" value={id} />
      ))}
      <div className="principal">
        <div className="panel">
          <div className="panel-cab">Marque los comprobantes de pago que entran en esta rendición</div>
          <div className="tabla-marco" style={{ border: "none" }}>
            <table className="tabla" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Marcar todos"
                      checked={todos}
                      onChange={() => setMarcados(todos ? new Set() : new Set(disponibles.map((f) => f.id)))}
                    />
                  </th>
                  <th>N° CP</th><th>Fecha</th><th>N° cheque</th><th>Beneficiario</th><th>Concepto</th><th className="num">Importe S/</th><th>Situación</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr><td colSpan={8} className="tenue">No hay comprobantes de pago de esta municipalidad pendientes de rendir.</td></tr>
                )}
                {filas.map((f) => (
                  <tr key={f.id} className={marcados.has(f.id) ? "marcado" : !f.disponible ? "anulado" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Marcar ${f.codigo}`}
                        checked={marcados.has(f.id)}
                        disabled={!f.disponible}
                        onChange={() => alternar(f.id)}
                      />
                    </td>
                    <td style={{ fontWeight: 500 }}>{f.codigo}</td>
                    <td>{f.fecha}</td>
                    <td>{f.cheque ?? "—"}</td>
                    <td>{f.beneficiario}</td>
                    <td className="envolver">{f.concepto}</td>
                    <td className="num">{fmt(f.importe)}</td>
                    <td>{f.disponible ? <span className="si">Listo</span> : <span className="no">{f.motivo}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <aside className="lateral">
        <section className="panel">
          <div className="panel-cab">Cuadro de la rendición</div>
          <table className="tabla">
            <tbody>
              <tr><td>Transferencia de {municipalidad}</td><td className="num">{fmt(transferencia)}</td></tr>
              <tr><td>Comprobantes marcados ({marcados.size})</td><td className="num">{fmt(total)}</td></tr>
              <tr style={{ fontWeight: 600, background: saldo < 0 ? "var(--rojo-fondo)" : saldo === 0 ? "var(--verde-fondo)" : "var(--ambar-fondo)" }}>
                <td>Saldo por rendir</td>
                <td className="num">{fmt(saldo)}</td>
              </tr>
            </tbody>
          </table>
          <div className="panel-cuerpo">
            <div style={{ display: "flex", justifyContent: "space-between" }} className="pequeno tenue">
              <span>Rendido</span>
              <span>{pct} %</span>
            </div>
            <div style={{ height: 12, background: "var(--linea)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--verde)" }} />
            </div>
            {saldo < 0 && <div className="aviso error">Lo marcado pasa lo transferido en S/ {fmt(-saldo)}.</div>}
            {puedeGenerar && (
              <button className="btn primario" type="submit" disabled={marcados.size === 0 || saldo < 0} style={{ justifyContent: "center" }}>
                Generar rendición
              </button>
            )}
            <span className="pequeno tenue">
              Al generar, los comprobantes quedan como rendidos y no pueden usarse en otra rendición. Para corregir se anula la rendición con motivo.
            </span>
          </div>
        </section>
      </aside>
    </form>
  );
}
