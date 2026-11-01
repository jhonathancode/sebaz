import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/** Cliente sin sesión (anónimo): solo lee lo que las reglas de la base dejan ver al público. */
export function supabasePublico() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Ajustes = {
  nombre_sitio: string;
  eslogan: string | null;
  dominio: string | null;
  logo_path: string | null;
  whatsapp: string | null;
  whatsapp_mensaje: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  redes: Record<string, string>;
  menu: { texto: string; href: string }[];
  boton_menu_texto: string | null;
  boton_menu_enlace: string | null;
  pie_texto: string | null;
  pie_enlaces: { texto: string; href: string }[];
  seo_titulo: string | null;
  seo_descripcion: string | null;
  og_imagen: string | null;
  ga_id: string | null;
  search_console: string | null;
  scripts_cabeza: string | null;
};

export type Categoria = { id: string; slug: string; nombre: string; descripcion: string | null };
export type Articulo = {
  id: string;
  slug: string;
  titulo: string;
  extracto: string | null;
  contenido: string;
  portada_path: string | null;
  categoria_id: string | null;
  etiquetas: string[];
  autor: string | null;
  estado: string;
  publicado_en: string | null;
  destacado: boolean;
  seo_titulo: string | null;
  seo_descripcion: string | null;
  lecturas: number;
  actualizado_en: string;
};

const AJUSTES_BASE: Ajustes = {
  nombre_sitio: "Zebaz",
  eslogan: "Sistema de control para municipalidades de centros poblados",
  dominio: null,
  logo_path: null,
  whatsapp: null,
  whatsapp_mensaje: null,
  correo: null,
  telefono: null,
  direccion: null,
  redes: {},
  menu: [{ texto: "Inicio", href: "/" }, { texto: "Blog", href: "/blog" }],
  boton_menu_texto: "Ingresar al sistema",
  boton_menu_enlace: "/login",
  pie_texto: null,
  pie_enlaces: [],
  seo_titulo: null,
  seo_descripcion: null,
  og_imagen: null,
  ga_id: null,
  search_console: null,
  scripts_cabeza: null,
};

export async function cargarAjustes(): Promise<Ajustes> {
  const { data } = await supabasePublico().from("web_ajustes").select("*").eq("id", 1).maybeSingle();
  return { ...AJUSTES_BASE, ...(data ?? {}) } as Ajustes;
}

/** Dirección pública de una imagen del bucket «web». */
export function urlWeb(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/web/${path}`;
}

/** Prefijo de las rutas del sitio: vacío en el dominio de la web, «/sitio» al verlo desde el dominio del sistema. */
export async function baseSitio() {
  const h = await headers();
  return h.get("x-sitio-base") ?? "/sitio";
}
export async function rutaSitio(ruta: string) {
  const base = await baseSitio();
  if (ruta === "/") return base || "/";
  return `${base}${ruta}`;
}

/** Dirección absoluta del sitio (para el mapa del sitio, RSS y datos de compartir). */
export async function origenSitio(ajustes?: Ajustes) {
  const dom = ajustes?.dominio?.trim();
  if (dom) return dom.replace(/\/+$/, "").replace(/^(?!https?:\/\/)/, "https://");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

/** Markdown → HTML seguro, con identificadores en los títulos para el índice. */
export function mdAHtml(markdown: string): { html: string; indice: { id: string; texto: string; nivel: number }[] } {
  const indice: { id: string; texto: string; nivel: number }[] = [];
  const usados = new Set<string>();
  const crudo = marked.parse(markdown ?? "", { async: false, gfm: true, breaks: false }) as string;
  const limpio = sanitizeHtml(crudo, {
    allowedTags: ["h2", "h3", "h4", "p", "br", "hr", "strong", "em", "del", "a", "ul", "ol", "li", "blockquote", "code", "pre", "img", "table", "thead", "tbody", "tr", "th", "td", "figure", "figcaption"],
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title", "width", "height", "loading"], th: ["align"], td: ["align"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: (tag, attribs) => ({ tagName: "a", attribs: { ...attribs, ...(attribs.href?.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {}) } }),
      img: (tag, attribs) => ({ tagName: "img", attribs: { ...attribs, loading: "lazy" } }),
    },
  });
  const html = limpio.replace(/<(h[2-4])>([\s\S]*?)<\/\1>/g, (_m, tag: string, interior: string) => {
    const texto = interior.replace(/<[^>]+>/g, "").trim();
    let id = slugify(texto) || "seccion";
    let n = 2;
    while (usados.has(id)) id = `${slugify(texto)}-${n++}`;
    usados.add(id);
    if (tag !== "h4") indice.push({ id, texto, nivel: Number(tag[1]) });
    return `<${tag} id="${id}">${interior}</${tag}>`;
  });
  return { html, indice };
}

export { slugify, tiempoLectura, fechaCorta, limpiarTexto } from "./texto";
import { slugify } from "./texto";
