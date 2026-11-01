"use server";

import { revalidatePath } from "next/cache";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { obtenerContexto } from "@/lib/contexto";
import { slugify } from "@/lib/sitio/texto";
import { supabaseServidor } from "@/lib/supabase/server";

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function exigirSuperadmin() {
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) throw new Error("Solo el superadmin puede administrar la web.");
  return ctx;
}

/** Sube una imagen al almacén público del sitio y devuelve su ruta (para portadas e imágenes dentro del artículo). */
export async function subirImagenWeb(fd: FormData): Promise<{ path?: string; url?: string; error?: string }> {
  try {
    await exigirSuperadmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const archivo = fd.get("imagen");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elija una imagen." };
  const ext = TIPOS[archivo.type];
  if (!ext) return { error: "La imagen debe ser JPG, PNG, WEBP o GIF." };
  if (archivo.size > 4 * 1024 * 1024) return { error: "La imagen pesa más de 4 MB." };
  const carpeta = texto(fd, "carpeta") === "ajustes" ? "ajustes" : "blog";
  const nombre = slugify(archivo.name.replace(/\.[^.]+$/, "")) || "imagen";
  const path = `${carpeta}/${Date.now()}-${nombre}.${ext}`;
  const supabase = await supabaseServidor();
  const { error } = await supabase.storage.from("web").upload(path, archivo, { contentType: archivo.type, cacheControl: "31536000" });
  if (error) return { error: /bucket/i.test(error.message) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql)." : error.message };
  return { path, url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/web/${path}` };
}

/** «2026-11-05T08:00» (hora de Lima) → fecha con huso horario. */
const aFechaLima = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00-05:00`).toISOString() : null);

export async function guardarArticulo(fd: FormData) {
  await exigirSuperadmin();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id");
  const titulo = texto(fd, "titulo");
  const volverA = id ? `/superadmin/web/blog/${id}` : "/superadmin/web/blog/nuevo";
  if (!titulo) volver(volverA, "error", "Escriba el título del artículo.");
  const slug = slugify(texto(fd, "slug") ?? titulo);
  if (!slug) volver(volverA, "error", "El enlace del artículo no es válido.");
  const estado = ["borrador", "programado", "publicado", "archivado"].includes(texto(fd, "estado") ?? "") ? texto(fd, "estado")! : "borrador";
  let publicado = aFechaLima(texto(fd, "publicado_en"));
  if (estado === "publicado" && !publicado) publicado = new Date().toISOString();
  if (estado === "programado" && !publicado) volver(volverA, "error", "Para programar elija la fecha y hora de publicación.");
  const etiquetas = (texto(fd, "etiquetas") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);

  const fila = {
    slug,
    titulo,
    extracto: texto(fd, "extracto"),
    contenido: String(fd.get("contenido") ?? ""),
    portada_path: texto(fd, "portada_path"),
    categoria_id: texto(fd, "categoria_id"),
    etiquetas,
    autor: texto(fd, "autor"),
    estado,
    publicado_en: estado === "borrador" || estado === "archivado" ? publicado : publicado,
    destacado: texto(fd, "destacado") === "1",
    seo_titulo: texto(fd, "seo_titulo"),
    seo_descripcion: texto(fd, "seo_descripcion"),
    actualizado_en: new Date().toISOString(),
  };
  const r = id ? await supabase.from("blog_articulos").update(fila).eq("id", id).select("id").single() : await supabase.from("blog_articulos").insert(fila).select("id").single();
  if (r.error) volver(volverA, "error", /duplicate|unique/i.test(r.error.message) ? "Ya existe un artículo con ese enlace. Cambie el enlace." : /blog_articulos/i.test(r.error.message) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql)." : mensajeError(r.error));
  revalidatePath("/superadmin/web/blog");
  volver(`/superadmin/web/blog/${r.data!.id}`, "ok", estado === "publicado" ? "Artículo guardado y publicado." : estado === "programado" ? "Artículo programado." : "Artículo guardado.");
}

export async function cambiarEstadoArticulo(fd: FormData) {
  await exigirSuperadmin();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id") ?? "";
  const estado = texto(fd, "estado") ?? "";
  if (!["borrador", "publicado", "archivado"].includes(estado)) volver("/superadmin/web/blog", "error", "Estado no válido.");
  const cambios: Record<string, unknown> = { estado, actualizado_en: new Date().toISOString() };
  if (estado === "publicado") cambios.publicado_en = new Date().toISOString();
  const { error } = await supabase.from("blog_articulos").update(cambios).eq("id", id);
  if (error) volver("/superadmin/web/blog", "error", mensajeError(error));
  revalidatePath("/superadmin/web/blog");
  volver("/superadmin/web/blog", "ok", estado === "publicado" ? "Artículo publicado." : estado === "archivado" ? "Artículo archivado." : "Artículo pasado a borrador.");
}

export async function guardarCategoria(fd: FormData) {
  await exigirSuperadmin();
  const supabase = await supabaseServidor();
  const id = texto(fd, "id");
  const nombre = texto(fd, "nombre");
  if (!nombre) volver("/superadmin/web/blog/categorias", "error", "Escriba el nombre de la categoría.");
  const fila = { nombre, slug: slugify(texto(fd, "slug") ?? nombre), descripcion: texto(fd, "descripcion"), orden: Number(texto(fd, "orden") ?? 0) || 0 };
  const { error } = id ? await supabase.from("blog_categorias").update(fila).eq("id", id) : await supabase.from("blog_categorias").insert(fila);
  if (error) volver("/superadmin/web/blog/categorias", "error", /duplicate|unique/i.test(error.message) ? "Ya existe una categoría con ese enlace." : mensajeError(error));
  revalidatePath("/superadmin/web/blog/categorias");
  volver("/superadmin/web/blog/categorias", "ok", "Categoría guardada.");
}

const lineasAEnlaces = (t: string | null) =>
  (t ?? "")
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p[0])
    .map((p) => ({ texto: p[0], href: p[1] || "/" }));

