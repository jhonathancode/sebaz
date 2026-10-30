/**
 * El concepto de un requerimiento empieza con «SE REQUIERE…» (porque requiere algo).
 * La orden, la conformidad y el comprobante, en cambio, dicen solo qué se paga o se recibe.
 */

const PREFIJO = /^SE REQUIERE\b\s*/;

/** Pone «SE REQUIERE» al inicio y el artículo que falte («PAGO DEL…» → «SE REQUIERE EL PAGO DEL…»). */
export function conceptoSeRequiere(texto: string): string {
  const u = texto.replace(/\s+/g, " ").trim().toLocaleUpperCase("es-PE");
  if (!u) return "";
  if (PREFIJO.test(u)) return u.replace(PREFIJO, "") ? u : "";
  let resto = u;
  if (/^(PAGO|SERVICIO|ALQUILER|MANTENIMIENTO|CONSUMO|TRANSPORTE)\b/.test(u)) resto = `EL ${u}`;
  else if (/^(COMPRA|ADQUISICI[ÓO]N|CONTRATACI[ÓO]N|REPARACI[ÓO]N|IMPRESI[ÓO]N|INSTALACI[ÓO]N)\b/.test(u)) resto = `LA ${u}`;
  return `SE REQUIERE ${resto}`;
}

/** Quita «SE REQUIERE» y su artículo: «SE REQUIERE EL PAGO DEL…» → «PAGO DEL…». Lo que no lo trae queda igual. */
export function conceptoSinSeRequiere(texto: string): string {
  return texto.replace(/^SE REQUIERE\s+(?:(?:EL|LA|LOS|LAS|UN|UNA)\s+)?/i, "").replace(/^SE REQUIERE\s*/i, "") || texto;
}

/** Concepto automático cuando no se escribió: «SE REQUIERE…» con la primera cosa del detalle y cuántas más hay. */
export function resumenConcepto(tipo: string, items: { descripcion: string }[]): string {
  if (!items.length) return "";
  const mas = items.length - 1;
  const cola = mas > 0 ? ` Y ${mas} ${mas === 1 ? "ÍTEM MÁS" : "ÍTEMS MÁS"}` : "";
  const base = items[0].descripcion.toLocaleUpperCase("es-PE");
  const cuerpo = tipo === "compra" ? `LA COMPRA DE ${base}` : tipo === "servicio" ? `EL SERVICIO DE ${base}` : base;
  return conceptoSeRequiere(cuerpo + cola);
}
