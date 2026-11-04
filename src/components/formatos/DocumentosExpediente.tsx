import MarcaAnulado, { MarcaAnuladaPagina } from "@/components/MarcaAnulado";
import { datosCPDe, extraDe } from "@/lib/datosCP";
import FormatoComprobante from "@/components/formatos/FormatoComprobante";
import type { Mcp } from "@/lib/contexto";
import type { cargarExpediente, Proveedor } from "@/lib/documentos";
import LogoSebaz from "@/components/LogoSebaz";
import { enLetras, fecha, num3, soles } from "@/lib/formato";
import { conceptoSinSeRequiere } from "@/lib/requerimiento";

export type DatosExpediente = Awaited<ReturnType<typeof cargarExpediente>>;
type Datos = DatosExpediente;

/** Dibuja un documento del expediente (o todos, con clave "todo") tal como se imprime. */
export default function DocumentosExpediente({
  d,
  mcp,
  clave,
  tesorero,
  cargo,
}: {
  d: Datos;
  mcp: Mcp;
  clave: string;
  tesorero: string;
  cargo: string;
}) {
  const mostrar = (c: string) => clave === "todo" || clave === c;
  return (
    <>
      {d.anulado && <MarcaAnuladaPagina />}
      {mostrar("requerimiento") && <Requerimiento d={d} mcp={mcp} />}
      {mostrar("cotizaciones") && d.cotizaciones.length > 0 && <Cotizaciones d={d} mcp={mcp} tesorero={tesorero} cargo={cargo} />}
      {mostrar("orden") && d.orden && <Orden d={d} mcp={mcp} tesorero={tesorero} cargo={cargo} />}
      {mostrar("conformidad") && d.conformidad && <Memorando d={d} mcp={mcp} tesorero={tesorero} cargo={cargo} />}
      {mostrar("comprobante") && d.cp && (
        <FormatoComprobante c={{ ...d.cp, hecho_por: (d.cp.perfiles as { nombre: string } | null)?.nombre }} mcp={mcp} extra={extraDe(d.cp, d.e, d.orden)} anulado={d.anulado ?? (d.cp.estado === "anulado" ? { motivo: d.cp.anulado_motivo, en: d.cp.anulado_en } : null)} />
      )}
    </>
  );
}

function sufijo(mcp: Mcp) {
  return mcp.nombre.replace(/municipalidad( del)?( centro poblado)?/i, "").trim().toUpperCase();
}

const ahora = () => {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour12: false }),
  };
};

/**
 * Cuadro de requerimiento con el formato de los centros poblados y la misma letra, líneas y encabezado del
 * comprobante de pago: línea del sistema, título con recuadro de fecha, «SON …» en letras, detalle con precio
 * de referencia, firmas de control posterior y el sello de ZEBAZ. Una sola hoja A4, blanco y negro, con margen
 * izquierdo para perforar.
 */
