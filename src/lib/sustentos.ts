import { SUSTENTOS } from "@/lib/catalogos";

/** Tipos de gasto para los que se elige qué comprobante entrega el proveedor. */
export const GASTOS_SUSTENTO = [
  { clave: "compra", texto: "Compra de bienes" },
  { clave: "servicio", texto: "Servicios" },
  { clave: "pago_fijo", texto: "Pagos fijos (si el pago fijo no tiene los suyos)" },
] as const;

/** Lo que se permite mientras la MCP no configure nada. El primero es el que sale marcado. */
export const SUSTENTOS_BASE: Record<string, string[]> = {
  compra: ["FAC", "BVE", "BV"],
  servicio: ["FAC", "BVE", "BV", "RH", "REC"],
  pago_fijo: ["REC", "RH", "FAC", "BVE", "BV", "PL"],
};

/** Los que se pueden elegir al configurar (sin la declaración jurada ni la planilla de movilidad, que son de caja chica). */
const ORDEN_ELEGIBLES = ["FAC", "BVE", "BV", "RH", "REC", "PL"];
export const SUSTENTOS_ELEGIBLES = ORDEN_ELEGIBLES.map((c) => SUSTENTOS.find((s) => s.codigo === c)).filter((s): s is { codigo: string; nombre: string } => !!s);

export type ReglasSustento = { compra: string[]; servicio: string[]; pago_fijo: string[]; porPagoFijo: Record<string, string[]> };

/** Reglas de la MCP: lo configurado o, si no hay, lo base. */
export function reglasSustento(config: Record<string, string[]> | null | undefined, pagosFijos: { id: string; sustentos?: string[] }[]): ReglasSustento {
  const de = (k: string) => (config?.[k]?.length ? config[k] : SUSTENTOS_BASE[k]);
  return {
    compra: de("compra"),
    servicio: de("servicio"),
    pago_fijo: de("pago_fijo"),
    porPagoFijo: Object.fromEntries(pagosFijos.filter((p) => p.sustentos?.length).map((p) => [p.id, p.sustentos as string[]])),
  };
}

/** Documentos permitidos para un gasto, en el orden de la regla (el primero es el que sale marcado). */
export function sustentosPara(reglas: ReglasSustento | null | undefined, tipo: string, pagoFijoId?: string | null): { codigo: string; nombre: string }[] {
  const r = reglas ?? reglasSustento(null, []);
  const codigos = (pagoFijoId && r.porPagoFijo[pagoFijoId]) || (r as unknown as Record<string, string[]>)[tipo] || SUSTENTOS_BASE.servicio;
  // En el orden del catálogo: el primero es el que sale marcado
  return SUSTENTOS_ELEGIBLES.filter((s) => codigos.includes(s.codigo));
}
