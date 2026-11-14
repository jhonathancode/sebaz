import type { CpContable, DatosContables, IngresoPropio } from "@/lib/contabilidad";

export type Asiento = { fecha: string; cuenta: string; debe: number; haber: number };

const tiene = (t: string, re: RegExp) => re.test(t.toUpperCase());

/** Cuenta de ingreso (4xxx) según el rubro y el concepto del recibo. */
export function cuentaIngreso(i: IngresoPropio): string {
  const t = `${i.concepto} ${i.pagador}`;
  if (i.rubro === "venta") return tiene(t, /AGREGAD|ARENA|PIEDRA|GRAVA/) ? "4301.040109" : tiene(t, /ALIMENT|POLLADA|COMIDA|BEBIDA|REFRESCO/) ? "4301.040101" : "4301.090109";
  if (i.rubro === "alquiler" || i.rubro === "servicio") {
    if (tiene(t, /ALQUILER/)) return tiene(t, /TERRENO/) ? "4303.050102" : tiene(t, /LOCAL|SALON|COMUNAL|EDIFIC/) ? "4303.050101" : "4303.050199";
    if (tiene(t, /CEMENTERIO|FUNER/)) return "4303.090216";
    if (tiene(t, /ENERG|LUZ/)) return "4303.090218";
    if (tiene(t, /LIMPIEZA/)) return "4303.090223";
    if (tiene(t, /SERENAZGO/)) return "4303.090224";
    if (tiene(t, /HIGIEN|BAÑO|BANO/)) return "4303.090201";
    if (tiene(t, /BIBLIOTECA/)) return "4303.030199";
    if (tiene(t, /DEPORT|RECREA|CULTUR|ANIVERSARIO/)) return "4303.030299";
    return i.rubro === "alquiler" ? "4303.050199" : "4303.090209";
  }
  if (i.rubro === "tasa") {
    if (tiene(t, /ACTA|NACIMIENTO|DEFUNCI|MATRIMONIO|REGISTRO CIVIL|PARTIDA/)) return "4302.010101";
    if (tiene(t, /LICENCIA/)) return "4302.010103";
    if (tiene(t, /DOMICILI/)) return "4302.010401";
    if (tiene(t, /CONSTANCIA|POSESI|AGRAR|AGRIC/)) return "4302.0601";
    if (tiene(t, /SANIDAD|CARNET|SANITARI/)) return "4302.040105";
    if (tiene(t, /EMPADRON|INSCRIPC/)) return "4302.090101";
    if (tiene(t, /SANEAMIENTO FISICO|SANEAMIENTO FÍSICO|LOTE/)) return "4302.050203";
    if (tiene(t, /AUTORIZ/)) return "4302.090108";
    if (tiene(t, /COPIA|TIPEO|IMPRESI|FORMULARIO/)) return "4302.100199";
    return "4302.010499";
  }
  return tiene(t, /LOTE|TERRENO/) ? "4501.0301" : "4505.010499";
}

/** Cuenta por cobrar que acompaña al ingreso (se abre y se cierra con el cobro). */
export function cuentaPorCobrar(cuentaIng: string): string {
  if (cuentaIng.startsWith("4301")) return "1201.0301";
  if (cuentaIng.startsWith("4302")) return "1201.0302";
  if (cuentaIng.startsWith("4303")) return "1201.0303";
  if (cuentaIng.startsWith("4501")) return "1201.0403";
  return "1202.98";
}

