import SelectFuncion from "@/components/SelectFuncion";
import { CLASIFICADORES, SUSTENTOS } from "@/lib/catalogos";

export type ComprobanteEditable = {
  fecha: string;
  concepto: string;
  partida: string | null;
  funcional: string | null;
  funcion: string | null;
  categoria: string | null;
  deducciones: number | string;
  sustento_tipo: string | null;
  sustento_numero: string | null;
};

/** Campos para corregir un comprobante en borrador (los usa la ventana «No, corregir»). */
export default function CamposEditarComprobante({ id, c }: { id: string; c: ComprobanteEditable }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <div className="rejilla-2">
        <label className="campo">Fecha<input type="date" name="fecha" defaultValue={c.fecha} /></label>
        <label className="campo">
          Documento que entregó el proveedor
          <select name="sustento_tipo" defaultValue={c.sustento_tipo ?? ""}>
            <option value="">—</option>
            {SUSTENTOS.map((x) => (
              <option key={x.codigo} value={x.codigo}>{x.nombre}</option>
            ))}
          </select>
        </label>
        <label className="campo">N° del documento<input name="sustento_numero" defaultValue={c.sustento_numero ?? ""} placeholder="Ej.: F001-45" /></label>
        <label className="campo">Deducciones S/<input name="deducciones" defaultValue={c.deducciones} inputMode="decimal" /></label>
        <SelectFuncion valor={c.funcion && c.categoria ? `${c.funcion}|${c.categoria}` : ""} />
        <label className="campo">
          Partida
          <select name="partida" defaultValue={c.partida ?? ""}>
            <option value="">—</option>
            {CLASIFICADORES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="campo">Concepto<textarea name="concepto" defaultValue={c.concepto} /></label>
      <label className="campo">Funcional<input name="funcional" defaultValue={c.funcional ?? ""} /></label>
    </>
  );
}
