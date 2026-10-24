export type TipoAviso = "aprobado" | "devuelto" | "anulado" | "pendiente" | "sistema" | "mensaje";

export type Aviso = {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  detalle: string | null;
  enlace: string | null;
  leida_en: string | null;
  creado_en: string;
};

/** Cómo se ve cada tipo de aviso: nombre, símbolo y color (en el CSS: .nt-<tipo>). */
export const TIPOS_AVISO: Record<TipoAviso, { nombre: string; simbolo: string; ayuda: string }> = {
  aprobado: { nombre: "Aprobado", simbolo: "✓", ayuda: "El alcalde aprobó algo suyo" },
  devuelto: { nombre: "Devuelto", simbolo: "↩", ayuda: "Hay que corregir y volver a enviar" },
  anulado: { nombre: "Anulado", simbolo: "✕", ayuda: "Un documento se anuló" },
  pendiente: { nombre: "Por aprobar", simbolo: "!", ayuda: "Espera su aprobación" },
  sistema: { nombre: "Sistema", simbolo: "⚙", ayuda: "Novedades y actualizaciones" },
  mensaje: { nombre: "Mensaje", simbolo: "✉", ayuda: "Mensaje de soporte o del administrador" },
};

export const ES_TIPO_AVISO = (t: string): t is TipoAviso => t in TIPOS_AVISO;

/** «hace 5 min», «ayer», «12/10». */
export function hace(iso: string): string {
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return "ahora";
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return "ayer";
  return new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" });
}