/** Cuenta del gasto (5xxx) o del activo (1xxx) según la partida y el concepto del comprobante. */
export function cuentaGasto(c: CpContable): string {
  const p = c.partida;
  const t = `${c.concepto} ${c.beneficiario}`;
  if (p.startsWith("2.1")) return "5101.1001";
  if (p.startsWith("2.5") || tiene(t, /SUBVENCI/)) return "5503.010103";
  if (p.startsWith("2.6")) return tiene(t, /VEHICUL|MOTO|CAMION/) ? "1503.0101" : tiene(t, /COMPUTAD|LAPTOP|IMPRESORA|EQUIPO DE COMPUTO|CELULAR/) ? "1503.020301" : tiene(t, /MUEBLE|ESCRITORIO|SILLA|MESA|ARCHIVADOR/) ? "1503.020102" : tiene(t, /EXPEDIENTE TECNICO|EXPEDIENTE TÉCNICO/) ? "1505.02" : tiene(t, /CONSTRUC|OBRA|LOZA|PARQUE|PUENTE|CAMINO|TROCHA/) ? "1501.089904" : "1503.020999";
  if (tiene(t, /DIETA/)) return "5101.1001";
  if (c.tipoGasto === "servicio" || p.startsWith("2.3") && c.tipoGasto !== "compra") {
    if (tiene(t, /SECRETARI|PERSONAL ADMIN|CONTRATO DE ADMIN/)) return "5302.0801";
    if (tiene(t, /VIATIC|HOSPEDAJE|ALOJAMIENTO/)) return "5302.010202";
    if (tiene(t, /PASAJE|MOVILIDAD|TRANSPORTE DE PERSONAL/)) return "5302.010201";
    if (tiene(t, /ENERGIA|ENERGÍA|\bLUZ\b/)) return "5302.020101";
    if (tiene(t, /\bAGUA\b|DESAGUE/)) return "5302.020102";
    if (tiene(t, /INTERNET/)) return "5302.020203";
    if (tiene(t, /TELEFON|CELULAR|MOVIL/)) return "5302.020201";
    if (tiene(t, /RADIO|DIFUSI|PUBLICIDAD|AVISO/)) return "5302.020401";
    if (tiene(t, /IMPRENTA|IMPRESI|COPIAS|ANILLAD|EMPASTAD/)) return "5302.020404";
    if (tiene(t, /LIMPIEZA/)) return "5302.030101";
    if (tiene(t, /VEHICUL|MOVILIDAD.*MANTEN|MANTENIMIENTO.*VEH/)) return "5302.040103";
    if (tiene(t, /MANTENIMIENTO|REPARACI/)) return "5302.040101";
    if (tiene(t, /ALQUILER/)) return "5302.050199";
    if (tiene(t, /NOTARI|LEGALIZ/)) return "5302.060102";
    if (tiene(t, /BANCO|COMISION|COMISIÓN|\bITF\b|MANTENIMIENTO DE CUENTA/)) return "5302.060201";
    if (tiene(t, /SOAT|SEGURO/)) return "5302.060301";
    if (tiene(t, /CONTAD|CONTABLE/)) return "5302.070102";
    if (tiene(t, /ASESOR|CONSULT|LEGAL|ABOGAD/)) return "5302.070102";
    if (tiene(t, /SOPORTE|INFORMAT|SISTEMA/)) return "5302.070403";
    if (tiene(t, /CELEBRA|ANIVERSARIO|NAVIDAD|PASACALLE|ATENCION/)) return "5302.071099";
    if (tiene(t, /FLETE|TRANSPORTE DE CARGA|ACARREO/)) return "5302.071102";
    if (tiene(t, /JARDIN/)) return "5302.071103";
    if (tiene(t, /PREPARACION DE ALIMENT|PREPARACIÓN DE ALIMENT|ALMUERZO|REFRIGERIO/)) return "5302.071105";
    return "5302.071199";
  }
  if (tiene(t, /ALIMENT|REFRIGERIO|ALMUERZO|BEBIDA|PAN\b|POLLO|ARROZ/)) return "5301.0101";
  if (tiene(t, /VESTUARIO|POLO|CHALECO|UNIFORME|INDUMENTARIA|GORRA|CHOMPA/)) return "5301.020101";
  if (tiene(t, /COMBUSTIBLE|GASOLINA|PETROLEO|DIESEL|GLP/)) return "5301.0301";
  if (tiene(t, /MEDICIN|FARMAC|BOTIQUIN|MEDICAMENT/)) return "5301.080102";
  if (tiene(t, /FERTILIZ|HERBICIDA|ABONO|INSECTICIDA/)) return "5301.1004";
  if (tiene(t, /REPUESTO|LLANTA|NEUMATIC/)) return "5301.0601";
  if (tiene(t, /LIMPIEZA|ESCOBA|DETERGENTE|LEJIA/)) return "5301.050301";
  if (tiene(t, /COCINA|MENAJE|VAJILLA/)) return "5301.050302";
  if (tiene(t, /UTILES|ÚTILES|ESCRITORIO|PAPEL|TINTA|TONER|LAPICERO|FOLDER|OFICINA/)) return "5301.050102";
  if (tiene(t, /FERRETER|CEMENTO|CLAVO|PINTURA|CALAMINA|MADERA|TUBO|CABLE|MATERIALES DE ACONDIC/)) return "5301.1105";
  return "5301.9999";
}

export const CUENTA_BANCO = "1101.030102";
export const CUENTA_CAJA = "1101.0101";
const POR_PAGAR_BIENES = "2103.010101";
const POR_PAGAR_SERVICIOS = "2103.010102";
const POR_PAGAR_ACTIVOS = "2103.02";

/** Todos los asientos del año, hechos con lo ya registrado: transferencias, recibos y comprobantes. */
export function asientosDelAnio(d: DatosContables): Asiento[] {
  const a: Asiento[] = [];
  const par = (fecha: string, debe: string, haber: string, monto: number) => {
    if (!monto) return;
    a.push({ fecha, cuenta: debe, debe: monto, haber: 0 });
    a.push({ fecha, cuenta: haber, debe: 0, haber: monto });
  };
  d.transferencias.forEach((t) => par(t.fecha, CUENTA_BANCO, "4401.010303", t.monto));
  d.ingresos.forEach((i) => {
    const ing = cuentaIngreso(i);
    const cob = cuentaPorCobrar(ing);
    par(i.fecha, cob, ing, i.monto);
    par(i.fecha, CUENTA_CAJA, cob, i.monto);
  });
  d.cps.forEach((c) => {
    const gasto = cuentaGasto(c);
    const pagar = gasto.startsWith("1") ? POR_PAGAR_ACTIVOS : gasto.startsWith("5301") ? POR_PAGAR_BIENES : POR_PAGAR_SERVICIOS;
    par(c.fecha, gasto, pagar, c.importe);
    par(c.fecha, pagar, c.propio ? CUENTA_CAJA : CUENTA_BANCO, c.liquido);
  });
  return a;
}
