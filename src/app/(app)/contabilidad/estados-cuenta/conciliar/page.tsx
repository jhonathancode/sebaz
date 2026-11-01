import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Motivo from "@/components/Motivo";
import PanelArchivos from "@/components/PanelArchivos";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import ConciliarEstado, { type CabeceraExtracto, type LineaExtracto } from "@/components/ConciliarEstado";
import type { Candidatos, Enlace } from "@/lib/extracto";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, nombrePeriodo, periodoActual } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularEstadoCuenta, subirEstadoCuenta } from "../acciones";
import { guardarTranscripcion, autoguardarTranscripcion } from "./acciones";

const aTexto = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(n));
/** Montos con miles y 2 decimales, como se ven en el estado de cuenta: 2250 → «2,250.00». */
const aMonto = (n: number | string | null | undefined) => (n === null || n === undefined || n === "" ? "" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default async function Conciliar({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : periodoActual();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");

  const anio = mes.slice(0, 4);
  const [{ data: hojas }, { data: ext }, { data: cpsDb }, { data: trDb }, { data: ingDb }, { data: cobDb }] = await Promise.all([
    supabase.from("estados_cuenta").select("*").eq("mcp_id", ctx.mcp.id).eq("periodo", mes).order("creado_en"),
    supabase.from("extractos_transcritos").select("*").eq("mcp_id", ctx.mcp.id).eq("periodo", mes).maybeSingle(),
    supabase.from("comprobantes_pago").select("id, numero, origen, cheque, importe, deducciones, fecha, beneficiario, concepto, estado").eq("mcp_id", ctx.mcp.id).not("cheque", "is", null).neq("estado", "anulado").order("fecha", { ascending: false }).limit(600),
    supabase.from("transferencias_recibidas").select("id, periodo, fecha, monto, documento, fuentes(municipalidad)").eq("mcp_id", ctx.mcp.id).eq("anulado", false).order("fecha", { ascending: false }).limit(60),
    supabase.from("ingresos").select("fecha, monto").eq("mcp_id", ctx.mcp.id).eq("estado", "emitido").gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`),
    supabase.from("cheques_cobrados").select("comprobante_id").eq("mcp_id", ctx.mcp.id).eq("anulado", false),
  ]);
  const cobrados = new Set((cobDb ?? []).map((c) => c.comprobante_id));
  const candidatos: Candidatos = {
    cps: (cpsDb ?? []).map((c) => ({
      id: c.id,
      codigo: codigoCP(c.numero, c.origen),
      cheque: String(c.cheque ?? ""),
      monto: Math.round((Number(c.importe) - Number(c.deducciones ?? 0)) * 100) / 100,
      beneficiario: c.beneficiario ?? "",
      concepto: c.concepto ?? "",
      fecha: c.fecha,
      cobrado: cobrados.has(c.id),
    })),
    transferencias: (trDb ?? []).map((t) => ({ id: t.id, municipalidad: (t.fuentes as unknown as { municipalidad: string } | null)?.municipalidad ?? "Transferencia", periodo: t.periodo, fecha: t.fecha, monto: Number(t.monto), documento: t.documento })),
    ingresos: Array.from({ length: 12 }, (_, i) => {
      const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
      const rec = (ingDb ?? []).filter((r) => r.fecha.startsWith(per));
      return { periodo: per, n: rec.length, total: Math.round(rec.reduce((t, r) => t + Number(r.monto), 0) * 100) / 100 };
    }),
  };
  const vigentes = (hojas ?? []).filter((h) => !h.anulado);
  const firmadas = vigentes.length ? await supabase.storage.from("sustentos").createSignedUrls(vigentes.map((h) => h.archivo_path), 1800) : { data: [] as { path: string | null; signedUrl: string }[] };
  const url = new Map((firmadas.data ?? []).map((u) => [u.path, u.signedUrl]));
  const paraPanel = vigentes.filter((h) => url.get(h.archivo_path)).map((h) => ({ id: h.id, nombre: h.archivo_nombre, tipo: h.archivo_tipo, url: url.get(h.archivo_path)! }));

  const cabInicial: CabeceraExtracto = {
    fecha_corte: aTexto(ext?.fecha_corte),
    fecha_saldo_anterior: aTexto(ext?.fecha_saldo_anterior),
    saldo_anterior: aMonto(ext?.saldo_anterior),
    n_pdf: aTexto(ext?.n_movimientos_pdf),
    cargos_pdf: aMonto(ext?.total_cargos_pdf),
    abonos_pdf: aMonto(ext?.total_abonos_pdf),
    saldo_pdf: aMonto(ext?.saldo_actual_pdf),
  };
  const lineasInicial: LineaExtracto[] = ((ext?.lineas as { codigo: string; cargo: number | null; abono: number | null; saldo: number | null; dia: string | null; enlace?: Enlace | null }[] | null) ?? []).map((l) => ({
    codigo: l.codigo ?? "",
    cargo: aMonto(l.cargo),
    abono: aMonto(l.abono),
    saldo: aMonto(l.saldo),
    dia: l.dia ?? "",
    enlace: l.enlace ?? null,
  }));

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Estado de cuenta · {nombrePeriodo(mes)}</h1>
          <div className="sub">{ctx.mcp.banco_nombre}{ctx.mcp.banco_cuenta ? ` · cuenta ${ctx.mcp.banco_cuenta}` : ""}</div>
        </div>
        <span className="espacio" />
        <Link className="btn contorno" href={`/contabilidad/estados-cuenta?anio=${mes.slice(0, 4)}`}>← Todos los meses</Link>
        {puede && (
          <VentanaFlotante boton="+ Subir otra hoja" titulo={`Subir hojas de ${nombrePeriodo(mes)}`} accion={subirEstadoCuenta} textoGuardar="Guardar" claseBoton="btn contorno">
            <div className="rejilla">
              <input type="hidden" name="periodo" value={mes} />
              <CampoArchivoEstado />
            </div>
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="conc-dos">
        <section className="panel conc-izq">
          <div className="panel-cab">
            Estado de cuenta subido
            <span className="tenue pequeno">{vigentes.length} hoja(s)</span>
          </div>
          {paraPanel.length > 0 ? (
            <PanelArchivos hojas={paraPanel} />
          ) : (
            <div className="panel-cuerpo">
              <span className="tenue">Aún no hay un estado de cuenta subido para {nombrePeriodo(mes)}. Súbalo con «+ Subir otra hoja».</span>
            </div>
          )}
          {vigentes.length > 0 && (
            <div className="conc-hojas">
              {vigentes.map((h, i) => (
                <div key={h.id}>
                  <span>Hoja {i + 1} · {h.archivo_nombre}</span>
                  {puede && <Motivo chico accion={anularEstadoCuenta} boton="Anular" ayuda="Motivo" campos={{ id: h.id, anio: mes.slice(0, 4), mes }} />}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel conc-der">
          <div className="panel-cab">
            Anotar y enlazar
            <span className="tenue pequeno">Anote cada movimiento y enlácelo con su comprobante</span>
          </div>
          <ConciliarEstado periodo={mes} cabInicial={cabInicial} lineasInicial={lineasInicial} candidatos={candidatos} puede={puede} guardar={guardarTranscripcion} autoguardar={autoguardarTranscripcion} info={{ mcp: ctx.mcp.nombre, banco: ctx.mcp.banco_nombre ?? "Banco", cuenta: ctx.mcp.banco_cuenta ?? "", mes: nombrePeriodo(mes) }} />
        </section>
      </div>
    </>
  );
}
