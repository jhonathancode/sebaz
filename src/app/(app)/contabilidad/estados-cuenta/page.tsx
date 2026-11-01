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

      {(() => {
        const vencidos = meses.filter((m) => !m.futuro);
        const listos = vencidos.filter((m) => m.copia === "cuadra").length;
        const pendiente = vencidos.find((m) => m.hojas.length > 0 && m.copia !== "cuadra") ?? vencidos.find((m) => m.hojas.length === 0);
        const nom = (per: string) => nombrePeriodo(per).split(" ")[0];
        const subirBtn = (per: string, clase: string, texto: string) =>
          puede ? (
            <VentanaFlotante boton={texto} titulo={`Subir el estado de cuenta de ${nombrePeriodo(per)}`} accion={subirEstadoCuenta} textoGuardar="Subir y copiar" claseBoton={clase}>
              <div className="rejilla">
                <input type="hidden" name="periodo" value={per} />
                <CampoArchivoEstado />
              </div>
              <p className="pequeno tenue" style={{ margin: 0 }}>Al subirlo se abre la pantalla de dos caras: el original a la izquierda y la tabla para copiarlo a la derecha.</p>
            </VentanaFlotante>
          ) : null;
        return (
          <>
            <section className={`ec-hero${pendiente ? "" : " todo"}`} aria-label="Lo que toca ahora">
              <div className="ec-hero-ic" aria-hidden="true">{pendiente ? (pendiente.hojas.length > 0 ? "✍️" : "📄") : "🎉"}</div>
              <div className="ec-hero-txt">
                <span>{pendiente ? "Le toca ahora" : "¡Todo al día!"}</span>
                <b>
                  {!pendiente
                    ? `Los ${vencidos.length} meses de ${anio} están listos`
                    : pendiente.hojas.length === 0
                      ? `Suba el estado de cuenta de ${nom(pendiente.per)}`
                      : pendiente.copia === "no_cuadra"
                        ? `Revise ${nom(pendiente.per)}: lo copiado no cuadra`
                        : `Copie el estado de cuenta de ${nom(pendiente.per)}`}
                </b>
                <small>
                  {!pendiente
                    ? "Cada mes está subido, copiado y cuadra con el original."
                    : pendiente.hojas.length === 0
                      ? "Tome una foto o suba el PDF que le dio el banco."
                      : pendiente.copia === "no_cuadra"
                        ? "Compare los totales del pie del original con lo que escribió."
                        : "Ya está subido. Falta escribir cada línea y comprobar que cuadra."}
                </small>
              </div>
              {pendiente && (pendiente.hojas.length > 0
                ? <Link className="btn grande ec-hero-btn" href={`/contabilidad/estados-cuenta/conciliar?mes=${pendiente.per}`}>{pendiente.copia === "no_cuadra" ? "Revisar" : "Copiar ahora"} →</Link>
                : subirBtn(pendiente.per, "btn grande ec-hero-btn", "Subir ahora"))}
              <div className="ec-hero-prog">
                <b>{listos}</b><span>de {vencidos.length} listos</span>
                <div className="ec-barra" aria-hidden="true"><div style={{ width: `${Math.round((listos / Math.max(1, vencidos.length)) * 100)}%` }} /></div>
              </div>
            </section>

            <div className="ec-pasos-guia" aria-hidden="true">
              <span><i>1</i> Subir la foto o PDF</span>
              <span><i>2</i> Copiar las líneas</span>
              <span><i>3</i> Comprobar que cuadra</span>
            </div>

            <div className="ec-lista2">
              {meses.map((m) => {
                const subido = m.hojas.length > 0;
                const ultima = m.hojas[m.hojas.length - 1];
                const p1 = subido;
                const p2 = m.copia === "copiando" || m.copia === "cuadra" || m.copia === "no_cuadra";
                const p3 = m.copia === "cuadra";
                const frase = m.futuro
                  ? "Aún no llega este mes"
                  : !subido
                    ? "Todavía no se sube"
                    : m.copia === "cuadra"
                      ? "Copiado y cuadra con el original"
                      : m.copia === "no_cuadra"
                        ? "Copiado, pero no cuadra: revise"
                        : m.copia === "copiando"
                          ? "Copiando: faltan los totales del pie"
                          : "Subido: falta copiarlo";
                return (
                  <div key={m.per} className={`ec-fila ${m.futuro ? "futuro" : p3 ? "listo" : m.copia === "no_cuadra" ? "mal" : subido ? "en-curso" : "vacio"}`}>
                    <div className="ec-sello" aria-hidden="true">{nom(m.per).slice(0, 3)}</div>
                    <div className="ec-fila-txt">
                      <b>{nom(m.per)}</b>
                      <span>{frase}{ultima ? ` · subido ${fechaHora(ultima.creado_en)}` : ""}</span>
                    </div>
                    {!m.futuro && (
                      <ol className="ec-tracker" aria-label="Avance">
                        <li className={p1 ? "ok" : ""}><i>{p1 ? "✓" : "1"}</i><span>Subido</span></li>
                        <li className={p2 ? "ok" : ""}><i>{p2 ? "✓" : "2"}</i><span>Copiado</span></li>
                        <li className={p3 ? "ok" : m.copia === "no_cuadra" ? "mal" : ""}><i>{p3 ? "✓" : m.copia === "no_cuadra" ? "✗" : "3"}</i><span>Cuadra</span></li>
                      </ol>
                    )}
                    <div className="ec-accion">
                      {m.futuro ? null : subido ? (
                        <Link className={`btn ${p3 ? "contorno" : "primario"}`} href={`/contabilidad/estados-cuenta/conciliar?mes=${m.per}`}>
                          {p3 ? "Abrir" : m.copia === "no_cuadra" ? "Revisar" : "Copiar"}
                        </Link>
                      ) : (
                        subirBtn(m.per, "btn contorno", "Subir")
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}
    </>
  );
}
