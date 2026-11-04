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

const M = (n: number) => soles(n);
const ahora = () => {
  const d = new Date();
  const fecha = d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour12: false });
  return { fecha, hora };
};

/**
 * Comprobante de pago con el formato oficial (estilo SIAF): blanco y negro, con el encabezado, nombre, concepto,
 * codificación programática, estadística del objeto del gasto, contabilidad patrimonial, retenciones, uso del
 * tesorero, visación, forma de pago y recibí conforme.
 */
export default function FormatoComprobante({ c, mcp, anulado }: { c: DatosCP; mcp: Mcp; anulado?: { motivo?: string | null; en?: string | null } | null }) {
  const liquido = Number(c.importe) - Number(c.deducciones);
  const iniciales = (c.hecho_por ?? "").split(/\s+/).filter(Boolean).map((p) => p[0]).join("").toUpperCase();
  const [anio, mes, dia] = (c.fecha || "").split("-");
  const doc = (c.beneficiario_doc ?? "").replace(/\D/g, "");
  const imp = ahora();
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();

  return (
    <div className="hoja sf">
      {anulado && <MarcaAnulado {...anulado} />}

      {/* Cabecera del sistema */}
      <div className="sf-sis">
        <div>
          <div>ZEBAZ - Módulo de Tesorería</div>
          <div>{mcp.nombre}{lugar ? ` · ${lugar}` : ""}</div>
        </div>
        <div className="sf-sis-der" suppressHydrationWarning>
          <div>Fecha : {imp.fecha}</div>
          <div>Hora : {imp.hora}</div>
          <div>Pag. : 1 de 1</div>
        </div>
      </div>

      {/* Título y número */}
      <div className="sf-tit-fila">
        <div>
          <div className="sf-titulo">COMPROBANTE DE PAGO</div>
          <div className="sf-registro">
            <span>REGISTRO</span> <b>{String(c.numero ?? 0).padStart(10, "0")}</b>
          </div>
        </div>
        <table className="sf-num">
          <thead>
            <tr><th>N°</th><th>DIA</th><th>MES</th><th>AÑO</th></tr>
          </thead>
          <tbody>
            <tr><td>{c.numero ? String(c.numero).padStart(4, "0") : "—"}</td><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sf-linea">
        <span className="sf-et">NOMBRE</span>
        <span className="sf-val">{c.beneficiario}</span>
        <span className="sf-et sf-ruc">{doc.length === 11 ? "RUC" : doc.length === 8 ? "DNI" : "RUC"}</span>
        <span className="sf-val sf-valruc">{doc || "0"}</span>
      </div>
      <div className="sf-linea">
        <span className="sf-et">SON</span>
        <span className="sf-val">{enLetras(liquido).replace(/ SOLES$/, " NUEVOS SOLES")}</span>
      </div>

      {/* Marco principal */}
      <div className="sf-marco">
        <div className="sf-sec sf-concepto">
          <div className="sf-cab">CONCEPTO</div>
          <div className="sf-concepto-cuerpo">{c.concepto}</div>
        </div>

        {/* Codificación programática | Estadística del objeto del gasto */}
        <div className="sf-fila sf-alta">
          <div className="sf-sec sf-izq">
            <div className="sf-cab">CODIFICACION PROGRAMATICA</div>
            <div className="sf-codif-cab">RB SEC F CP PRG PROD/PRY ACT/AI/OBR FN DIVF GRPF META FINAL</div>
            <div className="sf-codif-fila">{c.funcional ?? ""}</div>
          </div>
          <div className="sf-sec sf-der sf-estad">
            <div className="sf-cab">ESTADISTICA OBJETO DEL GASTO</div>
            <div className="sf-est-cab">
              <div className="sf-clasif">CLASIFICADOR<br />DE GASTO</div>
              <div className="sf-imp">
                <div className="sf-imp-t">IMPORTE</div>
                <div className="sf-imp-p"><span>PARCIAL</span><span>TOTAL</span></div>
              </div>
            </div>
            <div className="sf-est-cuerpo">
              <div className="sf-clasif-v">{c.partida ?? ""}</div>
              <div className="sf-parcial">{M(c.importe)}</div>
              <div className="sf-total-col" />
            </div>
            <div className="sf-tot">
              <div><span>TOTAL</span><b>{M(c.importe)}</b></div>
              <div><span>DEDUCCIONES</span><b>{M(c.deducciones)}</b></div>
              <div><span>LIQUIDO A PAGAR</span><b>{M(liquido)}</b></div>
            </div>
          </div>
        </div>

        {/* Contabilidad patrimonial | Retenciones */}
        <div className="sf-fila sf-media">
          <div className="sf-sec sf-izq">
            <div className="sf-cab">CONTABILIDAD PATRIMONIAL</div>
            <div className="sf-pat-cab">
              <div className="sf-pat-dh"><span>DEBE</span><span>HABER</span></div>
              <div className="sf-pat-ci"><span>CUENTA</span><span>IMPORTE</span><span>CUENTA</span><span>IMPORTE</span></div>
            </div>
            <div className="sf-pat-cuerpo">
              <span />
              <span className="sf-der-v">{M(c.importe)}</span>
              <span />
              <span className="sf-der-v">{M(c.importe)}</span>
            </div>
          </div>
          <div className="sf-sec sf-der sf-ret">
            <div className="sf-cab sf-cab-2"><span>RETENCIONES Y/O DEDUCCIONES</span><span>IMPORTE</span></div>
            <div className="sf-ret-cuerpo">
              <span />
              <span className="sf-der-v">{Number(c.deducciones) > 0 ? M(c.deducciones) : ""}</span>
            </div>
          </div>
        </div>

        {/* Tesorero, visación, recibí | retenciones y forma de pago */}
        <div className="sf-fila sf-baja">
          <div className="sf-izq sf-pila">
            <div className="sf-sec">
              <div className="sf-cab">PARA EL USO DEL TESORERO O CAJERO</div>
              <div className="sf-teso-cab"><span>FECHA</span><span>HECHO POR</span><span>CONFORME</span></div>
              <div className="sf-teso-cuerpo">
                <span>{c.fecha ? `${dia}/${mes}/${anio}` : ""}</span>
                <span>{iniciales}</span>
                <span className="sf-firma-jefe"><i />JEFE DE LA OFICINA<br />DE TESORERIA</span>
              </div>
            </div>
            <div className="sf-sec">
              <div className="sf-cab">VISACION</div>
              <div className="sf-visa">
                <span><i />CONTROL INTERNO</span>
                <span><i />JEFE DE LA OFICINA<br />DE CONTABILIDAD</span>
              </div>
            </div>
            <div className="sf-sec sf-recibi">
              <div className="sf-cab">RECIBI CONFORME</div>
              <div className="sf-recibi-cuerpo">
                <div className="sf-rc-fecha">
                  <div className="sf-rc-f">FECHA<br /><b>{c.fecha ? `${dia}/${mes}/${anio}` : ""}</b></div>
                  <div className="sf-rc-d" />
                </div>
                <div className="sf-rc-datos">
                  <div className="sf-rc-firma"><i />FIRMA</div>
                  <div className="sf-rc-ids">
                    <span>DNI <b>{doc.length === 8 ? doc : ""}</b></span>
                    <span>RUC <b>{doc.length === 11 ? doc : ""}</b></span>
                  </div>
                  <div className="sf-rc-lm">LIBRETA MILITAR</div>
                </div>
              </div>
            </div>
          </div>
          <div className="sf-der sf-pila-der">
            <div className="sf-totret"><span>TOTAL RETENCIONES</span><b>{M(c.deducciones)}</b></div>
            <div className="sf-sec sf-pago">
              <div className="sf-cab sf-cab-2"><span>FORMA DE PAGO</span><span>AUTORIZACION</span></div>
              <div className="sf-pago-cuerpo">
                <div><span>AÑO</span><b>{anio}</b></div>
                <div><span>BANCO</span><b>{mcp.banco_nombre ?? ""}</b></div>
                <div><span>CTA CTE</span><b>{mcp.banco_cuenta ?? ""}</b></div>
                <div><span>CHEQUE GIRADO</span><b>{c.cheque ?? ""}</b></div>
                <div><span>CCI</span><b /></div>
                <div className="sf-pago-tipo"><span>TIPO DE OPERACION</span></div>
                <div className="sf-pago-tipo-v">GASTO</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
