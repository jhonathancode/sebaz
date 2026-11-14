import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { fecha } from "@/lib/formato";
import { nombreAdjunto, RECOMENDADOS, TIPOS_ADJUNTO } from "@/lib/adjuntosExpediente";
import { anularAdjunto, subirAdjunto } from "@/app/(app)/expedientes/adjuntos";

export type Adjunto = { id: string; tipo: string; descripcion: string | null; archivo_nombre: string | null; archivo_tipo: string | null; anulado: boolean; anulado_motivo: string | null; creado_en: string; url?: string | null };

const MOTIVOS = ["Se subió el documento equivocado", "La foto no se lee bien", "Se subió dos veces (duplicado)", "Corresponde a otro expediente"];

/** Documentos que acompañan al expediente: lista guía (✔/○), archivos subidos y botón para adjuntar. */
export default function AdjuntosExpediente({
  id,
  tipoGasto,
  adjuntos,
  sistema,
  puede,
}: {
  id: string;
  tipoGasto: string;
  adjuntos: Adjunto[];
  sistema: { requerimiento: boolean; orden: boolean; conformidad: boolean; comprobante: boolean };
  puede: boolean;
}) {
  const vigentes = adjuntos.filter((a) => !a.anulado);
  const anulados = adjuntos.filter((a) => a.anulado);
  const guia = RECOMENDADOS[tipoGasto] ?? [];
  const delSistema: { texto: string; ok: boolean }[] = [
    { texto: "Requerimiento", ok: sistema.requerimiento },
    { texto: tipoGasto === "compra" ? "Orden de compra" : "Orden de servicio", ok: sistema.orden },
    { texto: "Conformidad", ok: sistema.conformidad },
    { texto: "Comprobante de pago", ok: sistema.comprobante },
  ];
  const faltan = guia.filter((g) => !vigentes.some((a) => a.tipo === g)).length;

  return (
    <section id="documentos" className="panel adj-panel no-imprimir">
      <div className="panel-cab" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Documentos del expediente</span>
        <span className={`adj-resumen${faltan ? "" : " completo"}`}>{faltan ? `Faltan ${faltan} por adjuntar` : guia.length ? "Completo" : `${vigentes.length} adjunto(s)`}</span>
        {puede && (
          <span style={{ marginLeft: "auto" }}>
            <VentanaFlotante boton="+ Adjuntar documento" titulo="Adjuntar documento al expediente" accion={subirAdjunto} textoGuardar="Adjuntar" claseBoton="btn primario">
              <input type="hidden" name="id" value={id} />
              <label className="campo">
                ¿Qué documento es?
                <select name="tipo" required defaultValue={guia.find((g) => !vigentes.some((a) => a.tipo === g)) ?? "otro"}>
                  {TIPOS_ADJUNTO.map((t) => (
                    <option key={t.clave} value={t.clave}>{t.texto}</option>
                  ))}
                </select>
              </label>
              <label className="campo">
                Detalle (opcional)
                <input name="descripcion" placeholder="EJ.: CONTRATO DE ENERO A DICIEMBRE 2026" style={{ textTransform: "uppercase" }} />
              </label>
              <CampoArchivoEstado etiqueta="Foto o PDF (puede elegir varios)" multiple ayuda="Foto del celular o PDF escaneado; máximo 4 MB cada uno." />
            </VentanaFlotante>
          </span>
        )}
      </div>
      <div className="panel-cuerpo">
        <div className="adj-lista">
          {delSistema.map((d) => (
            <div key={d.texto} className={`adj-fila ${d.ok ? "ok" : "falta"}`}>
              <span className="adj-marca" aria-hidden="true">{d.ok ? "✔" : "○"}</span>
              <span className="adj-nombre">{d.texto}</span>
              <span className="adj-det tenue">{d.ok ? "Generado en el sistema" : "Aún no generado"}</span>
            </div>
          ))}
          {guia.map((g) => {
            const subidos = vigentes.filter((a) => a.tipo === g);
            return (
              <div key={g} className={`adj-fila ${subidos.length ? "ok" : "falta"}`}>
                <span className="adj-marca" aria-hidden="true">{subidos.length ? "✔" : "○"}</span>
                <span className="adj-nombre">{nombreAdjunto(g)}</span>
                <span className="adj-det">
                  {subidos.length === 0 && <span className="tenue">Falta adjuntar</span>}
                  {subidos.map((a) => (
                    <span key={a.id} className="adj-arch">
                      {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.descripcion ?? a.archivo_nombre ?? "Ver"}</a> : <span>{a.descripcion ?? a.archivo_nombre}</span>}
                      {puede && <Motivo chico accion={anularAdjunto} boton="Anular" titulo="Anular adjunto" ayuda="Motivo (mínimo 10 letras)" campos={{ id, adjunto_id: a.id }} motivos={MOTIVOS} />}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
          {vigentes.filter((a) => !guia.includes(a.tipo as never)).map((a) => (
            <div key={a.id} className="adj-fila ok">
              <span className="adj-marca" aria-hidden="true">✔</span>
              <span className="adj-nombre">{nombreAdjunto(a.tipo)}</span>
              <span className="adj-det">
                <span className="adj-arch">
                  {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.descripcion ?? a.archivo_nombre ?? "Ver"}</a> : <span>{a.descripcion ?? a.archivo_nombre}</span>}
                  {puede && <Motivo chico accion={anularAdjunto} boton="Anular" titulo="Anular adjunto" ayuda="Motivo (mínimo 10 letras)" campos={{ id, adjunto_id: a.id }} motivos={MOTIVOS} />}
                </span>
              </span>
            </div>
          ))}
        </div>
        {anulados.length > 0 && (
          <details className="pequeno" style={{ marginTop: 8 }}>
            <summary className="tenue" style={{ cursor: "pointer" }}>{anulados.length} adjunto(s) anulado(s)</summary>
            {anulados.map((a) => (
              <div key={a.id} className="tenue">{nombreAdjunto(a.tipo)} · {a.descripcion ?? a.archivo_nombre} · {fecha(a.creado_en.slice(0, 10))} · Anulado: {a.anulado_motivo}</div>
            ))}
          </details>
        )}
      </div>
    </section>
  );
}
