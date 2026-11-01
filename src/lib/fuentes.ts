import type { Fuente } from "@/lib/contexto";

export const FRECUENCIAS = [
  { v: "mensual", t: "Mensual", cada: 1 },
  { v: "trimestral", t: "Trimestral", cada: 3 },
  { v: "semestral", t: "Semestral", cada: 6 },
  { v: "anual", t: "Anual", cada: 12 },
] as const;

export const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];

export const textoFrecuencia = (f: Pick<Fuente, "frecuencia">) => FRECUENCIAS.find((x) => x.v === (f.frecuencia ?? "mensual"))?.t ?? "Mensual";

/** ¿Le toca transferencia a esta fuente en el mes dado ("2026-11")? */
export function tocaEnMes(f: Pick<Fuente, "frecuencia" | "mes_inicio">, periodo: string): boolean {
  const cada = FRECUENCIAS.find((x) => x.v === (f.frecuencia ?? "mensual"))?.cada ?? 1;
  if (cada === 1) return true;
  const mes = Number(periodo.slice(5, 7));
  const inicio = Number(f.mes_inicio ?? 1);
  return (((mes - inicio) % cada) + cada) % cada === 0;
}

/** Lo que se espera transferir en ese mes: el monto de cada transferencia si toca, y cero si no. */
export function montoDelMes(f: Pick<Fuente, "monto_mensual" | "frecuencia" | "mes_inicio">, periodo: string): number {
  return tocaEnMes(f, periodo) ? Number(f.monto_mensual) : 0;
}

/** Etiqueta corta del tipo de fuente. */
export function etiquetaFuente(f: { tipo: string }): string {
  return f.tipo === "distrito" ? "Distrito" : f.tipo === "provincia" ? "Provincia" : f.tipo === "propios" ? "Ingresos propios" : "Otra fuente";
}