export function Requerimiento({ d, mcp }: { d: Datos; mcp: Mcp }) {
  const e = d.e!;
  const total = d.items.reduce((s, i) => s + Number(i.total), 0);
  const imp = ahora();
  const [anio, mes, dia] = (e.fecha || "").slice(0, 10).split("-");
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();
  return (
    <div className="hoja rq">
      {d.anulado && <MarcaAnulado {...d.anulado} />}

      {/* Línea del sistema, como en el comprobante */}
      <div className="sf-sis">
        <div>
          <div>ZEBAZ - Módulo de Tesorería</div>
          <div>{(mcp.nombre ?? "").toUpperCase()}{lugar ? ` · ${lugar}` : ""}{mcp.ruc ? ` · RUC ${mcp.ruc}` : ""}</div>
        </div>
        <div className="sf-sis-der" suppressHydrationWarning>
          <div>Fecha : {imp.fecha}</div>
          <div>Hora : {imp.hora}</div>
          <div>Pag. : 1 de 1</div>
        </div>
      </div>

      <div className="sf-tit-fila">
        <div className="rq-tit">
          <div>
            <div className="sf-titulo">CUADRO DE REQUERIMIENTO</div>
            <div className="sf-registro">
              <span>N°</span> <b>{num3(e.numero)}-{e.anio}-MCP-{sufijo(mcp)}</b>
            </div>
          </div>
        </div>
        <table className="sf-num">
          <thead>
            <tr><th>N°</th><th>DIA</th><th>MES</th><th>AÑO</th></tr>
          </thead>
          <tbody>
            <tr><td>{e.numero ? String(e.numero).padStart(4, "0") : "—"}</td><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sf-linea"><span className="sf-et">UNIDAD ORGÁNICA</span><span className="sf-val">{e.area_usuaria ?? ""}</span></div>
      <div className="sf-linea"><span className="sf-et">PROYECTO / ACTIVIDAD</span><span className="sf-val">{e.meta ?? ""}</span></div>
      <div className="sf-linea"><span className="sf-et">ESPECÍFICA DEL GASTO</span><span className="sf-val">{e.clasificador ?? ""}</span></div>
      <div className="sf-linea"><span className="sf-et">SON</span><span className="sf-val">{enLetras(total).replace(/ SOLES$/, " NUEVOS SOLES")}</span></div>

      <div className="rq-marco">
        <div className="sf-cab">DETALLE DEL REQUERIMIENTO</div>
        <div className="rq-cuerpo">
          <table className="rq-items">
            <colgroup><col style={{ width: "6%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /><col /><col style={{ width: "14%" }} /><col style={{ width: "14%" }} /></colgroup>
            <thead>
              <tr><th rowSpan={2}>IT</th><th rowSpan={2}>CANTIDAD</th><th rowSpan={2}>UNIDAD DE MEDIDA</th><th rowSpan={2}>DESCRIPCIÓN DETALLADA</th><th colSpan={2}>PRECIO REFERENCIA (*)</th></tr>
              <tr><th>UNITARIO</th><th>TOTALES</th></tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.item}</td><td>{Number(i.cantidad)}</td><td>{i.unidad}</td><td>{i.descripcion}</td>
                  <td>S/ {soles(i.precio_unitario)}</td><td>S/ {soles(i.total)}</td>
                </tr>
              ))}
              <tr className="rq-relleno"><td /><td /><td /><td /><td /><td /></tr>
            </tbody>
            <tfoot>
              <tr><th colSpan={5} className="rq-tot-et">TOTALES</th><th>S/ {soles(total)}</th></tr>
            </tfoot>
          </table>
        </div>
        <div className="rq-entregar"><b>ENTREGAR EN:</b></div>
      </div>

      <div className="rq-control">CONTROL POSTERIOR</div>
      <div className="rq-firmas">
        <div><b>GERENCIA DE ADMINISTRACIÓN</b><span /></div>
        <div><b>GERENCIA MUNICIPAL</b><span /></div>
      </div>

      <div className="rq-pie">
        <span>(*) Precios de referencia; el monto final se define con la cotización elegida.</span>
        <span className="rq-sello"><LogoSebaz tamano={26} claro={false} /></span>
      </div>
    </div>
  );
}

/**
 * Cuadro comparativo de cotizaciones: una columna por proveedor, lado a lado, con la elegida resaltada. Lleva el
 * mismo encabezado, letra, líneas y sello que los demás documentos, pero se lee de un vistazo como comparación.
 */
