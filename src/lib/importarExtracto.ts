import type { LineaExtracto } from "@/lib/extracto";

const aTexto = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return aTexto(o.result);
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return aTexto(o.text);
  }
  return String(v).trim();
};

const aMonto = (t: string): string => {
  const limpio = t.replace(/[^\d.,-]/g, "");
  if (!limpio) return "";
  // «1.234,56» (coma decimal) o «1,234.56»
  const normal = /,\d{1,2}$/.test(limpio) && !/\.\d{1,2}$/.test(limpio) ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};

function aIso(t: string, anio: string): string {
  const s = t.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : anio;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

const normaliza = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function leerCsv(texto: string): string[][] {
  const sep = (texto.match(/;/g)?.length ?? 0) > (texto.match(/,/g)?.length ?? 0) / 2 && texto.includes(";") ? ";" : texto.includes("\t") ? "\t" : ",";
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const celdas: string[] = [];
      let actual = "";
      let comillas = false;
      for (const ch of l) {
        if (ch === '"') comillas = !comillas;
        else if (ch === sep && !comillas) {
          celdas.push(actual.trim());
          actual = "";
        } else actual += ch;
      }
      celdas.push(actual.trim());
      return celdas;
    });
}

/**
 * Lee un estado de cuenta en Excel o CSV y lo vuelve líneas del extracto. Busca la fila de títulos
 * (fecha, descripción u operación, cargo/retiro, abono/depósito, saldo) y toma lo que viene debajo.
 * Solo para el navegador.
 */
export async function leerExtractoArchivo(archivo: File, anio: string): Promise<LineaExtracto[]> {
  let filas: string[][];
  if (/\.csv$|\.txt$/i.test(archivo.name)) {
    filas = leerCsv(await archivo.text());
  } else {
    const { default: ExcelJS } = await import("exceljs");
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await archivo.arrayBuffer());
    const hoja = libro.worksheets[0];
    filas = [];
    hoja?.eachRow({ includeEmpty: false }, (fila) => {
      const v = fila.values as unknown[];
      filas.push(v.slice(1).map(aTexto));
    });
  }
  const buscar = (celdas: string[], re: RegExp) => celdas.findIndex((c) => re.test(normaliza(c)));
  let cab = -1;
  let col = { dia: -1, cod: -1, cargo: -1, abono: -1, saldo: -1 };
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const c = filas[i];
    const cargo = buscar(c, /cargo|retiro|debito|egreso/);
    const abono = buscar(c, /abono|deposito|credito|ingreso/);
    if (cargo >= 0 && abono >= 0) {
      cab = i;
      col = { dia: buscar(c, /fecha|dia/), cod: buscar(c, /descrip|operacion|detalle|concepto|referencia|codigo|movimiento/), cargo, abono, saldo: buscar(c, /saldo/) };
      break;
    }
  }
  if (cab < 0) throw new Error("No se encontró la fila de títulos (necesita columnas de cargo y abono).");
  const lineas: LineaExtracto[] = [];
  for (const c of filas.slice(cab + 1)) {
    const cargo = col.cargo >= 0 ? aMonto(c[col.cargo] ?? "") : "";
    const abono = col.abono >= 0 ? aMonto(c[col.abono] ?? "") : "";
    if (!cargo && !abono) continue;
    lineas.push({
      codigo: (col.cod >= 0 ? c[col.cod] ?? "" : "").toUpperCase(),
      cargo,
      abono,
      saldo: col.saldo >= 0 ? aMonto(c[col.saldo] ?? "") : "",
      dia: col.dia >= 0 ? aIso(c[col.dia] ?? "", anio) : "",
      enlace: null,
    });
  }
  if (lineas.length === 0) throw new Error("El archivo no tiene movimientos con cargo o abono.");
  return lineas;
}
