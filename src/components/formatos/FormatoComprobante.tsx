import Encabezado from "@/components/Encabezado";
import type { Mcp } from "@/lib/contexto";
import { enLetras, fecha, soles } from "@/lib/formato";

export type DatosCP = {
  numero: number;
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

/** Formato del comprobante de pago, tal como se imprime. */
export default function FormatoComprobante({ c, mcp }: { c: DatosCP; mcp: Mcp }) {
  const liquido = Number(c.importe) - Number(c.deducciones);
  const iniciales = (c.hecho_por ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const ctx = { mcp };
  return (
    <div className="hoja">
      <Encabezado mcp={ctx.mcp} titulo="COMPROBANTE DE PAGO" numero={`N° ${String(c.numero).padStart(3, "0")} · Fecha ${fecha(c.fecha)}`} />
      <table className="formato">
        <tbody>
          <tr><td className="etiqueta" style={{ width: 100 }}>Nombre</td><td>{c.beneficiario}{c.beneficiario_doc && ` · ${c.beneficiario_doc}`}</td></tr>
          <tr><td className="etiqueta">Son</td><td>{enLetras(liquido)}</td></tr>
          <tr><td className="etiqueta">Concepto</td><td>{c.concepto}</td></tr>
        </tbody>
      </table>
      <table className="formato">
        <thead>
          <tr><th colSpan={8}>Codificación programática</th><th colSpan={2}>Estadística del objeto del gasto</th></tr>
          <tr><th>Sector</th><th>Pliego</th><th>Programa</th><th>Subprograma</th><th>Proyecto</th><th>Obra</th><th>Pto.</th><th>Funcional</th><th>Partida</th><th className="num">Importe</th></tr>
        </thead>
        <tbody>
          <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>{c.funcional ?? ""}</td><td>{c.partida ?? ""}</td><td className="num">{soles(c.importe)}</td></tr>
        </tbody>
      </table>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <table className="formato" style={{ flex: "1 1 260px", width: "auto" }}>
          <thead><tr><th colSpan={4}>Contabilidad presupuestal</th></tr><tr><th>Debe</th><th className="num">Importe</th><th>Haber</th><th className="num">Importe</th></tr></thead>
          <tbody><tr><td></td><td className="num">{soles(c.importe)}</td><td></td><td className="num">{soles(c.importe)}</td></tr></tbody>
        </table>
        <table className="formato" style={{ flex: "1 1 260px", width: "auto" }}>
          <thead><tr><th colSpan={4}>Contabilidad patrimonial</th></tr><tr><th>Debe</th><th className="num">Importe</th><th>Haber</th><th className="num">Importe</th></tr></thead>
          <tbody><tr><td></td><td className="num">{soles(c.importe)}</td><td></td><td className="num">{soles(c.importe)}</td></tr></tbody>
        </table>
        <table className="formato" style={{ flex: "1 1 200px", width: "auto" }}>
          <tbody>
            <tr><td className="etiqueta">Total</td><td className="num">{soles(c.importe)}</td></tr>
            <tr><td className="etiqueta">Deducciones</td><td className="num">{soles(c.deducciones)}</td></tr>
            <tr><td className="etiqueta">Líquido a pagar</td><td className="num"><b>{soles(liquido)}</b></td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <table className="formato" style={{ flex: "1 1 300px", width: "auto" }}>
          <thead><tr><th colSpan={3}>Para uso del tesorero</th></tr><tr><th>Fecha</th><th>Hecho por</th><th>Conforme</th></tr></thead>
          <tbody>
            <tr><td>{fecha(c.fecha)}</td><td>{iniciales}</td><td className="firma"></td></tr>
            <tr><td colSpan={3} className="etiqueta firma">Visación</td></tr>
          </tbody>
        </table>
        <table className="formato" style={{ flex: "1 1 300px", width: "auto" }}>
          <thead><tr><th colSpan={2}>Forma de pago</th></tr></thead>
          <tbody>
            <tr><td className="etiqueta">N° cuenta</td><td>{ctx.mcp.banco_cuenta ?? ""}</td></tr>
            <tr><td className="etiqueta">N° de cheque</td><td>{c.cheque ?? ""}</td></tr>
            <tr><td className="etiqueta">Fondos para pagos en efectivo</td><td></td></tr>
            <tr><td className="etiqueta">Autorizado / firma</td><td className="firma"></td></tr>
          </tbody>
        </table>
      </div>
      <table className="formato">
        <thead><tr><th colSpan={4}>Recibí conforme</th></tr></thead>
        <tbody>
          <tr><td className="etiqueta">Fecha</td><td className="etiqueta">Firma</td><td className="etiqueta">D.N.I.</td><td className="etiqueta">R.U.C. · L.M.</td></tr>
          <tr><td className="firma"></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>
  );
}
