import SelectFuncion from "@/components/SelectFuncion";
import { nombreFuente } from "./CamposRequerimiento";
import SugerenciaConcepto from "./SugerenciaConcepto";
import { CLASIFICADORES, SUSTENTOS } from "@/lib/catalogos";
import type { Fuente } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";

/** Comprobante de pago sin expediente: dietas, honorarios, servicios mensuales. */
export default function CamposComprobanteDirecto({ fuentes, chequeSugerido = "" }: { fuentes: Fuente[]; chequeSugerido?: string }) {
  return (
    <>
      <div className="aviso info pequeno">
        Para pagos que no pasan por requerimiento: dietas de regidores, honorarios de la tesorera o el contador, servicios
        mensuales. Las compras van por Expedientes; la caja chica, por su liquidación.
      </div>
      <div className="rejilla">
        <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
        <label className="campo">
          Se paga con
          <select name="fuente_id" required>
            {fuentes.map((f) => (
              <option key={f.id} value={f.id}>{nombreFuente(f)}</option>
            ))}
          </select>
        </label>
        <label className="campo">Beneficiario<input name="beneficiario" required /></label>
        <label className="campo">DNI o RUC<input name="beneficiario_doc" inputMode="numeric" /></label>
        <label className="campo ancho">Concepto<input name="concepto" required placeholder="Pago de dieta de regidor, mes de octubre 2026" /></label>
        <div className="ancho"><SugerenciaConcepto campo="concepto" tambienItem={false} /></div>
        <label className="campo">Importe S/<input name="importe" required inputMode="decimal" /></label>
        <label className="campo">Deducciones S/<input name="deducciones" inputMode="decimal" defaultValue="0" /></label>
        <label className="campo">
          Partida
          <select name="partida" defaultValue="2.3 Bienes y servicios">
            {CLASIFICADORES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <SelectFuncion />
        <label className="campo">
          Sustento
          <select name="sustento_tipo" defaultValue="RH">
            {SUSTENTOS.map((s) => (
              <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
            ))}
          </select>
        </label>
        <label className="campo">N° del sustento<input name="sustento_numero" placeholder="E001-12" /></label>
        <label className="campo">N° de cheque<input name="cheque" inputMode="numeric" pattern="\d{4,12}" defaultValue={chequeSugerido} placeholder="Si ya lo giró; si no, después" /></label>
      </div>
    </>
  );
}
