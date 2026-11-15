/** Documentos que se pueden adjuntar a un expediente y cuáles suelen pedirse según el tipo de gasto. */
export const TIPOS_ADJUNTO = [
  { clave: "contrato", texto: "Contrato" },
  { clave: "orden_firmada", texto: "Orden de servicio / compra firmada" },
  { clave: "informe", texto: "Informe de trabajo" },
  { clave: "recibo_honorarios", texto: "Recibo por honorarios" },
  { clave: "planilla", texto: "Planilla de pago" },
  { clave: "dni", texto: "Copia de DNI" },
  { clave: "credencial", texto: "Copia de credencial" },
  { clave: "cotizacion", texto: "Cotización del proveedor" },
  { clave: "guia", texto: "Guía de remisión" },
  { clave: "factura", texto: "Factura o boleta (copia)" },
  { clave: "conformidad", texto: "Conformidad firmada" },
  { clave: "otro", texto: "Otro documento" },
] as const;

/** Ya no se piden ni se ofrecen: la orden la arma el sistema en su paso, y el comprobante del proveedor (recibo, factura, boleta) lo adjunta la tesorera al imprimir. */
export const TIPOS_OCULTOS: string[] = ["orden_firmada", "recibo_honorarios", "factura"];
export const TIPOS_ADJUNTABLES = TIPOS_ADJUNTO.filter((t) => !TIPOS_OCULTOS.includes(t.clave));

export type ClaveAdjunto = (typeof TIPOS_ADJUNTO)[number]["clave"];

/** Lo que suele pedirse en cada tipo de gasto (la lista guía; se puede adjuntar cualquier otro). */
export const RECOMENDADOS: Record<string, ClaveAdjunto[]> = {
  servicio: ["contrato", "informe", "planilla", "dni"],
  compra: ["cotizacion", "guia", "conformidad"],
};

export const nombreAdjunto = (clave: string) => TIPOS_ADJUNTO.find((t) => t.clave === clave)?.texto ?? clave;
export const TIPOS_ARCHIVO_ADJUNTO: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
