/**
 * Ciclos de un contrato de servicio. El contrato vale un solo año: empieza en `inicio`, termina en `fin`
 * (como máximo el 31 de diciembre) y se parte en ciclos de `meses` meses contados desde el día de inicio
 * (día de corte). Un contrato que empieza el 18 de enero y es mensual tiene ciclos del 18 al 17.
 * Si el último ciclo queda más corto que uno completo (porque el año cierra el 31 de diciembre), se paga por días.
 */
export type Ciclo = {
  n: number;
  desde: string;
  hasta: string;
  /** Mes en que empieza el ciclo ("2026-03"): es la clave con la que el sistema recuerda cuál ciclo ya se registró. */
  clave: string;
  dias: number;
  diasCompleto: number;
  completo: boolean;
  monto: number;
};

export const PERIODICIDADES = [
  { v: 1, t: "Mensual" },
  { v: 2, t: "Bimestral" },
  { v: 3, t: "Trimestral" },
  { v: 4, t: "Cuatrimestral" },
  { v: 6, t: "Semestral" },
  { v: 12, t: "Anual" },
] as const;

const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);
const dias = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86400000) + 1;

/** Suma meses a una fecha sin pasarse de mes (el día de corte nunca pasa de 28). */
function sumarMeses(iso: string, meses: number): string {
  const d = aFecha(iso);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + meses;
  return aIso(new Date(Date.UTC(Math.floor(total / 12), total % 12, d.getUTCDate())));
}

const diaAnterior = (iso: string) => {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return aIso(d);
};

export function ciclosDelContrato(p: { inicio: string; fin: string; meses: number; monto: number }): Ciclo[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(p.fin) || p.fin < p.inicio || !(p.meses >= 1)) return [];
  const [anio, mes, dia] = p.inicio.split("-").map(Number);
  // Con el día de corte 29, 30 o 31 los meses cortos se descuadran: el contrato se cuenta desde el 28
  const inicio = dia > 28 ? `${anio}-${String(mes).padStart(2, "0")}-28` : p.inicio;
  const out: Ciclo[] = [];
  let desde = inicio;
  for (let n = 1; n <= 60 && desde <= p.fin; n++) {
    const siguiente = sumarMeses(desde, p.meses);
    const finCompleto = diaAnterior(siguiente);
    const hasta = finCompleto > p.fin ? p.fin : finCompleto;
    const diasCompleto = dias(desde, finCompleto);
    const d = dias(desde, hasta);
    const completo = d >= diasCompleto;
    out.push({
      n,
      desde,
      hasta,
      clave: desde.slice(0, 7),
      dias: d,
      diasCompleto,
      completo,
      monto: completo ? Math.round(p.monto * 100) / 100 : Math.round((p.monto * d * 100) / diasCompleto) / 100,
    });
    desde = siguiente;
  }
  return out;
}

const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Cómo se nombra un ciclo en el texto del requerimiento: «ENERO 2026» (ciclo mensual desde el día 1) o «DEL 18/01 AL 17/02 DE 2026». */
export function etiquetaCiclo(c: Pick<Ciclo, "desde" | "hasta">, meses: number): string {
  const anio = c.desde.slice(0, 4);
  const [, m, d] = c.desde.split("-").map(Number);
  const finDeMes = c.hasta === `${c.hasta.slice(0, 8)}${String(new Date(Date.UTC(Number(c.hasta.slice(0, 4)), Number(c.hasta.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
  if (meses === 1 && d === 1 && finDeMes) return `${MESES_LARGO[m - 1]} ${anio}`.toLocaleUpperCase("es-PE");
  return `DEL ${dmy(c.desde)} AL ${dmy(c.hasta)} DE ${c.hasta.slice(0, 4)}`;
}

/** El ciclo que toca registrar: el primero sin registrar que ya empezó (o, si todos van al día, el siguiente). null si no quedan. */
export function cicloPendiente(ciclos: Ciclo[], registrados: string[], hoy: string): { ciclo: Ciclo; atrasado: boolean } | null {
  const falta = ciclos.filter((c) => !registrados.includes(c.clave));
  if (falta.length === 0) return null;
  const ya = falta.find((c) => c.desde <= hoy);
  return ya ? { ciclo: ya, atrasado: true } : { ciclo: falta[0], atrasado: false };
}
