export const BILLETES = ["200", "100", "50", "20", "10"];
export const MONEDAS = ["5", "2", "1", "0.50", "0.20", "0.10"];
export const DENOMINACIONES = [...BILLETES, ...MONEDAS];

/** Suma el conteo de billetes y monedas: { "100": 2, "0.50": 3 } → 201.50 */
export function sumarConteo(conteo: Record<string, number>): number {
  const c = DENOMINACIONES.reduce((s, d) => s + Math.round(Number(d) * 100) * Math.max(0, Math.floor(Number(conteo[d]) || 0)), 0);
  return c / 100;
}
