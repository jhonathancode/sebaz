import type { Mcp } from "@/lib/contexto";
import { enLetras, fecha, logoMcp, soles } from "@/lib/formato";

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
  const logo = logoMcp(mcp);
  const lugar = [mcp.distrito && `Distrito de ${mcp.distrito}`, mcp.provincia && `Provincia de ${mcp.provincia}`].filter(Boolean).join(" · ");
  return (
    <div className="hoja rec">
      <div className="rec-cab">
        <div className="rec-ent">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" className="rec-logo" />}
          <div>
            <div className="rec-nombre">{mcp.nombre}</div>
            <div className="rec-sub">{lugar}</div>
            {mcp.ruc && <div className="rec-sub">RUC {mcp.ruc}</div>}
          </div>
        </div>
        <div className="rec-caja">
          <div className="rec-titulo">RECIBO DE INGRESO</div>
          <div className="rec-num">{r.numero ? `N° ${String(r.numero).padStart(4, "0")}-${r.anio}` : "N° (se asigna al emitir)"}</div>
        </div>
      </div>

      <div className="rec-monto-fila">
        <div className="rec-fecha"><span>FECHA</span><b>{fecha(r.fecha)}</b></div>
        <div className="rec-importe"><span>IMPORTE</span><b>S/ {soles(r.monto)}</b></div>
      </div>

      <dl className="rec-datos">
        <div><dt>Recibí de</dt><dd>{r.pagador_nombre}</dd></div>
        {r.pagador_doc && <div><dt>DNI / RUC</dt><dd className="rec-mono">{r.pagador_doc}</dd></div>}
        <div><dt>La suma de</dt><dd>{enLetras(r.monto)}</dd></div>
        <div><dt>Por concepto de</dt><dd>{r.concepto}</dd></div>
      </dl>

      <div className="rec-firmas">
        <div><span />TESORERO<small>{mcp.nombre}</small></div>
        <div><span />RECIBÍ CONFORME<small>{r.pagador_nombre}{r.pagador_doc ? ` · ${r.pagador_doc}` : ""}</small></div>
      </div>
    </div>
  );
}
