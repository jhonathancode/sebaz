import Link from "next/link";
import BotonConfirmar from "@/components/BotonConfirmar";
import { notFound } from "next/navigation";
import Avisos from "@/components/Avisos";
import BotonPdf from "@/components/BotonPdf";
import BotonImprimir from "@/components/BotonImprimir";
import Estado from "@/components/Estado";
import Firmas from "@/components/Firmas";
import Motivo from "@/components/Motivo";
import { CAMPOS_CAPITULO1, FUNCIONES, RUBROS_INGRESO } from "@/lib/catalogos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { codigoCP, fecha, fechaHora, nombrePeriodo, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularRendicion, marcarEntregada } from "../acciones";

type CP = {
  id: string;
  numero: number;
  origen: string;
  fecha: string;
  cheque: string | null;
  beneficiario: string;
  concepto: string;
  importe: number;
  funcion: string | null;
  fuente_id: string;
  categoria: string | null;
};

export default async function Informe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: r } = await supabase.from("rendiciones").select("*, fuentes(*)").eq("id", id).single();
  if (!r) notFound();
  const fuente = r.fuentes as { municipalidad: string; formato: string; tipo: string };

  const { data: items } = await supabase
    .from("rendicion_items")
    .select("activo, comprobantes_pago(id, numero, origen, fecha, cheque, beneficiario, concepto, importe, funcion, categoria, fuente_id)")
    .eq("rendicion_id", id);
  const cps = (items ?? [])
    .filter((i) => i.activo || r.estado === "anulada")
    .map((i) => i.comprobantes_pago as unknown as CP)
    .filter(Boolean)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  const totalGastos = cps.reduce((s, c) => s + Number(c.importe), 0);
  const propiosId = ctx.fuentes.find((f) => f.tipo === "propios")?.id;
  const cpsTransferencia = cps.filter((c) => c.fuente_id !== propiosId);
  const cpsPropios = cps.filter((c) => c.fuente_id === propiosId);
  const gastosTransferencia = cpsTransferencia.reduce((s, c) => s + Number(c.importe), 0);
  const gastosPropios = cpsPropios.reduce((s, c) => s + Number(c.importe), 0);

  const { desde, hasta } = rangoPeriodo(r.periodo);
  const { data: ingresos } = await supabase
    .from("ingresos")
    .select("rubro, monto")
    .eq("mcp_id", ctx.mcp.id)
    .eq("estado", "emitido")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  const totalRdr = (ingresos ?? []).reduce((s, i) => s + Number(i.monto), 0);

  const { data: miembros } = await supabase
    .from("miembros")
    .select("rol, perfiles(nombre)")
    .eq("mcp_id", ctx.mcp.id)
    .eq("activo", true)
    .in("rol", ["alcalde", "regidor"]);
  const nombre = (m: { perfiles: unknown }) => (m.perfiles as { nombre: string } | null)?.nombre ?? "";
  const alcalde = (miembros ?? []).filter((m) => m.rol === "alcalde").map(nombre)[0] ?? "";
  const regidores = (miembros ?? []).filter((m) => m.rol === "regidor").map(nombre);
  const cap1 = ctx.mcp.capitulo1 ?? {};
  const mes = nombrePeriodo(r.periodo).toUpperCase();
  const anulada = r.estado === "anulada";

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href={`/rendicion?mes=${r.periodo}&fuente=${r.fuente_id}`}>← Volver</Link>
        <h1>
          Rendición N° {String(r.numero).padStart(3, "0")}-{r.anio} · {fuente.municipalidad} · {nombrePeriodo(r.periodo)}
        </h1>
        <Estado valor={r.estado} />
        <span className="espacio" />
        {r.estado === "generada" && tiene(ctx, "admin", "tesorero") && (
          <form action={marcarEntregada}>
            <input type="hidden" name="id" value={id} />
            <BotonConfirmar className="btn" pregunta="¿Marcar la rendición como entregada?" detalle="Hágalo cuando ya entregó el informe impreso a la municipalidad." textoConfirmar="Sí, ya la entregué">Marcar como entregada</BotonConfirmar>
          </form>
        )}
        {!anulada && tiene(ctx, "admin", "tesorero") && (
          <Motivo accion={anularRendicion} boton="Anular rendición" ayuda="Motivo de la anulación" campos={{ id }} />
        )}
        <a className="btn contorno no-imprimir" href={`/exportar/rendicion?id=${id}`}>Descargar Excel</a>
        <BotonPdf nombre="Informe de rendicion" />
        <BotonImprimir texto="Imprimir informe" />
      </div>
      <div className="no-imprimir">
        <Avisos ok={sp.ok} error={sp.error} />
        {anulada && <div className="aviso error">Rendición anulada: {r.anulado_motivo}</div>}
      </div>

      {fuente.formato === "chanchamayo" ? (
        <div className="hoja">
          <h3 style={{ marginTop: 0 }}>III. INGRESOS Y GASTOS · {ctx.mcp.nombre.toUpperCase()} · {mes}</h3>
          <div style={{ fontWeight: 600 }}>3.1. De los ingresos</div>
          <table className="formato">
            <thead><tr><th>3.1.1. Rubro 13, Donaciones y transferencias</th><th className="num" style={{ width: 140 }}>{mes}</th></tr></thead>
            <tbody>
              <tr><td>Transf. de la {fuente.municipalidad}</td><td className="num">{soles(r.transferencia)}</td></tr>
              <tr><th>Total rubro 13</th><th className="num">{soles(r.transferencia)}</th></tr>
            </tbody>
          </table>
          <table className="formato">
            <thead><tr><th>3.1.2. Rubro 09, Recursos directamente recaudados</th><th className="num" style={{ width: 140 }}>{mes}</th></tr></thead>
            <tbody>
              {[
                ["A) Venta de bienes", ["venta"]],
                ["B) Prestación de servicios", ["servicio", "tasa"]],
                ["C) Alquileres", ["alquiler"]],
                ["D) Otros", ["otro"]],
              ].map(([t, rubros]) => (
                <tr key={t as string}>
                  <td>{t as string}</td>
                  <td className="num">
                    {soles((ingresos ?? []).filter((i) => (rubros as string[]).includes(i.rubro)).reduce((s, i) => s + Number(i.monto), 0))}
                  </td>
                </tr>
              ))}
              <tr><th>Total rubro 09</th><th className="num">{soles(totalRdr)}</th></tr>
              <tr><th>TOTAL INGRESOS</th><th className="num">{soles(Number(r.transferencia) + totalRdr)}</th></tr>
            </tbody>
          </table>

          <div style={{ fontWeight: 600, marginTop: 12 }}>3.2. De los gastos</div>
          <table className="formato">
            <thead><tr><th>Específica de gastos</th><th className="num" style={{ width: 140 }}>Total</th></tr></thead>
            <tbody>
              {FUNCIONES.map((f) => {
                const delaFuncion = cps.filter((c) => c.funcion === f.funcion);
                return [
                  <tr key={f.funcion}>
                    <th>Función: {f.funcion}</th>
                    <th className="num">{soles(delaFuncion.reduce((s, c) => s + Number(c.importe), 0))}</th>
                  </tr>,
                  ...f.categorias.map((cat, i) => (
                    <tr key={f.funcion + cat}>
                      <td style={{ paddingLeft: 22 }}>{i + 1}.- {cat}</td>
                      <td className="num">{soles(delaFuncion.filter((c) => c.categoria === cat).reduce((s, c) => s + Number(c.importe), 0))}</td>
                    </tr>
                  )),
                ];
              })}
              {cps.some((c) => !c.funcion) && (
                <tr>
                  <td className="no">Sin función asignada (corregir antes de entregar)</td>
                  <td className="num no">{soles(cps.filter((c) => !c.funcion).reduce((s, c) => s + Number(c.importe), 0))}</td>
                </tr>
              )}
              <tr><th>TOTAL DEL GASTO</th><th className="num">{soles(totalGastos)}</th></tr>
            </tbody>
          </table>

          <table className="formato">
            <thead><tr><th>Resumen ingresos vs. gastos</th><th className="num" style={{ width: 140 }}>Total</th></tr></thead>
            <tbody>
              <tr><td>Total de ingresos {mes}</td><td className="num">{soles(Number(r.transferencia) + totalRdr)}</td></tr>
              <tr><td>Total de gastos {mes}</td><td className="num">{soles(totalGastos)}</td></tr>
              <tr><th>Saldo</th><th className="num">{soles(Number(r.transferencia) + totalRdr - totalGastos)}</th></tr>
            </tbody>
          </table>

          <div style={{ fontWeight: 600, marginTop: 12 }}>Comprobantes {mes}</div>
          <TablaCps cps={cps} />
          <Firmas nombres={["TESORERO(A)", "ALCALDE"]} />
        </div>
      ) : (
        <div className="hoja">
          <div style={{ textAlign: "center" }}>
            <div className="pequeno tenue">ANEXO N° 02</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>INFORME DE GESTIÓN</div>
          </div>
          <table className="formato">
            <tbody>
              <tr><th style={{ width: 240 }}>Municipalidad centro poblado</th><td>{ctx.mcp.nombre.toUpperCase()}</td></tr>
              <tr><th>Mes de rendición</th><td>{mes}</td></tr>
              <tr><th>Nombre del alcalde</th><td>{alcalde}</td></tr>
              <tr><th>Nombre de los regidores</th><td>{regidores.map((x) => <div key={x}>{x}</div>)}</td></tr>
            </tbody>
          </table>

          <h3>CAPÍTULO I: DE LA GESTIÓN MUNICIPAL</h3>
          <table className="formato">
            <tbody>
              <tr><th colSpan={2}>1.1 Generalidades</th></tr>
              {CAMPOS_CAPITULO1.map((c) => (
                <tr key={c.clave}><td style={{ width: 240 }}>{c.titulo}</td><td>{cap1[c.clave] ?? ""}</td></tr>
              ))}
              <tr><th colSpan={2}>1.2 Objetivos alcanzados</th></tr>
              <tr><td colSpan={2} style={{ whiteSpace: "pre-line" }}>{cap1.objetivos ?? ""}</td></tr>
              <tr><th colSpan={2}>1.3 Limitaciones para alcanzar los objetivos</th></tr>
              <tr><td colSpan={2} style={{ whiteSpace: "pre-line" }}>{cap1.limitaciones ?? ""}</td></tr>
              <tr><th colSpan={2}>1.4 Medidas tomadas para superar las limitaciones</th></tr>
              <tr><td colSpan={2} style={{ whiteSpace: "pre-line" }}>{cap1.medidas ?? ""}</td></tr>
            </tbody>
          </table>

          <h3>CAPÍTULO II: DE LOS INGRESOS Y GASTOS</h3>
          <div style={{ fontWeight: 600 }}>2.1 Recursos de la transferencia recibida</div>
          <table className="formato">
            <thead><tr><th>Ingresos</th><th className="num" style={{ width: 140 }}>Importe S/</th></tr></thead>
            <tbody>
              <tr><td>Ingresos del mes reportado · {fuente.municipalidad}</td><td className="num">{soles(r.transferencia)}</td></tr>
              <tr><th>Total ingresos del mes</th><th className="num">{soles(r.transferencia)}</th></tr>
            </tbody>
          </table>
          <TablaCps cps={cpsTransferencia} />
          <table className="formato" style={{ maxWidth: 480 }}>
            <thead><tr><th colSpan={2}>Saldos</th></tr></thead>
            <tbody>
              <tr><td>Total ingresos</td><td className="num">{soles(r.transferencia)}</td></tr>
              <tr><td>Total gastos</td><td className="num">{soles(gastosTransferencia)}</td></tr>
              <tr><th>Saldo del mes</th><th className="num">{soles(Number(r.transferencia) - gastosTransferencia)}</th></tr>
            </tbody>
          </table>

          <div style={{ fontWeight: 600, marginTop: 14 }}>2.2 Recursos directamente recaudados</div>
          <table className="formato">
            <thead><tr><th>Ingresos</th><th className="num" style={{ width: 140 }}>Importe S/</th></tr></thead>
            <tbody>
              {RUBROS_INGRESO.map((rb) => {
                const v = (ingresos ?? []).filter((i) => i.rubro === rb.codigo).reduce((s, i) => s + Number(i.monto), 0);
                return v ? <tr key={rb.codigo}><td>{rb.nombre}</td><td className="num">{soles(v)}</td></tr> : null;
              })}
              <tr><th>Total ingresos del mes (copias, cuotas de los pobladores, etc.)</th><th className="num">{soles(totalRdr)}</th></tr>
            </tbody>
          </table>
          <div style={{ fontWeight: 600, marginTop: 8 }}>Gastos con recursos directamente recaudados</div>
          {cpsPropios.length > 0 ? (
            <TablaCps cps={cpsPropios} />
          ) : (
            <table className="formato"><tbody><tr><td>Sin gastos con estos recursos en el mes</td><td className="num" style={{ width: 140 }}>0.00</td></tr></tbody></table>
          )}
          <table className="formato" style={{ maxWidth: 480 }}>
            <thead><tr><th colSpan={2}>Saldos</th></tr></thead>
            <tbody>
              <tr><td>Total ingresos</td><td className="num">{soles(totalRdr)}</td></tr>
              <tr><td>Total gastos</td><td className="num">{soles(gastosPropios)}</td></tr>
              <tr><th>Saldo del mes</th><th className="num">{soles(totalRdr - gastosPropios)}</th></tr>
            </tbody>
          </table>
          <Firmas nombres={["TESORERO(A)", "ALCALDE"]} />
        </div>
      )}
      <p className="pequeno tenue no-imprimir">Generada el {fechaHora(r.creado_en)}.</p>
    </>
  );
}

function TablaCps({ cps }: { cps: CP[] }) {
  const total = cps.reduce((s, c) => s + Number(c.importe), 0);
  return (
    <table className="formato">
      <thead>
        <tr><th>N°</th><th>Fecha doc.</th><th>N° CP</th><th>N° cheque</th><th>Razón social</th><th>Detalle del gasto</th><th className="num">Importe S/</th></tr>
      </thead>
      <tbody>
        {cps.map((c, i) => (
          <tr key={c.id}>
            <td>{i + 1}</td>
            <td>{fecha(c.fecha)}</td>
            <td>{codigoCP(c.numero, c.origen)}</td>
            <td>{c.cheque}</td>
            <td>{c.beneficiario}</td>
            <td>{c.concepto}</td>
            <td className="num">{soles(c.importe)}</td>
          </tr>
        ))}
        <tr><th colSpan={6}>Total gastos del mes</th><th className="num">{soles(total)}</th></tr>
      </tbody>
    </table>
  );
}