function Cotizaciones({ d, mcp, tesorero, cargo }: { d: Datos; mcp: Mcp; tesorero?: string; cargo?: string }) {
  const e = d.e!;
  const imp = ahora();
  const [anio, mes, dia] = (e.fecha || "").slice(0, 10).split("-");
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();
  const cots = d.cotizaciones.map((c) => ({ ...c, p: c.proveedores as unknown as { razon_social: string; num_doc: string } | null }));
  const elegida = cots.find((c) => c.elegida);
  const menor = cots.length ? Math.min(...cots.map((c) => Number(c.monto))) : 0;
  const porMenor = !!elegida && cots.length > 1 && Number(elegida.monto) === menor;
  const cls = (c: { elegida: boolean }) => (c.elegida ? "cc-sel" : "");
  const diferencia = (monto: number) => {
    if (cots.length < 2) return "—";
    if (monto === menor) return "MENOR PRECIO";
    const dif = monto - menor;
    return `+ S/ ${soles(dif)} (+${((dif / menor) * 100).toFixed(1)} %)`;
  };
  const solicitado = d.items.map((i) => `${Number(i.cantidad)} ${i.unidad} · ${i.descripcion}`).join(" ; ");
  return (
    <div className="hoja rq cc">
      {d.anulado && <MarcaAnulado {...d.anulado} />}

      <div className="sf-sis">
        <div>
          <div>ZEBAZ - Módulo de Tesorería</div>
          <div>{(mcp.nombre ?? "").toUpperCase()}{lugar ? ` · ${lugar}` : ""}{mcp.ruc ? ` · RUC ${mcp.ruc}` : ""}</div>
        </div>
        <div className="sf-sis-der" suppressHydrationWarning>
          <div>Fecha : {imp.fecha}</div>
          <div>Hora : {imp.hora}</div>
          <div>Pag. : 1 de 1</div>
        </div>
      </div>

      <div className="og-cab">
        <div className="og-titulo">CUADRO COMPARATIVO DE COTIZACIONES N° {num3(e.numero)}-{e.anio}-MCP-{sufijo(mcp)}</div>
        <div className="og-fila-exp">
          <table className="og-fecha">
            <thead><tr><th>Día</th><th>Mes</th><th>Año</th></tr></thead>
            <tbody><tr><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div className="sf-linea"><span className="sf-et">UNIDAD ORGÁNICA</span><span className="sf-val">{e.area_usuaria ?? ""}</span></div>
      <div className="sf-linea"><span className="sf-et">OBJETO</span><span className="sf-val">{conceptoSinSeRequiere(e.descripcion)}</span></div>
      <div className="sf-linea"><span className="sf-et">SE COTIZA</span><span className="sf-val">{solicitado}</span></div>

      <table className="cc-mat">
        <colgroup><col style={{ width: "19%" }} />{cots.map((c) => <col key={c.id} />)}</colgroup>
        <tbody>
          <tr><th>COTIZACIÓN</th>{cots.map((c, i) => <td key={c.id} className={`${cls(c)} cc-n`}>N° {i + 1}</td>)}</tr>
          <tr><th>PROVEEDOR</th>{cots.map((c) => <td key={c.id} className={`${cls(c)} cc-prov`}>{c.p?.razon_social}</td>)}</tr>
          <tr><th>RUC / DNI</th>{cots.map((c) => <td key={c.id} className={cls(c)}>{c.p?.num_doc}</td>)}</tr>
          <tr><th>PLAZO</th>{cots.map((c) => <td key={c.id} className={cls(c)}>{c.plazo ?? ""}</td>)}</tr>
          <tr><th>MONTO S/</th>{cots.map((c) => <td key={c.id} className={`${cls(c)} cc-monto`}>{soles(c.monto)}</td>)}</tr>
          <tr><th>DIFERENCIA CON LA MENOR</th>{cots.map((c) => <td key={c.id} className={cls(c)}>{diferencia(Number(c.monto))}</td>)}</tr>
          <tr><th>RESULTADO</th>{cots.map((c) => <td key={c.id} className={`${cls(c)} cc-res`}>{c.elegida ? "ELEGIDA" : elegida ? "NO ELEGIDA" : ""}</td>)}</tr>
        </tbody>
      </table>

      {elegida && (
        <>
          <div className="sf-linea cc-dec">
            <span className="sf-et">DECISIÓN</span>
            <span className="sf-val">
              SE ELIGE LA COTIZACIÓN DE {elegida.p?.razon_social} ({elegida.p?.num_doc}) POR S/ {soles(elegida.monto)}{porMenor ? ", POR SER LA DE MENOR PRECIO" : ""}
            </span>
          </div>
          <div className="sf-linea"><span className="sf-et">SON</span><span className="sf-val">{enLetras(Number(elegida.monto)).replace(/ SOLES$/, " NUEVOS SOLES")}</span></div>
        </>
      )}

      <div className="cc-sep" />

      <div className="rq-firmas">
        <div><b>ELABORADO POR</b><span className="og-elab">{tesorero ? <><em>{tesorero.toUpperCase()}</em>{cargo ? <small>{cargo.toUpperCase()}</small> : null}</> : null}</span></div>
        <div><b>V°B° ALCALDE</b><span /></div>
      </div>

      <div className="rq-pie">
        <span />
        <span className="rq-sello"><LogoSebaz tamano={26} claro={false} /></span>
      </div>
    </div>
  );
}

