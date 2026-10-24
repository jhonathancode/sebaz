/**
 * Redacción formal del concepto de un gasto a partir de lo que escribe la
 * tesorera: "pago de tesorera enero 2026" →
 * "PAGO DEL SERVICIO DE TESORERÍA CORRESPONDIENTE AL MES DE ENERO 2026".
 */
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const ABREV: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, set: 8, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11,
};

/** Servicio o pago reconocido por palabras clave (sin tildes, en minúsculas). */
const REGLAS: { claves: RegExp; nombre: string; dieta?: boolean }[] = [
  { claves: /tesorer/, nombre: "SERVICIO DE TESORERÍA" },
  { claves: /asesor(ia)? contable|contador|contabilidad|contable/, nombre: "SERVICIO DE ASESORÍA CONTABLE" },
  { claves: /asesor(ia)? legal|abogad|legal/, nombre: "SERVICIO DE ASESORÍA LEGAL" },
  { claves: /secretari/, nombre: "SERVICIO DE SECRETARÍA" },
  { claves: /limpieza/, nombre: "SERVICIO DE LIMPIEZA PÚBLICA" },
  { claves: /vigilan|guardian|seren/, nombre: "SERVICIO DE VIGILANCIA" },
  { claves: /chofer|conductor/, nombre: "SERVICIO DE CONDUCCIÓN DE VEHÍCULO" },
  { claves: /internet/, nombre: "SERVICIO DE INTERNET" },
  { claves: /\bluz\b|energia|electric/, nombre: "SERVICIO DE ENERGÍA ELÉCTRICA" },
  { claves: /\bagua\b/, nombre: "SERVICIO DE AGUA POTABLE" },
  { claves: /telefon|celular/, nombre: "SERVICIO DE TELEFONÍA" },
  { claves: /dieta.*alcald|alcald.*dieta/, nombre: "DIETA DEL ALCALDE", dieta: true },
  { claves: /dieta.*regidor|regidor.*dieta|dietas/, nombre: "DIETA DE LOS REGIDORES", dieta: true },
];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mes y año que aparecen en el texto (el año por defecto es el actual). */
function mesYAnio(texto: string, anioActual: number): { mes: number; anio: number } | null {
  const t = sinTildes(texto);
  let mes = -1;
  MESES.forEach((m, i) => {
    if (mes < 0 && new RegExp(`\\b${sinTildes(m)}\\b`).test(t)) mes = i;
  });
  if (mes < 0 && /\bseptiembre\b/.test(t)) mes = 8;
  if (mes < 0) {
    for (const [a, i] of Object.entries(ABREV)) {
      if (new RegExp(`\\b${a}\\b\\.?`).test(t)) { mes = i; break; }
    }
  }
  if (mes < 0) return null;
  const a = t.match(/\b(20\d{2})\b/);
  return { mes, anio: a ? Number(a[1]) : anioActual };
}

export function sugerirConcepto(texto: string, anioActual = new Date().getFullYear()): string | null {
  const t = sinTildes(texto.trim());
  if (t.length < 6) return null;
  const regla = REGLAS.find((r) => r.claves.test(t));
  const periodo = mesYAnio(texto, anioActual);
  if (!regla) return null;
  const base = regla.dieta ? `PAGO DE ${regla.nombre}` : `PAGO DEL ${regla.nombre}`;
  const sugerencia = periodo ? `${base} CORRESPONDIENTE AL MES DE ${MESES[periodo.mes]} ${periodo.anio}` : base;
  return sinTildes(sugerencia) === t ? null : sugerencia;
}
