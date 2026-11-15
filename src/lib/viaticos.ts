export const CONCEPTOS_VIAJE = [
  { v: "pasaje", t: "Pasaje" },
  { v: "hospedaje", t: "Hospedaje" },
  { v: "alimentacion", t: "Alimentación" },
  { v: "movilidad", t: "Movilidad local" },
  { v: "otro", t: "Otros gastos" },
] as const;
export const UNIDADES_VIAJE = [
  { v: "viaje", t: "por trayecto" },
  { v: "noche", t: "por noche" },
  { v: "dia", t: "por día" },
] as const;
export const nombreConcepto = (v: string) => CONCEPTOS_VIAJE.find((c) => c.v === v)?.t ?? v;
export const nombreUnidad = (v: string) => UNIDADES_VIAJE.find((c) => c.v === v)?.t ?? v;

/** Días de la comisión (salida y retorno cuentan): 12 al 14 = 3 días y 2 noches. */
export function diasComision(salida: string, retorno: string): { dias: number; noches: number } {
  const d = Math.round((Date.parse(retorno) - Date.parse(salida)) / 86400000) + 1;
  const dias = Number.isFinite(d) && d > 0 ? d : 1;
  return { dias, noches: dias - 1 };
}
/** Cantidad sugerida de cada tarifa según su unidad. */
export function cantidadSugerida(unidad: string, salida: string, retorno: string): number {
  const { dias, noches } = diasComision(salida, retorno);
  return unidad === "viaje" ? 2 : unidad === "noche" ? Math.max(noches, 1) : dias;
}
