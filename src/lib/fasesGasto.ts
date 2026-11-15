/** Fases del gasto como en el SIAF, traducidas a los documentos de Sebaz. */
export const FASES = [
  { clave: "requerido", texto: "Requerido", ayuda: "Hay un requerimiento, aún sin orden ni aprobación." },
  { clave: "comprometido", texto: "Comprometido", ayuda: "Se emitió la orden de compra o de servicio (o se aprobó el pago fijo): el dinero queda reservado." },
  { clave: "devengado", texto: "Devengado", ayuda: "Se dio la conformidad: el bien o servicio llegó y se debe pagar." },
  { clave: "girado", texto: "Girado", ayuda: "Se emitió el comprobante de pago y el cheque." },
  { clave: "pagado", texto: "Pagado", ayuda: "El banco cobró el cheque (conciliado con el estado de cuenta)." },
] as const;
export type ClaveFase = (typeof FASES)[number]["clave"];

export const indiceFase = (c: ClaveFase) => FASES.findIndex((f) => f.clave === c);

/** En qué fase está un gasto, según lo que ya tiene. */
export function faseGasto(x: { estado: string; aprobado: boolean; tieneOrden: boolean; tieneConformidad: boolean; tieneComprobante: boolean; conciliado: boolean }): ClaveFase | "anulado" {
  if (x.estado === "anulado") return "anulado";
  if (x.conciliado) return "pagado";
  if (x.tieneComprobante) return "girado";
  if (x.tieneConformidad) return "devengado";
  if (x.tieneOrden || x.aprobado) return "comprometido";
  return "requerido";
}
