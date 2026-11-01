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

      <section className="ec-resumen" aria-label="Avance del año">
        <div>
          <b>{cuadrados} de {meses.filter((m) => !m.futuro).length} meses listos en {anio}</b>
          <span>Listo = subido, copiado y cuadra con el original. {subidos} subido(s).</span>
        </div>
        <div className="ec-barra" aria-hidden="true"><div style={{ width: `${Math.round((cuadrados / Math.max(1, meses.filter((m) => !m.futuro).length)) * 100)}%` }} /></div>
      </section>

      <div className="ec-rejilla">
        {meses.map((m) => {
          const subido = m.hojas.length > 0;
          const ultima = m.hojas[m.hojas.length - 1];
          const nombre = nombrePeriodo(m.per).split(" ")[0];
          // Un solo estado claro por mes
          const est = !subido
            ? { clase: m.futuro ? "futuro" : "vacio", texto: m.futuro ? "Aún no llega" : "Sin subir", ayuda: m.futuro ? "" : "Suba la foto o el PDF" }
            : m.copia === "cuadra"
              ? { clase: "listo", texto: "✓ Listo", ayuda: "Copiado y cuadra" }
              : m.copia === "no_cuadra"
                ? { clase: "mal", texto: "No cuadra", ayuda: "Revise lo copiado" }
                : m.copia === "copiando"
                  ? { clase: "falta", texto: "Casi listo", ayuda: "Faltan los totales del pie" }
                  : { clase: "falta", texto: "Falta copiarlo", ayuda: "Ya está subido" };
          return (
            <article key={m.per} className={`ec-tarjeta ${est.clase}`}>
              <header>
                <b>{nombre}</b>
                <span className="ec-pastilla">{est.texto}</span>
              </header>
              <p>{est.ayuda}{ultima ? <small> · {fechaHora(ultima.creado_en)}</small> : null}</p>
              <div className="ec-accion">
                {subido ? (
                  <Link className={`btn ${m.copia === "cuadra" ? "contorno" : "primario"}`} href={`/contabilidad/estados-cuenta/conciliar?mes=${m.per}`}>
                    {m.copia === "cuadra" ? "Abrir" : m.copia === "no_cuadra" ? "Revisar" : "Copiar"}
                  </Link>
                ) : (
                  puede &&
                  !m.futuro && (
                    <VentanaFlotante boton="Subir" titulo={`Subir el estado de cuenta de ${nombrePeriodo(m.per)}`} accion={subirEstadoCuenta} textoGuardar="Subir y copiar" claseBoton="btn contorno">
                      <div className="rejilla">
                        <input type="hidden" name="periodo" value={m.per} />
                        <CampoArchivoEstado />
                      </div>
                      <p className="pequeno tenue" style={{ margin: 0 }}>Al subirlo se abre la pantalla de dos caras: el original a la izquierda y la tabla para copiarlo a la derecha.</p>
                    </VentanaFlotante>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