export async function guardarAjustes(fd: FormData) {
  await exigirSuperadmin();
  const supabase = await supabaseServidor();
  const redes: Record<string, string> = {};
  for (const k of ["facebook", "instagram", "tiktok", "youtube", "linkedin", "x"]) {
    const v = texto(fd, `red_${k}`);
    if (v) redes[k] = v;
  }
  const { error } = await supabase
    .from("web_ajustes")
    .update({
      nombre_sitio: texto(fd, "nombre_sitio") ?? "Sebaz",
      eslogan: texto(fd, "eslogan"),
      dominio: texto(fd, "dominio"),
      logo_path: texto(fd, "logo_path"),
      whatsapp: texto(fd, "whatsapp"),
      whatsapp_mensaje: texto(fd, "whatsapp_mensaje"),
      correo: texto(fd, "correo"),
      telefono: texto(fd, "telefono"),
      direccion: texto(fd, "direccion"),
      redes,
      menu: lineasAEnlaces(texto(fd, "menu")),
      boton_menu_texto: texto(fd, "boton_menu_texto"),
      boton_menu_enlace: texto(fd, "boton_menu_enlace"),
      pie_texto: texto(fd, "pie_texto"),
      pie_enlaces: lineasAEnlaces(texto(fd, "pie_enlaces")),
      seo_titulo: texto(fd, "seo_titulo"),
      seo_descripcion: texto(fd, "seo_descripcion"),
      og_imagen: texto(fd, "og_imagen"),
      ga_id: texto(fd, "ga_id"),
      search_console: texto(fd, "search_console"),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) volver("/superadmin/web/ajustes", "error", mensajeError(error));
  revalidatePath("/", "layout");
  volver("/superadmin/web/ajustes", "ok", "Ajustes del sitio guardados.");
}
