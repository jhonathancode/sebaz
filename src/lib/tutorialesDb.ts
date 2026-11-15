import type { SupabaseClient } from "@supabase/supabase-js";
import { TUTORIALES } from "@/lib/tutoriales";

export type TutorialFila = { id: string | null; slug: string; modulo: string; orden: number; titulo: string; pasos: string[]; consejo: string | null; video_url: string | null; publicado: boolean };

/** Módulos fijos (clave, nombre, ícono y módulo que debe tener la MCP). Las guías de cada uno se administran en el superadmin. */
export const MODULOS_TUT = TUTORIALES.map((m) => ({ clave: m.clave, texto: m.texto, icono: m.icono, modulo: m.modulo }));

const deRespaldo = (): TutorialFila[] =>
  TUTORIALES.flatMap((m) => m.tutoriales.map((t, i) => ({ id: null, slug: `${m.clave}-${i + 1}`, modulo: m.clave, orden: i + 1, titulo: t.titulo, pasos: t.pasos, consejo: t.consejo ?? null, video_url: null, publicado: true })));

/** Guías desde la base de datos; si aún no existe la tabla o está vacía, las que vienen de fábrica. */
export async function cargarTutoriales(supabase: SupabaseClient, soloPublicados = true): Promise<{ filas: TutorialFila[]; enBase: boolean }> {
  let q = supabase.from("tutoriales").select("id, slug, modulo, orden, titulo, pasos, consejo, video_url, publicado").order("orden").order("creado_en");
  if (soloPublicados) q = q.eq("publicado", true);
  const { data, error } = await q;
  if (error || !data || data.length === 0) return { filas: error || soloPublicados ? deRespaldo() : [], enBase: !error };
  return { filas: data.map((d) => ({ ...d, pasos: Array.isArray(d.pasos) ? (d.pasos as string[]) : [] })) as TutorialFila[], enBase: true };
}

/** Convierte el enlace pegado (YouTube, Vimeo, Google Drive o un archivo de video) en lo que se incrusta. */
export function videoIncrustado(url: string | null): { tipo: "iframe" | "video"; src: string } | null {
  if (!url) return null;
  const u = url.trim();
  let m = u.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/);
  if (m) return { tipo: "iframe", src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { tipo: "iframe", src: `https://player.vimeo.com/video/${m[1]}` };
  m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (m) return { tipo: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview` };
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(u) && /^https:\/\//i.test(u)) return { tipo: "video", src: u };
  return null;
}