/**
 * Orden de compra / de servicio con la disposición del modelo: número en recuadro, datos del proveedor y
 * condiciones, detalle con el monto en letras, afectación presupuestal, total, «facturar a nombre de», firmas y
 * nota importante. Es la misma hoja para compra y servicio; solo cambia el título. Una sola hoja A4.
 */
export function Orden({ d, mcp, tesorero, cargo }: { d: Datos; mcp: Mcp; tesorero?: string; cargo?: string }) {
  const e = d.e!;
  const orden = d.orden!;
  const p = orden.proveedores as unknown as Proveedor | null;
  const compra = orden.tipo === "compra";
  const siglas = compra ? "O/C" : "O/S";
  const imp = ahora();
  const [anio, mes, dia] = (orden.fecha || "").slice(0, 10).split("-");
  const monto = Number(orden.monto);
  // Si la orden es por todo el requerimiento, cada ítem lleva su valor; si no, solo va el total
  const sumaItems = d.items.reduce((s, i) => s + Number(i.total), 0);
  const conValores = Math.abs(sumaItems - monto) < 0.005;
  const cod = datosCPDe(mcp).codif[(e as { fuente_id?: string | null }).fuente_id ?? ""] ?? {};
  const cadena = [cod.fn, cod.divf, cod.grpf, cod.prg, cod.prod, cod.act].filter(Boolean).join(".");
  const ffrb = [cod.f, cod.rb].filter(Boolean).join(" - ");
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();
  return (
    <div className="hoja og">
      {d.anulado && <MarcaAnulado {...d.anulado} />}

      <div className="sf-sis">
        <div>
          <div>ZEBAZ - Módulo de Tesorería</div>
          <div>{(mcp.nombre ?? "").toUpperCase()}{lugar ? ` · ${lugar}` : ""}{mcp.ruc ? ` · RUC ${mcp.ruc}` : ""}</div>
        </div>
        <div className="sf-sis-der" suppressHydrationWarning>
          <div>Fecha : {imp.fecha}</div>
          <div>Hora : {imp.hora}</div>
          <div>Pag. : 1 de 1</div>
        </div>
      </div>

      <div className="og-cab">
        <div className="og-titulo">ORDEN DE {compra ? "COMPRA" : "SERVICIO"} N° <span className="og-caja">{num3(orden.numero)}-{orden.anio}</span></div>
        <div className="og-fila-exp">
          <table className="og-fecha">
            <thead><tr><th>Día</th><th>Mes</th><th>Año</th></tr></thead>
            <tbody><tr><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div className="og-ue">
        <div><b>UNIDAD EJECUTORA</b><span>: {(mcp.nombre ?? "").toUpperCase()}</span></div>
        <div><b>NRO. IDENTIFICACION</b><span>: {mcp.ruc ?? ""}</span></div>
      </div>

      <div className="og-caja2">
        <div className="og-cols">
          <div className="og-col">
            <div className="og-cab2">1. DATOS DEL PROVEEDOR</div>
            <div className="og-datos">
              <div><b>Señor(es) :</b> {p?.razon_social}</div>
              <div><b>Dirección :</b> {p?.direccion ?? ""}</div>
              <div className="og-dos"><span><b>RUC :</b> {p?.num_doc}</span><span><b>Teléfono :</b> {p?.telefono ?? ""}</span></div>
            </div>
          </div>
          <div className="og-col">
            <div className="og-cab2">2. CONDICIONES GENERALES</div>
            <div className="og-datos">
              <div><b>N° Requerimiento :</b> {num3(e.numero)}-{e.anio}</div>
              <div><b>Tipo de Proceso :</b> {orden.tipo_proceso}</div>
              <div><b>Plazo de ejecución :</b> {orden.plazo ?? ""}</div>
              <div><b>Moneda :</b> S/ (Nacional)</div>
            </div>
          </div>
        </div>
        <div className="og-concepto"><b>Concepto :</b> {orden.concepto}</div>
      </div>

      <div className="og-detalle">
        <table className="og-items">
          <colgroup><col style={{ width: "9%" }} /><col style={{ width: "13%" }} /><col /><col style={{ width: "16%" }} /></colgroup>
          <thead>
            <tr><th>Cant.</th><th>Unid. Med.</th><th>Descripción</th><th>Valor Total S/</th></tr>
          </thead>
          <tbody>
            {d.items.map((i) => (
              <tr key={i.id}><td>{Number(i.cantidad)}</td><td>{i.unidad}</td><td>{i.descripcion}</td><td className="der">{conValores ? soles(i.total) : ""}</td></tr>
            ))}
            <tr className="og-relleno"><td /><td /><td /><td /></tr>
          </tbody>
        </table>
        <div className="og-letras">
          <span className="og-ast" aria-hidden="true">{"* ".repeat(60)}</span>
          <span>({enLetras(monto)})</span>
          <span className="og-ast" aria-hidden="true">{"* ".repeat(60)}</span>
        </div>
      </div>

      <div className="og-abajo">
        <div className="og-afect">
          <div className="og-cab2">AFECTACION PRESUPUESTAL</div>
          <table>
            <thead><tr><th>Meta / Mnemónico</th><th>Cadena Funcional</th><th>FF/Rb</th><th>Clasif. Gasto</th><th>Monto S/</th></tr></thead>
            <tbody><tr><td>{cod.meta || e.meta || ""}</td><td>{cadena}</td><td>{ffrb}</td><td>{e.clasificador ?? ""}</td><td>{soles(monto)}</td></tr></tbody>
          </table>
        </div>
        <div className="og-total"><b>TOTAL S/</b><span>{soles(monto)}</span></div>
      </div>

      <div className="og-fact">
        <div><b>Facturar a nombre de :</b> {(mcp.nombre ?? "").toUpperCase()}</div>
        <div className="og-dos"><span><b>Dirección :</b> {mcp.direccion ?? ""}</span><span><b>RUC :</b> {mcp.ruc ?? "________"}</span></div>
      </div>

      <div className="og-firmas">
        <div><b>ELABORADO POR</b><span className="og-elab">{tesorero ? <><em>{tesorero.toUpperCase()}</em>{cargo ? <small>{cargo.toUpperCase()}</small> : null}</> : null}</span></div>
        <div><b>ORDENACIÓN DEL SERVICIO</b><span /><i>ALCALDE</i></div>
        <div>
          <b>CONFORMIDAD DEL SERVICIO</b><span />
          <div className="og-fecha-firma"><em>Fecha</em><span>Día</span><span>Mes</span><span>Año</span></div>
        </div>
      </div>

      <div className="og-nota">
        <b>NOTA IMPORTANTE :</b>
        <ul>
          <li>El proveedor debe adjuntar a su comprobante copia de esta {siglas}.</li>
          <li>Esta orden es nula sin las firmas y sellos reglamentarios o autorizados.</li>
          <li>El contratista (proveedor) se obliga a cumplir las obligaciones que le corresponden, bajo sanción de quedar inhabilitado para contratar con el Estado en caso de incumplimiento.</li>
        </ul>
      </div>

      <div className="og-pie"><span className="rq-sello"><LogoSebaz tamano={26} claro={false} /></span></div>
    </div>
  );
}

