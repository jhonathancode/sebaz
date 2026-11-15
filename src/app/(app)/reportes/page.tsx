import Link from "next/link";
import { contextoMcp } from "@/lib/contexto";
import { REPORTES } from "@/lib/catalogoReportes";
import { tieneModulo } from "@/lib/modulos";

const ICONO: Record<string, string> = { Gastos: "🧾", "Ingresos propios": "💵", "Caja chica": "👛", Contabilidad: "📒", Almacén: "📦", "Registro Civil": "🗂️", Secretaría: "✉️" };

export default async function Reportes() {
  const ctx = await contextoMcp();
  const habil = (m?: string) => !m || (m === "registro_civil" || m === "secretaria" ? !!ctx.mcp.modulos?.includes(m) : tieneModulo(ctx.mcp, m as "caja_chica"));
  const visibles = REPORTES.filter((r) => habil(r.modulo));
  const grupos = Array.from(new Set(visibles.map((r) => r.grupo)));
  return (
    <>
      <div className="titulo-ventana">
        <h1>Reportes</h1>
      </div>
      <p className="tenue pequeno" style={{ marginTop: 0 }}>Elija un reporte, escoja el período y descárguelo en PDF o Excel.</p>
      <div className="rep-grupos">
        <section className="rep-grupo">
          <h2 className="rep-grupo-tit"><span aria-hidden="true">🔁</span> Cambio de gestión</h2>
          <Link href="/reportes/transferencia-gestion" className="rep-fila">
            <span className="rep-fila-texto">
              <b>Informe de transferencia de gestión</b>
              <small>Cuentas, cheques sin cobrar, requerimientos en trámite, compromisos mensuales, almacén y numeración, listo para firmar.</small>
            </span>
            <span className="rep-formatos"><i>PDF</i></span>
          </Link>
        </section>
        {grupos.map((g) => (
          <section key={g} className="rep-grupo">
            <h2 className="rep-grupo-tit"><span aria-hidden="true">{ICONO[g] ?? "📄"}</span> {g}</h2>
            {visibles.filter((r) => r.grupo === g).map((r) => (
              <Link key={r.clave} href={`/reportes/${r.clave}`} className="rep-fila">
                <span className="rep-fila-texto">
                  <b>{r.titulo}</b>
                  <small>{r.detalle}</small>
                </span>
                <span className="rep-formatos"><i>PDF</i><i>Excel</i></span>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
