import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Motivo from "@/components/Motivo";
import PanelArchivos from "@/components/PanelArchivos";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import TranscribirExtracto, { type CabeceraExtracto, type LineaExtracto } from "@/components/TranscribirExtracto";
import { contextoMcp, tiene } from "@/lib/contexto";
import { nombrePeriodo, periodoActual } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularEstadoCuenta, subirEstadoCuenta } from "../acciones";
import { guardarTranscripcion } from "./acciones";

const aTexto = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(n));

export default async function Conciliar({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : periodoActual();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");

  const [{ data: hojas }, { data: ext }] = await Promise.all([
    supabase.from("estados_cuenta").select("*").eq("mcp_id", ctx.mcp.id).eq("periodo", mes).order("creado_en"),
    supabase.from("extractos_transcritos").select("*").eq("mcp_id", ctx.mcp.id).eq("periodo", mes).maybeSingle(),
  ]);
  const vigentes = (hojas ?? []).filter((h) => !h.anulado);
  const firmadas = vigentes.length ? await supabase.storage.from("sustentos").createSignedUrls(vigentes.map((h) => h.archivo_path), 1800) : { data: [] as { path: string | null; signedUrl: string }[] };
  const url = new Map((firmadas.data ?? []).map((u) => [u.path, u.signedUrl]));
  const paraPanel = vigentes.filter((h) => url.get(h.archivo_path)).map((h) => ({ id: h.id, nombre: h.archivo_nombre, tipo: h.archivo_tipo, url: url.get(h.archivo_path)! }));

  const cabInicial: CabeceraExtracto = {
    fecha_corte: aTexto(ext?.fecha_corte),
    fecha_saldo_anterior: aTexto(ext?.fecha_saldo_anterior),
    saldo_anterior: aTexto(ext?.saldo_anterior),
    n_pdf: aTexto(ext?.n_movimientos_pdf),
    cargos_pdf: aTexto(ext?.total_cargos_pdf),
    abonos_pdf: aTexto(ext?.total_abonos_pdf),
    saldo_pdf: aTexto(ext?.saldo_actual_pdf),
  };
  const lineasInicial: LineaExtracto[] = ((ext?.lineas as { codigo: string; cargo: number | null; abono: number | null; saldo: number | null; dia: string | null }[] | null) ?? []).map((l) => ({
    codigo: l.codigo ?? "",
    cargo: aTexto(l.cargo),
    abono: aTexto(l.abono),
    saldo: aTexto(l.saldo),
    dia: l.dia ?? "",
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
            Cópielo aquí, igual que el original
            <span className="tenue pequeno">Las sumas le avisan si cuadra con el PDF</span>
          </div>
          <TranscribirExtracto periodo={mes} cabInicial={cabInicial} lineasInicial={lineasInicial} puede={puede} guardar={guardarTranscripcion} />
        </section>
      </div>
    </>
  );
}
