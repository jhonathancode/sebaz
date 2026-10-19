import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import SelectFuncion from "@/components/SelectFuncion";
import { CLASIFICADORES, SUSTENTOS } from "@/lib/catalogos";
import { contextoMcp } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";
import { crearComprobanteDirecto } from "../acciones";

export default async function NuevoComprobante({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  return (
    <>
      <div className="titulo-ventana">
        <h1>Nuevo comprobante de pago directo</h1>
        <span className="espacio" />
        <Link className="btn" href="/comprobantes">Volver</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="aviso info">
        Para pagos que no pasan por requerimiento: dietas de regidores, honorarios de la tesorera o el contador, servicios
        mensuales. Las compras van por Expedientes; la caja chica, por su liquidación.
      </div>
      <form action={crearComprobanteDirecto} className="panel">
        <div className="panel-cab">Datos del comprobante</div>
        <div className="panel-cuerpo rejilla">
          <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoyISO()} required /></label>
          <label className="campo">
            Municipalidad que transfiere
            <select name="fuente_id" required>
              {ctx.fuentes.map((f) => (
                <option key={f.id} value={f.id}>{f.municipalidad}</option>
              ))}
            </select>
          </label>
          <label className="campo">Beneficiario<input name="beneficiario" required /></label>
          <label className="campo">DNI o RUC<input name="beneficiario_doc" inputMode="numeric" /></label>
          <label className="campo ancho">Concepto<input name="concepto" required placeholder="Pago de dieta de regidor, mes de octubre 2026" /></label>
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
          <div className="ancho"><button className="btn primario" type="submit">Guardar en borrador</button></div>
        </div>
      </form>
    </>
  );
}
