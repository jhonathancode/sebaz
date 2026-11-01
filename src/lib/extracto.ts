// Tipos y reglas para copiar y enlazar el estado de cuenta (sin dependencias del servidor).

export type Enlace = {
  tipo: "cp" | "transferencia" | "ingresos" | "banco" | "otro";
  id?: string;
  periodo?: string;
  etiqueta?: string;
  /** Otros comprobantes pagados con el mismo cheque (un cheque que cubre varios expedientes). */
  extra?: { id: string; etiqueta: string }[];
};

/** Todos los ids de comprobante de un enlace (el principal y los demás del mismo cheque). */
export const idsEnlace = (e?: Enlace | null): string[] => (e ? [...(e.id ? [e.id] : []), ...(e.extra ?? []).map((x) => x.id)] : []);

export type LineaExtracto = { codigo: string; cargo: string; abono: string; saldo: string; dia: string; enlace?: Enlace | null };

export type Candidatos = {
  cps: { id: string; codigo: string; cheque: string; monto: number; beneficiario: string; concepto: string; fecha: string; cobrado: boolean }[];
  transferencias: { id: string; municipalidad: string; periodo: string; fecha: string; monto: number; documento: string | null }[];
  ingresos: { periodo: string; total: number; n: number }[];
};

export const aNum = (v: string) => {
  const t = (v ?? "").replace(/,/g, "").replace(/\s/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const igual = (a: number, b: number) => Math.abs(a - b) < 0.005;
export const soloDigitos = (t: string) => (t ?? "").replace(/\D/g, "");

/** Qué clase de movimiento es una línea del estado de cuenta. */
export function tipoLinea(l: LineaExtracto): "cheque" | "itf" | "comision" | "transferencia" | "abono" | "cargo" | "vacia" {
  const c = (l.codigo ?? "").toUpperCase().trim();
  const cargo = aNum(l.cargo);
  const abono = aNum(l.abono);
  if (cargo === null && abono === null && c === "") return "vacia";
  if (c.includes("ITF") || c.startsWith("IMPT")) return "itf";
  if (c.startsWith("MANUT") || c.startsWith("COMIS") || c.startsWith("MANT")) return "comision";
  if (abono !== null && (c.startsWith("TI") || c.startsWith("TRANSF"))) return "transferencia";
  if (abono !== null) return "abono";
  if (soloDigitos(c).length >= 5) return "cheque";
  return "cargo";
}

export type Sugerencia = { enlace: Enlace; aviso?: string } | null;

/** Propone con qué se enlaza una línea (cheque ↔ comprobante, transferencia ↔ transferencia registrada, etc.). */
export function sugerir(l: LineaExtracto, c: Candidatos, usados: Set<string>): Sugerencia {
  const t = tipoLinea(l);
  const cargo = aNum(l.cargo);
  const abono = aNum(l.abono);
  if (t === "itf") return { enlace: { tipo: "banco", etiqueta: "Impuesto a las transacciones (ITF)" } };
  if (t === "comision") return { enlace: { tipo: "banco", etiqueta: "Mantenimiento o comisión del banco" } };
  if (t === "cheque") {
    const n = soloDigitos(l.codigo);
    const libres = c.cps.filter((x) => !usados.has(x.id));
    const exactos = libres.filter((x) => soloDigitos(x.cheque) === n);
    const mismos = exactos.length ? exactos : n.length >= 6 ? libres.filter((x) => soloDigitos(x.cheque).endsWith(n.slice(-6))) : [];
    if (mismos.length) {
      const suma = r2(mismos.reduce((t, x) => t + x.monto, 0));
      const etq = (x: (typeof mismos)[number]) => `${x.codigo} · ${x.beneficiario}`;
      return {
        enlace: { tipo: "cp", id: mismos[0].id, etiqueta: etq(mismos[0]), ...(mismos.length > 1 ? { extra: mismos.slice(1).map((x) => ({ id: x.id, etiqueta: etq(x) })) } : {}) },
        aviso: cargo !== null && !igual(cargo, suma) ? `Los comprobantes suman S/ ${fmt(suma)} y el banco cobró S/ ${fmt(cargo)}` : undefined,
      };
    }
    return null;
  }
  if (t === "transferencia" || t === "abono") {
    if (abono === null) return null;
    const tr = c.transferencias.find((x) => !usados.has(x.id) && igual(x.monto, abono));
    if (tr) return { enlace: { tipo: "transferencia", id: tr.id, etiqueta: `Transferencia de ${tr.municipalidad.replace(/^municipalidad (distrital|provincial) de /i, "")} · ${tr.periodo}` } };
    const ing = c.ingresos.find((x) => x.n > 0 && igual(x.total, abono));
    if (ing) return { enlace: { tipo: "ingresos", periodo: ing.periodo, etiqueta: `Depósito de ingresos propios de ${ing.periodo}` } };
    return null;
  }
  if (t === "cargo" && cargo !== null) {
    const iguales = c.cps.filter((x) => !usados.has(x.id) && igual(x.monto, cargo));
    if (iguales.length === 1) return { enlace: { tipo: "cp", id: iguales[0].id, etiqueta: `${iguales[0].codigo} · ${iguales[0].beneficiario}` }, aviso: "Enlazado por el monto: confirme que es el cheque correcto" };
  }
  return null;
}
