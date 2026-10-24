import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import Estado from "@/components/Estado";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, hoyISO, nombrePeriodo, periodoActual, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { abrirCaja, agregarGasto, anularGasto, liquidarCaja } from "./acciones";

const NOMBRE_SUSTENTO = Object.fromEntries(SUSTENTOS.map((s) => [s.codigo, s.nombre]));

export default async function CajaChica({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const periodo = sp.mes ?? periodoActual();
  const fuenteId = sp.fuente ?? ctx.fuentes.find((f) => f.tipo === "distrito")?.id ?? ctx.fuentes[0]?.id;
  const puede = tiene(ctx, "admin", "tesorero");

  const { data: caja } = await supabase
    .from("cajas_chicas")
    .select("*, perfiles(nombre), comprobantes_pago!cajas_chicas_comprobante_id_fkey(id, numero, origen, estado)")
    .eq("mcp_id", ctx.mcp.id)
    .eq("periodo", periodo)
    .eq("fuente_id", fuenteId ?? "")
    .neq("estado", "anulada")
    .maybeSingle();

  const { data: gastos } = caja
    ? await supabase.from("caja_chica_gastos").select("*").eq("caja_id", caja.id).order("fecha").order("creado_en")
    : { data: [] };

  const vigentes = (gastos ?? []).filter((g) => !g.anulado);
  const gastado = vigentes.reduce((s, g) => s + Number(g.monto), 0);
  const fondo = Number(caja?.monto_fondo ?? 0);
  const saldo = fondo - gastado;
  const pct = fondo ? Math.round((gastado / fondo) * 100) : 0;
  const porTipo = new Map<string, { n: number; total: number }>();
  vigentes.forEach((g) => {
    const t = porTipo.get(g.sustento_tipo) ?? { n: 0, total: 0 };
    porTipo.set(g.sustento_tipo, { n: t.n + 1, total: t.total + Number(g.monto) });
  });

  const { data: responsables } = await supabase
    .from("miembros")
    .select("user_id, rol, perfiles(nombre)")
    .eq("mcp_id", ctx.mcp.id)
    .eq("activo", true);

  const abierta = caja?.estado === "abierta";
  const cp = caja?.comprobantes_pago as unknown as { id: string; numero: number; origen: string; estado: string } | null;

  const cuadra = !!caja && Math.round(saldo * 100) === 0;
  const fuenteNombre = ctx.fuentes.find((f) => f.id === fuenteId)?.municipalidad ?? "";
  const formGasto = caja && abierta && puede && (
    <VentanaFlotante boton="+ Registrar gasto" titulo="Registrar un gasto de caja chica" accion={agregarGasto} textoGuardar="Agregar gasto" claseBoton="btn primario grande">
      <input type="hidden" name="caja_id" value={caja.id} />
      <input type="hidden" name="periodo" value={periodo} />
      <input type="hidden" name="fuente_id" value={fuenteId} />
      <div className="rejilla">
        <label className="campo">Fecha<input type="date" name="fecha" required defaultValue={hoyISO().startsWith(periodo) ? hoyISO() : `${periodo}-01`} /></label>
        <label className="campo">
          Sustento
          <select name="sustento_tipo" defaultValue="DJ">
            {SUSTENTOS.map((x) => (
              <option key={x.codigo} value={x.codigo}>{x.nombre}</option>
            ))}
          </select>
        </label>
        <label className="campo">N° del documento (no para DJ)<input name="sustento_numero" placeholder="B001-3516" /></label>
        <label className="campo">Razón social o comisionado<input name="razon_social" required /></label>
        <label className="campo ancho">Concepto<input name="concepto" required placeholder="Salida a Perené: verificación de documentos para la rendición" /></label>
        <label className="campo">Monto S/<input name="monto" required inputMode="decimal" /></label>
      </div>
      <p className="pequeno tenue" style={{ margin: 0 }}>Saldo disponible del fondo: S/ {soles(saldo)}. Con declaración jurada, el formato se imprime desde la lista.</p>
    </VentanaFlotante>
  );

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Caja chica {caja && <Estado valor={caja.estado} />}</h1>
          <div className="sub">Fondo de {nombrePeriodo(periodo)}{fuenteNombre ? ` · pagado con ${fuenteNombre}` : ""}</div>
        </div>
        <form className="selector-mes" method="get">
          <input type="month" name="mes" defaultValue={periodo} aria-label="Mes" />
          {ctx.fuentes.length > 1 && (
            <select name="fuente" defaultValue={fuenteId} aria-label="Fondo pagado con">
              {ctx.fuentes.map((f) => (
                <option key={f.id} value={f.id}>{f.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")}</option>
              ))}
            </select>
          )}
          <button className="btn chico" type="submit">Ver</button>
        </form>
        <span className="espacio" />
        {caja && <a className="btn contorno" href={`/exportar/caja-chica?mes=${periodo}`}>Descargar Excel</a>}
        {caja && <Link className="btn contorno" href={`/caja-chica/${caja.id}/relacion`}>Relación de gastos</Link>}
        {formGasto}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      {!caja &&
        (puede ? (
          <div className="kpi azul" style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <span className="k-et">Caja chica de {nombrePeriodo(periodo)}</span>
              <span className="k-val">Aún no se abre el fondo</span>
              <span className="k-det">Ábralo con el monto que se retiró (normalmente S/ 2,000 de la transferencia) y el responsable.</span>
            </div>
            <VentanaFlotante boton="Abrir fondo del mes" titulo="Abrir el fondo de caja chica" accion={abrirCaja} textoGuardar="Abrir fondo" claseBoton="btn primario grande">
              <input type="hidden" name="periodo" value={periodo} />
              <input type="hidden" name="fuente_id" value={fuenteId} />
              <div className="rejilla-2">
                <label className="campo">Monto del fondo S/<input name="monto_fondo" required inputMode="decimal" placeholder="2000.00" /></label>
                <label className="campo">
                  Responsable del fondo
                  <select name="responsable_id" required>
                    {(responsables ?? []).map((r) => (
                      <option key={r.user_id + r.rol} value={r.user_id}>
                        {(r.perfiles as unknown as { nombre: string } | null)?.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </VentanaFlotante>
          </div>
        ) : (
          <div className="aviso info">No hay fondo de caja chica abierto este mes.</div>
        ))}

      {caja && (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="k-et">Fondo</span>
              <span className="k-val">S/ {soles(fondo)}</span>
              <span className="k-det">Responsable: {(caja.perfiles as { nombre: string } | null)?.nombre}</span>
            </div>
            <div className="kpi">
              <span className="k-et">Gastado</span>
              <span className="k-val">S/ {soles(gastado)}</span>
              <div className="k-barra"><div style={{ width: `${Math.min(pct, 100)}%` }} /></div>
              <span className="k-det">{pct} % del fondo · {vigentes.length} gasto(s)</span>
            </div>
            <div className={`kpi ${cuadra ? "azul" : saldo < 0 ? "rojo" : "alerta"}`}>
              <span className="k-et">{cuadra ? "Cuadra" : saldo < 0 ? "Se pasó del fondo" : "Falta gastar"}</span>
              <span className="k-val">S/ {soles(Math.abs(saldo))}</span>
              <span className="k-det">{cuadra ? (abierta ? "Ya puede cerrar la caja chica" : "Caja liquidada") : saldo < 0 ? "Anule o corrija algún gasto" : "Para cerrar, lo gastado debe ser igual al fondo"}</span>
            </div>
            <div className="kpi">
              <span className="k-et">Por sustento</span>
              <span className="k-det" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {porTipo.size === 0 && "Aún no hay gastos"}
                {[...porTipo].map(([t, v]) => (
                  <span key={t} className="etq" title={NOMBRE_SUSTENTO[t] ?? t}>{t} · {v.n} · S/ {soles(v.total)}</span>
                ))}
              </span>
              {cp && (
                <span className="k-det" style={{ marginTop: 6 }}>
                  Comprobante: <Link href={`/comprobantes/${cp.id}`}>{codigoCP(cp.numero, cp.origen)}</Link> <Estado valor={cp.estado} />
                </span>
              )}
            </div>
          </div>

          <div className="filas">
            {(gastos ?? []).length === 0 && <div className="vacio">Aún no hay gastos. Registre el primero con «+ Registrar gasto».</div>}
            {(gastos ?? []).map((g, i) => (
              <div key={g.id} className={`fila${g.anulado ? " anulada" : ""}`}>
                <div className="f-num">
                  N° {i + 1}
                  <small>{fecha(g.fecha)}</small>
                </div>
                <div className="f-desc">
                  <span className="f-titulo">{g.concepto}</span>
                  <div className="f-meta">
                    <span className="etq">{g.sustento_tipo}{g.sustento_numero ? ` ${g.sustento_numero}` : ""}</span>
                    <span>{g.razon_social}</span>
                    {g.anulado && <span className="no">Anulado: {g.anulado_motivo}</span>}
                  </div>
                </div>
                <div className="f-monto">S/ {soles(g.monto)}</div>
                <div className="f-acc">
                  {g.sustento_tipo === "DJ" && !g.anulado && <Link className="btn chico contorno" href={`/caja-chica/dj/${g.id}`}>Declaración jurada</Link>}
                  {abierta && !g.anulado && puede && (
                    <Motivo accion={anularGasto} boton="Anular" ayuda="Motivo" campos={{ gasto_id: g.id, periodo, fuente_id: fuenteId ?? "" }} />
                  )}
                </div>
              </div>
            ))}
            {(gastos ?? []).length > 0 && (
              <div className="pie-filas">
                <span>Total gastado</span>
                <span>S/ {soles(gastado)}</span>
              </div>
            )}
          </div>

          {abierta && puede && (
            <div className="kpi" style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 240 }}>
                <span className="k-et">Cerrar (liquidar) la caja chica</span>
                <span className="k-det">
                  Se genera un comprobante de pago por lo gastado, con la relación de gastos, y entra en la rendición como una sola línea.
                  {!cuadra && ` Falta ${saldo > 0 ? `registrar S/ ${soles(saldo)}` : `quitar S/ ${soles(-saldo)}`} para poder cerrar.`}
                </span>
              </div>
              <form action={liquidarCaja}>
                <input type="hidden" name="caja_id" value={caja.id} />
                <input type="hidden" name="periodo" value={periodo} />
                <input type="hidden" name="fuente_id" value={fuenteId} />
                <BotonConfirmar
                  className="btn primario grande"
                  disabled={!cuadra}
                  pregunta="¿Está seguro de cerrar la caja chica?"
                  detalle={`Se generará el comprobante de pago por S/ ${soles(gastado)}. Cerrada, ya no admite gastos ni cambios.`}
                  textoConfirmar="Sí, cerrar caja chica"
                >
                  Cerrar caja chica
                </BotonConfirmar>
              </form>
            </div>
          )}
        </>
      )}
    </>
  );
}
