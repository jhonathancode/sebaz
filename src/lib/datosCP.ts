import { SUSTENTOS } from "@/lib/catalogos";
import type { Mcp } from "@/lib/contexto";

/** Los 12 códigos de la codificación programática, en el orden del comprobante. */
export const CAMPOS_CODIF = [
  { k: "rb", t: "RB" },
  { k: "sec", t: "SEC" },
  { k: "f", t: "F" },
  { k: "cp", t: "CP" },
  { k: "prg", t: "PRG" },
  { k: "prod", t: "PROD/PRY" },
  { k: "act", t: "ACT/AI/OBR" },
  { k: "fn", t: "FN" },
  { k: "divf", t: "DIVF" },
  { k: "grpf", t: "GRPF" },
  { k: "meta", t: "META" },
  { k: "final", t: "FINAL" },
] as const;
export type ClaveCodif = (typeof CAMPOS_CODIF)[number]["k"];
export type Codificacion = Record<ClaveCodif, string>;

export type DatosCPMcp = {
  codif: Record<string, Partial<Codificacion>>;
  cuenta_debe: string;
  cuenta_haber: string;
  cci: string;
  tipo_operacion_bs: string;
  tipo_operacion_otro: string;
};

export const TIPO_OPERACION_BS = "GASTO - ADQUISICION DE BIENES Y SERVICIOS";
export const TIPO_OPERACION_OTRO = "GASTO - OTROS GASTOS DEFINITIVOS (SIN PROVEEDOR)";

/** Lo guardado en Configuración → Comprobante de pago (con valores vacíos si aún no se llenó). */
export function datosCPDe(mcp: Mcp): DatosCPMcp {
  const d = ((mcp as { datos_cp?: unknown }).datos_cp ?? {}) as Partial<DatosCPMcp>;
  return {
    codif: d.codif ?? {},
    cuenta_debe: d.cuenta_debe ?? "",
    cuenta_haber: d.cuenta_haber ?? "",
    cci: d.cci ?? "",
    tipo_operacion_bs: d.tipo_operacion_bs || TIPO_OPERACION_BS,
    tipo_operacion_otro: d.tipo_operacion_otro || TIPO_OPERACION_OTRO,
  };
}

/** Datos del expediente que se necesitan para el concepto y la codificación del comprobante. */
export type ExtraCP = {
  expediente?: string | null;
  orden?: string | null;
  sustentoTipo?: string | null;
  sustentoNumero?: string | null;
  meta?: string | null;
  fuenteId?: string | null;
  tipoGasto?: string | null;
};

const num3 = (n: number | null | undefined) => String(n ?? 0).padStart(3, "0");

/** Arma el ExtraCP desde el comprobante, su expediente y su orden (cualquiera puede faltar). */
export function extraDe(
  cp: { sustento_tipo?: string | null; sustento_numero?: string | null; fuente_id?: string | null } | null | undefined,
  exp?: { numero?: number | null; anio?: number | null; meta?: string | null; tipo?: string | null; fuente_id?: string | null } | null,
  orden?: { tipo?: string | null; numero?: number | null; anio?: number | null } | null,
): ExtraCP {
  return {
    expediente: exp?.numero ? `${num3(exp.numero)}-${exp.anio}` : null,
    orden: orden?.numero ? `${orden.tipo === "compra" ? "O/C" : "O/S"} N° ${num3(orden.numero)}-${orden.anio}` : null,
    sustentoTipo: cp?.sustento_tipo ?? null,
    sustentoNumero: cp?.sustento_numero ?? null,
    meta: exp?.meta ?? null,
    fuenteId: cp?.fuente_id ?? exp?.fuente_id ?? null,
    tipoGasto: exp?.tipo ?? null,
  };
}

const ABREV: Record<string, string> = { FAC: "FACT.", BV: "B/V", BVE: "B/V ELECT.", REC: "RECIBO", RH: "R.H.", TICKET: "TICKET", DJ: "D.J.", PM: "PLANILLA DE MOVILIDAD" };

/** Concepto completo, como se escribe en el comprobante: girado, documento, motivo, requerimiento, orden y meta. */
export function conceptoAmpliado(concepto: string, cheque: string | null, extra?: ExtraCP | null): string {
  const partes: string[] = [];
  if (cheque) partes.push(`POR EL GIRADO DE LA D/C ${cheque}`);
  if (extra?.sustentoTipo && extra?.sustentoNumero) {
    const nombre = ABREV[extra.sustentoTipo] ?? SUSTENTOS.find((s) => s.codigo === extra.sustentoTipo)?.nombre ?? extra.sustentoTipo;
    partes.push(`${nombre.toUpperCase()} N° ${extra.sustentoNumero}`);
  }
  const motivo = concepto.replace(/^\s*se\s+requiere\s+/i, "").trim();
  partes.push(`${cheque || extra?.sustentoNumero ? "POR " : ""}${motivo}`.trim());
  if (extra?.expediente) partes.push(`SEGUN REQUERIMIENTO N° ${extra.expediente}`);
  if (extra?.orden) partes.push(extra.orden);
  if (extra?.meta) partes.push(`META: ${extra.meta}`);
  return partes.join(", ");
}

/** Qué falta llenar en Configuración para que el comprobante salga completo. */
export function faltantesCP(mcp: Mcp, fuenteId?: string | null): string[] {
  const d = datosCPDe(mcp);
  const f: string[] = [];
  const cod = fuenteId ? d.codif[fuenteId] : undefined;
  if (!cod || !CAMPOS_CODIF.some((c) => (cod[c.k] ?? "").trim())) f.push("codificación programática");
  if (!d.cuenta_debe.trim() || !d.cuenta_haber.trim()) f.push("cuentas contables (debe y haber)");
  if (!mcp.banco_cuenta) f.push("cuenta del banco");
  if (!d.cci.trim()) f.push("CCI");
  return f;
}
