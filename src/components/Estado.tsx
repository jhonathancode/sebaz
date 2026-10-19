const TEXTOS: Record<string, string> = {
  borrador: "Borrador",
  aprobado: "Aprobado",
  rendido: "Rendido",
  anulado: "Anulado",
  anulada: "Anulada",
  abierta: "Abierta",
  liquidada: "Liquidada",
  generada: "Generada",
  entregada: "Entregada",
  emitido: "Emitido",
  por_activar: "Por activar",
  prueba: "En prueba",
  activa: "Activa",
  suspendida: "Suspendida",
};

const CLASE: Record<string, string> = {
  anulada: "anulado",
  liquidada: "aprobado",
  generada: "aprobado",
  entregada: "rendido",
  emitido: "aprobado",
  por_activar: "abierta",
  prueba: "rendido",
  activa: "aprobado",
  suspendida: "anulado",
};

export default function Estado({ valor }: { valor: string }) {
  return <span className={`estado ${CLASE[valor] ?? valor}`}>{TEXTOS[valor] ?? valor}</span>;
}
