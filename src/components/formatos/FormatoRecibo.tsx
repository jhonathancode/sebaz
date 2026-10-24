import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import type { Mcp } from "@/lib/contexto";
import { enLetras, fecha, soles } from "@/lib/formato";

export type DatosRecibo = {
  numero: number | null;
  anio: number;
  fecha: string;
  pagador_nombre: string;
  pagador_doc: string | null;
  concepto: string;
  monto: number;
};

/** Recibo de ingreso propio, tal como se imprime. */
export default function FormatoRecibo({ r, mcp }: { r: DatosRecibo; mcp: Mcp }) {
  return (
    <div className="hoja" style={{ maxWidth: 720 }}>
      <Encabezado mcp={mcp} titulo="RECIBO DE INGRESO" numero={r.numero ? `N° ${String(r.numero).padStart(4, "0")}-${r.anio}` : "N° (se asigna al emitir)"} />
      <table className="formato" style={{ marginTop: 14 }}>
        <tbody>
          <tr><th style={{ width: 160 }}>Fecha</th><td>{fecha(r.fecha)}</td></tr>
          <tr><th>Recibí de</th><td>{r.pagador_nombre}{r.pagador_doc && ` · ${r.pagador_doc}`}</td></tr>
          <tr><th>La suma de</th><td>{enLetras(r.monto)}</td></tr>
          <tr><th>Por concepto de</th><td>{r.concepto}</td></tr>
          <tr><th>Importe</th><td><b>S/ {soles(r.monto)}</b></td></tr>
        </tbody>
      </table>
      <Firmas nombres={["TESORERO", "RECIBÍ CONFORME"]} />
    </div>
  );
}
