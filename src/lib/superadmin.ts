import { hoyISO } from "./formato";

export type EstadoCliente = { clave: "suspendida" | "vencida" | "gracia" | "por_vencer" | "prueba" | "al_dia" | "sin_plan"; texto: string; clase: string; dias: number | null };

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Situación comercial de un cliente según su estado y su vencimiento. */
export function estadoCliente(estadoMcp: string, venceEl: string | null, diasGracia = 10): EstadoCliente {
  if (estadoMcp === "suspendida") return { clave: "suspendida", texto: "Suspendida", clase: "anulado", dias: null };
  if (!venceEl) return { clave: "sin_plan", texto: "Sin plan", clase: "abierta", dias: null };
  const dias = diasEntre(hoyISO(), venceEl);
  if (dias < -diasGracia) return { clave: "vencida", texto: `Vencida hace ${-dias} días`, clase: "anulado", dias };
  if (dias < 0) return { clave: "gracia", texto: `En gracia (venció hace ${-dias} d)`, clase: "abierta", dias };
  if (estadoMcp === "prueba") return { clave: "prueba", texto: `Prueba · quedan ${dias} días`, clase: "rendido", dias };
  if (dias <= 7) return { clave: "por_vencer", texto: `Vence en ${dias} días`, clase: "abierta", dias };
  return { clave: "al_dia", texto: "Al día", clase: "aprobado", dias };
}

/** Lo que paga al mes (si es anual, el precio entre 12). */
export function mensual(precio: number, ciclo: string) {
  return ciclo === "anual" ? Math.round((precio / 12) * 100) / 100 : precio;
}

/** Día (AAAA-MM-DD) en hora de Lima de una marca de tiempo. */
export const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de un día. */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((d + 6) % 7));
}

export const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