/**
 * Memorando de conformidad del alcalde al tesorero, con el mismo formato que el requerimiento y la orden:
 * línea del sistema, título con recuadro de fecha, datos del memorando, contenido y firma. Una sola hoja A4.
 */
export function Memorando({ d, mcp, tesorero, cargo }: { d: Datos; mcp: Mcp; tesorero: string; cargo: string }) {
  const conf = d.conformidad!;
  const imp = ahora();
  const [anio, mes, dia] = (conf.fecha || "").slice(0, 10).split("-");
  const lugar = [mcp.distrito && `DISTRITO DE ${mcp.distrito}`, mcp.provincia && `PROVINCIA DE ${mcp.provincia}`].filter(Boolean).join(" · ").toUpperCase();
  const compra = d.orden?.tipo === "compra";
  const ref = [
    d.orden?.numero ? `${compra ? "ORDEN DE COMPRA" : "ORDEN DE SERVICIO"} N° ${num3(d.orden.numero)}-${d.orden.anio}` : "",
    d.e?.numero ? `REQUERIMIENTO N° ${num3(d.e.numero)}-${d.e.anio}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <div className="hoja rq mm">
      {d.anulado && <MarcaAnulado {...d.anulado} />}

      <div className="sf-sis">
        <div>
          <div>ZEBAZ - Módulo de Tesorería</div>
          <div>{(mcp.nombre ?? "").toUpperCase()}{lugar ? ` · ${lugar}` : ""}{mcp.ruc ? ` · RUC ${mcp.ruc}` : ""}</div>
        </div>
        <div className="sf-sis-der" suppressHydrationWarning>
          <div>Fecha : {imp.fecha}</div>
          <div>Hora : {imp.hora}</div>
          <div>Pag. : 1 de 1</div>
        </div>
      </div>

      <div className="og-cab">
        <div className="og-titulo">MEMORANDO N° {num3(conf.memorando_numero)}-{conf.anio}-MCP-{sufijo(mcp)}/ALC</div>
        <div className="og-fila-exp">
          <table className="og-fecha">
            <thead><tr><th>Día</th><th>Mes</th><th>Año</th></tr></thead>
            <tbody><tr><td>{dia}</td><td>{mes}</td><td>{anio}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div className="sf-linea"><span className="sf-et">A</span><span className="sf-val">{tesorero}</span></div>
      <div className="sf-linea"><span className="sf-et">CARGO</span><span className="sf-val">{cargo} DE LA {mcp.nombre}</span></div>
      <div className="sf-linea"><span className="sf-et">DE</span><span className="sf-val">ALCALDE</span></div>
      <div className="sf-linea"><span className="sf-et">ASUNTO</span><span className="sf-val">CONFORMIDAD DE {compra ? "BIENES" : "SERVICIO"}</span></div>
      {ref && <div className="sf-linea"><span className="sf-et">REFERENCIA</span><span className="sf-val">{ref}</span></div>}
      <div className="sf-linea"><span className="sf-et">FECHA</span><span className="sf-val">{fecha(conf.fecha)}</span></div>

      <div className="rq-marco">
        <div className="sf-cab">CONTENIDO</div>
        <div className="mm-texto">{conf.texto}</div>
        <div className="mm-atte">Atentamente,</div>
      </div>

      <div className="rq-firmas mm-firma">
        <div><b>ALCALDE</b><span /></div>
      </div>

      <div className="rq-pie">
        <span />
        <span className="rq-sello"><LogoSebaz tamano={26} claro={false} /></span>
      </div>
    </div>
  );
}
