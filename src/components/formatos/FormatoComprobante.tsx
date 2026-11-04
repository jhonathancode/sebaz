import MarcaAnulado from "@/components/MarcaAnulado";
import type { Mcp } from "@/lib/contexto";
import { enLetras, soles } from "@/lib/formato";

export type DatosCP = {
  numero: number | null;
  fecha: string;
  beneficiario: string;
  beneficiario_doc: string | null;
  concepto: string;
  importe: number;
  deducciones: number;
  partida: string | null;
  funcional: string | null;
  cheque: string | null;
  hecho_por?: string | null;
};

const M = (n: number) => `S/ ${soles(n)}`;

/** Una caja con borde redondeado y su franja de título (como en el modelo impreso). */
function Caja({ titulo, children, className = "", style }: { titulo: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`cpf-caja ${className}`} style={style}>
      <div className="cpf-tit">{titulo}</div>
      {children}
    </div>
  );
}

/**
 * Comprobante de pago con el formato oficial: encabezado, nombre y son, concepto, codificación programática,
 * contabilidad presupuestal y patrimonial, estadística del objeto del gasto, retenciones, forma de pago,
 * para uso del tesorero, visación y recibí conforme.
 */
export default function FormatoComprobante({ c, mcp, anulado }: { c: DatosCP; mcp: Mcp; anulado?: { motivo?: string | null; en?: string | null } | null }) {
  const liquido = Number(c.importe) - Number(c.deducciones);
  const hayDeducciones = Number(c.deducciones) > 0;
  const iniciales = (c.hecho_por ?? "").split(/\s+/).filter(Boolean).map((p) => p[0]).join("").toUpperCase();
  const [anio, mes, dia] = (c.fecha || "").split("-");
  const doc = (c.beneficiario_doc ?? "").replace(/\D/g, "");
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();

  return (
    <div className="hoja cpf">
      {anulado && <MarcaAnulado {...anulado} />}

      {/* Encabezado */}
      <div className="cpf-enc">
        <div className="cpf-muni">
          <div>{mcp.nombre}</div>
          {lugar && <div>{lugar}</div>}
        </div>
        <div className="cpf-titulo">COMPROBANTE DE PAGO</div>
      </div>

      {/* Nombre, número y fecha */}
      <div className="cpf-fila-nombre">
        <div className="cpf-linea">
          <span className="cpf-et">NOMBRE:</span>
          <span className="cpf-val">{c.beneficiario}</span>
        </div>
        <table className="cpf-num">
          <thead>
            <tr><th>N°</th><th>DIA</th><th>MES</th><th>AÑO</th></tr>
          </thead>
          <tbody>
            <tr><td>{c.numero ? String(c.numero).padStart(3, "0") : "—"}</td><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="cpf-linea cpf-son">
        <span className="cpf-et">SON:</span>
        <span className="cpf-val">{enLetras(liquido)}</span>
      </div>
      <div className="cpf-enletras">(EN LETRAS)</div>

      {/* Concepto */}
      <Caja titulo="C O N C E P T O" className="cpf-concepto">
        <div className="cpf-cuerpo-concepto">{c.concepto}</div>
      </Caja>

      <div className="cpf-cols">
        {/* Columna izquierda */}
        <div className="cpf-col">
          <Caja titulo="CODIFICACIÓN PROGRAMÁTICA">
            <table className="cpf-t cpf-codif">
              <thead>
                <tr><th>SECTOR</th><th>PLIEGO</th><th>PROGRAMA</th><th>SUB PROGRAMA</th><th>PROYECTO</th><th>OBRA</th><th>PTO</th><th>FUNCIONAL</th></tr>
              </thead>
              <tbody>
                <tr><td /><td /><td /><td /><td /><td /><td /><td className="cpf-c">{c.funcional ?? ""}</td></tr>
              </tbody>
            </table>
          </Caja>

          <Caja titulo="CONTABILIDAD PRESUPUESTAL">
            <table className="cpf-t cpf-cont">
              <thead>
                <tr><th colSpan={2}>DEBE</th><th colSpan={2}>HABER</th></tr>
                <tr><th>CUENTA</th><th>IMPORTE</th><th>CUENTA</th><th>IMPORTE</th></tr>
              </thead>
              <tbody>
                <tr><td /><td className="cpf-c">{M(c.importe)}</td><td /><td className="cpf-c">{M(c.importe)}</td></tr>
              </tbody>
            </table>
          </Caja>

          <Caja titulo="CONTABILIDAD PATRIMONIAL" className="cpf-patrimonial">
            <table className="cpf-t cpf-cont cpf-alta">
              <thead>
                <tr><th colSpan={2}>DEBE</th><th colSpan={2}>HABER</th></tr>
                <tr><th>CUENTA</th><th>IMPORTE</th><th>CUENTA</th><th>IMPORTE</th></tr>
              </thead>
              <tbody>
                <tr className="cpf-alto"><td /><td className="cpf-c cpf-medio">{M(c.importe)}</td><td /><td className="cpf-c cpf-medio">{M(c.importe)}</td></tr>
                <tr className="cpf-baja"><td /><td /><td /><td /></tr>
              </tbody>
            </table>
          </Caja>

          <Caja titulo="PARA USO DEL TESORERO">
            <table className="cpf-t cpf-teso">
              <thead>
                <tr><th>FECHA</th><th>HECHO POR</th><th>CONFORME</th></tr>
              </thead>
              <tbody>
                <tr><td className="cpf-c cpf-medio">{c.fecha ? `${dia}/${mes}/${anio}` : ""}</td><td className="cpf-c cpf-medio">{iniciales}</td><td /></tr>
              </tbody>
            </table>
          </Caja>

          <Caja titulo="VISACIÓN">
            <table className="cpf-t cpf-visa">
              <tbody>
                <tr className="cpf-v1"><td /><td /></tr>
                <tr className="cpf-v2"><td /><td /></tr>
              </tbody>
            </table>
          </Caja>

          <Caja titulo="RECIBI CONFORME" className="cpf-recibi">
            <div className="cpf-recibi-cuerpo" />
            <table className="cpf-t cpf-firma">
              <thead>
                <tr><th>FECHA</th><th>FIRMA</th></tr>
              </thead>
              <tbody>
                <tr><td className="cpf-c">{dia}</td><td>D.N.I. Nº: {doc.length === 8 ? doc : ""}</td></tr>
                <tr><td className="cpf-c">{mes}</td><td>R.U.C.: {doc.length === 11 ? doc : ""}</td></tr>
                <tr><td className="cpf-c">{anio}</td><td>L.M. Nº:</td></tr>
              </tbody>
            </table>
          </Caja>
        </div>

        {/* Columna derecha */}
        <div className="cpf-col">
          <Caja titulo="ESTADISTICA OBJETO DEL GASTO" className="cpf-estad">
            <table className="cpf-t cpf-est">
              <thead>
                <tr><th rowSpan={2} className="cpf-partida-th">CÓDIGO DE LA PARTIDA</th><th colSpan={2}>IMPORTE</th></tr>
                <tr><th>PARCIAL</th><th>TOTAL</th></tr>
              </thead>
              <tbody>
                <tr className="cpf-est-cuerpo"><td className="cpf-c cpf-arriba">{c.partida ?? ""}</td><td /><td className="cpf-c cpf-medio">{M(c.importe)}</td></tr>
              </tbody>
            </table>
            <table className="cpf-t cpf-totales">
              <tbody>
                <tr><td>TOTAL</td><td /><td className="cpf-c">{M(c.importe)}</td></tr>
                <tr><td>DEDUCCIONES</td><td /><td className="cpf-c">{hayDeducciones ? M(c.deducciones) : ""}</td></tr>
                <tr><td>LIQUIDO A PAGAR</td><td /><td className="cpf-c">{M(liquido)}</td></tr>
              </tbody>
            </table>
          </Caja>

          <Caja titulo={<span className="cpf-tit-2"><span>RETENCION Y/O DEDUCCIONES</span><span>IMPORTE</span></span>} className="cpf-retencion">
            <div className="cpf-ret-cuerpo">
              <div className="cpf-ret-det" />
              <div className="cpf-ret-imp cpf-c">{hayDeducciones ? M(c.deducciones) : ""}</div>
            </div>
          </Caja>

          <div className="cpf-caja cpf-pago">
            <table className="cpf-t cpf-pago-t">
              <thead>
                <tr><th>FORMA DE PAGO</th><th>AUTORIZADO</th></tr>
              </thead>
              <tbody>
                <tr><td><span className="cpf-pl">N° CUENTA</span><span className="cpf-pv">{mcp.banco_cuenta ?? ""}</span></td><td rowSpan={2} className="cpf-autoriza" /></tr>
                <tr><td><span className="cpf-pl">N° DE CHEQUE</span><span className="cpf-pv">{c.cheque ?? ""}</span></td></tr>
                <tr><td><span className="cpf-pl">FONDOS PARA PAGOS EN EFECTIVO</span></td><td className="cpf-c">FIRMA</td></tr>
              </tbody>
            </table>
            <div className="cpf-pago-resto" />
          </div>
        </div>
      </div>
    </div>
  );
}
