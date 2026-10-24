/** Nombre del sistema: se cambia con una variable de entorno, sin tocar código. */
/** Logos que vienen incluidos con el sistema, por RUC (carpeta public/logos). Sirven mientras la MCP no suba el suyo. */
const LOGOS_INCLUIDOS: Record<string, string> = {
  "20706762286": "/logos/20706762286.jpg",
};

/** Logo de una MCP: el que subió (bucket "logos") o, si no, el incluido con el sistema. */
export function logoMcp(mcp: { logo_path?: string | null; ruc?: string | null } | null | undefined): string | null {
  if (!mcp) return null;
  return urlLogo(mcp.logo_path) ?? (mcp.ruc ? LOGOS_INCLUIDOS[mcp.ruc] ?? null : null);
}

/** Dirección pública del logo de la MCP (bucket "logos"). */
export function urlLogo(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
}

export const APP_NOMBRE = process.env.NEXT_PUBLIC_APP_NOMBRE || "Sistema MCP";

export function soles(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fecha(f: string | null | undefined): string {
  if (!f) return "—";
  const [a, m, d] = f.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function fechaHora(f: string | null | undefined): string {
  if (!f) return "—";
  return new Date(f).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" });
}

export function num3(n: number | null | undefined): string {
  return n ? String(n).padStart(3, "0") : "___";
}

export function codigoCP(numero: number | null | undefined, origen?: string): string {
  return `${origen === "caja_chica" ? "CP-C" : "CP"}-${String(numero ?? 0).padStart(4, "0")}`;
}

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

export function nombrePeriodo(periodo: string): string {
  const [a, m] = periodo.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

export function periodoActual(): string {
  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

export function rangoPeriodo(periodo: string): { desde: string; hasta: string } {
  const [a, m] = periodo.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

/** "2026-10" → "2026-09" */
export function periodoAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** Fecha límite (ISO) para rendir un mes: el día indicado del mes siguiente. */
export function fechaLimite(periodo: string, dia: number | null | undefined): string {
  const [a, m] = periodo.split("-").map(Number);
  const anio = m === 12 ? a + 1 : a;
  const mes = m === 12 ? 1 : m + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia || 10).padStart(2, "0")}`;
}

/** Días desde hoy (Lima) hasta una fecha ISO; negativo si ya pasó. */
export function diasHasta(iso: string): number {
  const [a, m, d] = hoyISO().split("-").map(Number);
  const [a2, m2, d2] = iso.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a, m - 1, d)) / 86400000);
}

/** "10 de noviembre" */
export function fechaLarga(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

export function hoyISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// ---------------------------------------------------------------- en letras
const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ",
  "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE",
  "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS",
  "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function hasta999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let texto = CENTENAS[c];
  if (r > 0) {
    let resto: string;
    if (r < 30) resto = UNIDADES[r];
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      resto = DECENAS[d] + (u ? " Y " + UNIDADES[u] : "");
    }
    texto = texto ? `${texto} ${resto}` : resto;
  }
  return texto;
}

function entero(n: number): string {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? "UN MILLÓN" : `${hasta999(millones).replace(/UNO$/, "UN")} MILLONES`);
  if (miles) partes.push(miles === 1 ? "MIL" : `${hasta999(miles).replace(/UNO$/, "UN")} MIL`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(" ");
}

/** 320.5 → "TRESCIENTOS VEINTE CON 50/100 SOLES" */
export function enLetras(monto: number | string): string {
  const v = Math.round(Number(monto) * 100);
  const e = Math.floor(v / 100);
  const c = v % 100;
  return `${entero(e).replace(/UNO$/, "UN")} CON ${String(c).padStart(2, "0")}/100 SOLES`;
}
