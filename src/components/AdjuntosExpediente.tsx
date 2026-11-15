import Link from "next/link";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { TIPOS_ADJUNTABLES } from "@/lib/adjuntosExpediente";
import type { AnexoVista } from "@/lib/adjuntosVista";
import { subirAdjunto } from "@/app/(app)/expedientes/adjuntos";

/** Fila compacta de documentos que acompañan al expediente (centrada) y botón para adjuntar. */
export type PasoChip = { id: string; nombre: string; hecho: boolean; anulado: boolean; actual: boolean; visto: boolean; href: string; detalle: string };

export default function AdjuntosExpediente({
  id,
  pasos = [],
  planilla,
  anexos,
  verClave,
  puede,
}: {
  id: string;
  pasos?: PasoChip[];
  planilla: boolean;
  anexos: AnexoVista[];
  verClave: string;
  puede: boolean;
}) {
  const pendiente = anexos.find((a) => a.origen === "pendiente")?.tipo;
  const items = [
    ...(planilla ? [{ clave: "planilla", nombre: "Planilla de remuneración", hecho: true }] : []),
    ...anexos.map((a) => ({ clave: a.clave, nombre: a.nombre, hecho: a.origen !== "pendiente" })),
  ];
  if (items.length === 0 && pasos.length === 0 && !puede) return null;
  return (
    <div className="doc-nav av-docs-fila no-imprimir" role="tablist" aria-label="Documentos que acompañan al expediente">
      {pasos.map((p, i) => (
        <span key={`paso-${p.id}`} className="doc-par">
          {i > 0 && <i className={`doc-sep${p.hecho ? " ok" : ""}`} aria-hidden="true" />}
          <Link role="tab" aria-selected={p.visto} scroll={false} title={p.detalle || undefined} className={`doc-tab${p.hecho ? "" : " pendiente"}${p.actual && !p.hecho ? " siguiente" : ""}${p.visto ? " activo" : ""}`} href={p.href}>
            <span className="ic" aria-hidden="true">{p.anulado ? "✕" : p.hecho ? "✓" : ""}</span>{p.nombre}
          </Link>
        </span>
      ))}
      {items.map((x, i) => (
        <span key={x.clave} className="doc-par">
          {(i > 0 || pasos.length > 0) && <i className={`doc-sep${x.hecho ? " ok" : ""}`} aria-hidden="true" />}
          <Link role="tab" aria-selected={x.clave === verClave} scroll={false} className={`doc-tab${x.hecho ? "" : " pendiente"}${x.clave === verClave ? " activo" : ""}`} href={`/expedientes/${id}?ver=${x.clave}`}>
            <span className="ic" aria-hidden="true">{x.hecho ? "✓" : ""}</span>{x.nombre}
          </Link>
        </span>
      ))}
      {puede && (
        <span className="doc-par">
          <VentanaFlotante boton="+ Adjuntar" titulo="Adjuntar documento al expediente" accion={subirAdjunto} textoGuardar="Adjuntar" claseBoton="btn chico contorno">
            <input type="hidden" name="id" value={id} />
            <label className="campo">
              ¿Qué documento es?
              <select name="tipo" required defaultValue={pendiente ?? "otro"}>
                {TIPOS_ADJUNTABLES.map((t) => (
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
  );
}
