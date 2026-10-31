import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, nombrePeriodo, periodoActual } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { subirEstadoCuenta } from "./acciones";

type Linea = { cargo: number | null; abono: number | null };
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Compara lo copiado con los totales y el saldo impresos en el PDF. */
function estadoCopia(e: { saldo_anterior: number | null; total_cargos_pdf: number | null; total_abonos_pdf: number | null; saldo_actual_pdf: number | null; lineas: unknown } | undefined) {
  const lineas = ((e?.lineas as Linea[] | null) ?? []).filter((l) => l.cargo !== null || l.abono !== null);
  if (!e || lineas.length === 0) return "sin_copiar" as const;
  const c = lineas.reduce((t, l) => t + Number(l.cargo ?? 0), 0);
  const a = lineas.reduce((t, l) => t + Number(l.abono ?? 0), 0);
  const faltan = e.total_cargos_pdf === null || e.total_abonos_pdf === null || e.saldo_actual_pdf === null || e.saldo_anterior === null;
  if (faltan) return "copiando" as const;
  const cuadra = igual(c, Number(e.total_cargos_pdf)) && igual(a, Number(e.total_abonos_pdf)) && igual(Number(e.saldo_anterior) - c + a, Number(e.saldo_actual_pdf));
  return cuadra ? ("cuadra" as const) : ("no_cuadra" as const);
}

export default async function EstadosCuenta({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? sp.anio! : periodoActual().slice(0, 4);
  const hoy = periodoActual();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");

  const [{ data, error }, { data: extractos }] = await Promise.all([
    supabase.from("estados_cuenta").select("periodo, anulado, creado_en").eq("mcp_id", ctx.mcp.id).gte("periodo", `${anio}-01`).lte("periodo", `${anio}-12`).order("creado_en"),
    supabase.from("extractos_transcritos").select("periodo, saldo_anterior, total_cargos_pdf, total_abonos_pdf, saldo_actual_pdf, lineas").eq("mcp_id", ctx.mcp.id).gte("periodo", `${anio}-01`).lte("periodo", `${anio}-12`),
  ]);

  const meses = Array.from({ length: 12 }, (_, i) => {
    const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
    const hojas = (data ?? []).filter((h) => h.periodo === per && !h.anulado);
    const copia = hojas.length ? estadoCopia((extractos ?? []).find((e) => e.periodo === per)) : null;
    return { per, hojas, copia, futuro: per > hoy };
  });
  const subidos = meses.filter((m) => m.hojas.length > 0).length;
  const cuadrados = meses.filter((m) => m.copia === "cuadra").length;

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Estados de cuenta corriente</h1>
          <div className="sub">{ctx.mcp.banco_nombre}{ctx.mcp.banco_cuenta ? ` · cuenta ${ctx.mcp.banco_cuenta}` : ""}</div>
        </div>
        <span className="espacio" />
        <div className="cc-anio">
          <Link className="cc-flecha" href={`/contabilidad/estados-cuenta?anio=${Number(anio) - 1}`} aria-label={`Año ${Number(anio) - 1}`}>‹</Link>
          <b>{anio}</b>
          <Link className="cc-flecha" href={`/contabilidad/estados-cuenta?anio=${Number(anio) + 1}`} aria-label={`Año ${Number(anio) + 1}`}>›</Link>
        </div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {error && <div className="aviso error">Los estados de cuenta aún no están activos: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql). Avise a soporte.</div>}

      <p className="pequeno tenue" style={{ margin: "0 0 10px" }}>
        Suba el estado de cuenta del mes, cópielo en la pantalla de dos caras y compruebe que cuadra. {subidos} mes(es) subido(s) · {cuadrados} cuadrado(s) en {anio}.
      </p>

      <div className="ec-lista">
        {meses.map((m) => {
          const subido = m.hojas.length > 0;
          const ultima = m.hojas[m.hojas.length - 1];
          return (
            <div key={m.per} className={`ec-mes${subido ? " subido" : ""}${m.futuro ? " futuro" : ""}`}>
              <div className="ec-nombre">
                <b>{nombrePeriodo(m.per).split(" ")[0]}</b>
                {ultima && <small>subido {fechaHora(ultima.creado_en)}</small>}
              </div>
              <div className="ec-estado">
                {!subido && <span className="cc-pendiente">{m.futuro ? "—" : "Sin subir"}</span>}
                {subido && <span className="cc-subido">✓ Subido · {m.hojas.length} hoja(s)</span>}
                {m.copia === "sin_copiar" && <span className="ec-copia">Falta copiarlo</span>}
                {m.copia === "copiando" && <span className="ec-copia">Copiando · faltan los totales</span>}
                {m.copia === "cuadra" && <span className="ec-copia ok">✓ Copiado y cuadra</span>}
                {m.copia === "no_cuadra" && <span className="ec-copia mal">Copiado · no cuadra, revise</span>}
              </div>
              <div className="ec-accion">
                {subido ? (
                  <Link className="btn primario" href={`/contabilidad/estados-cuenta/conciliar?mes=${m.per}`}>{m.copia === "cuadra" ? "Abrir" : "Copiar / revisar"}</Link>
                ) : (
                  puede &&
                  !m.futuro && (
                    <VentanaFlotante boton="Subir estado de cuenta" titulo={`Subir el estado de cuenta de ${nombrePeriodo(m.per)}`} accion={subirEstadoCuenta} textoGuardar="Subir y copiar" claseBoton="btn contorno">
                      <div className="rejilla">
                        <input type="hidden" name="periodo" value={m.per} />
                        <CampoArchivoEstado />
                      </div>
                      <p className="pequeno tenue" style={{ margin: 0 }}>Al subirlo se abre la pantalla de dos caras: el original a la izquierda y la tabla para copiarlo a la derecha.</p>
                    </VentanaFlotante>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
