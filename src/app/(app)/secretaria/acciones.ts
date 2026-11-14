"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { hoyISO } from "@/lib/formato";
import { esLibre, lugarMcp, MARCA_LIBRE, membreteHtml, sinMarca, MODELOS_BASE, rellenar, TIPOS_SEC } from "@/lib/secretaria";
import { supabaseServidor } from "@/lib/supabase/server";

const TIPOS_ARCHIVO: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const ruta = (id: string) => `/secretaria/${id}`;
const falta = (m: string) => (/sec_documentos|sec_modelos|sec_emitir|schema cache/.test(m) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte." : m);

async function permiso(destino: string) {
  const ctx = await contextoMcp();
  if (!ctx.mcp.modulos?.includes("secretaria")) volver("/", "error", "El módulo de Secretaría no está habilitado.");
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(destino, "error", "No tiene permiso para redactar documentos.");
  return ctx;
}

/** Deja solo el formato del editor (negrita, listas, tablas, colores, letras): nada de scripts ni basura de Word. */
function limpiar(html: string): string {
  const css = /^[\w\s#%(),.'"\/-]+$/;
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "s", "strike", "span", "ul", "ol", "li", "div", "h1", "h2", "h3", "table", "thead", "tbody", "tr", "td", "th", "sub", "sup", "img", "hr"],
    allowedAttributes: { "*": ["style", "class", "data-campo", "data-num"], img: ["src", "alt", "style", "width", "height", "class"], td: ["style", "colspan", "rowspan"], th: ["style", "colspan", "rowspan"] },
    allowedClasses: { "*": ["sec-membrete", "sec-logo", "sec-mcp", "sec-sub", "sec-titulo", "sec-lugar", "sec-lugar-pie", "sec-dest", "sec-tabla-datos", "sec-sumilla", "sec-cuerpo", "sec-despedida", "sec-firma2", "sec-cc", "sec-linea"] },
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "font-family": [css],
        "font-size": [/^\d+(\.\d+)?(px|pt|em|%)$/],
        color: [css],
        "background-color": [css],
        "line-height": [/^\d+(\.\d+)?(px|pt|em|%)?$/],
        "margin-left": [/^\d+(\.\d+)?(px|pt|em)$/],
        "text-indent": [/^-?\d+(\.\d+)?(px|pt|em)$/],
        "font-weight": [/^(normal|bold|\d+)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [/^[\w\s-]+$/],
        border: [css],
        "border-collapse": [/^(collapse|separate)$/],
        padding: [css],
        width: [/^\d+(\.\d+)?(px|pt|%)$/],
        height: [/^(auto|\d+(\.\d+)?(px|pt|%))$/],
        "max-width": [/^\d+(\.\d+)?(px|pt|%)$/],
        display: [/^(block|inline|inline-block)$/],
        margin: [css],
      },
    },
  });
}

async function alcaldeDe(mcpId: string): Promise<string> {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("miembros").select("perfiles(nombre)").eq("mcp_id", mcpId).eq("rol", "alcalde").eq("activo", true).maybeSingle();
  return (data?.perfiles as unknown as { nombre: string } | null)?.nombre ?? "";
}

/** Crea un borrador a partir de un modelo de ZEBAZ, uno propio o en blanco, y abre el editor. */
export async function crearDesdeModelo(fd: FormData) {
  const destino = "/secretaria/nuevo";
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const origen = texto(fd, "origen") ?? "";
  const [clase, clave] = origen.split(":");
  let tipo = "oficio";
  let asunto = "";
  let cuerpo = "";
  let modelo: string | null = null;
  if (clase === "base") {
    const m = MODELOS_BASE.find((x) => x.id === clave);
    if (!m) volver(destino, "error", "No se encontró el modelo.");
    tipo = m.tipo; asunto = m.asunto; cuerpo = m.cuerpo; modelo = m.nombre;
  } else if (clase === "propio") {
    const { data: m } = await supabase.from("sec_modelos").select("tipo, nombre, asunto, cuerpo").eq("id", clave).eq("mcp_id", ctx.mcp.id).maybeSingle();
    if (!m) volver(destino, "error", "No se encontró el modelo.");
    tipo = m.tipo; asunto = m.asunto ?? ""; cuerpo = m.cuerpo; modelo = m.nombre;
    // Modelos cargados desde Word antes de la hoja libre: ya traen su propio encabezado, no se les agrega otro
    if (!esLibre(cuerpo) && m.asunto && m.asunto === m.nombre.toUpperCase()) cuerpo = MARCA_LIBRE + membreteHtml(ctx.mcp) + `<div class="sec-cuerpo">${cuerpo}</div>`;
  } else if (clase === "blanco") {
    if (!TIPOS_SEC.some((t) => t.clave === clave)) volver(destino, "error", "Elija el tipo de documento.");
    tipo = clave; cuerpo = "<p><br></p>";
  } else volver(destino, "error", "Elija un modelo.");

  const fecha = hoyISO();
  const alcalde = await alcaldeDe(ctx.mcp.id);
  const vars = { municipalidad: ctx.mcp.nombre.toUpperCase(), alcalde: alcalde.toUpperCase(), lugar: lugarMcp(ctx.mcp.nombre), fecha };
  const { data, error } = await supabase
    .from("sec_documentos")
    .insert({
      mcp_id: ctx.mcp.id,
      tipo,
      anio: Number(fecha.slice(0, 4)),
      fecha,
      asunto: rellenar(asunto, vars),
      cuerpo: (esLibre(cuerpo) ? MARCA_LIBRE : "") + limpiar(rellenar(sinMarca(cuerpo), vars)),
      firmante: alcalde.toUpperCase() || null,
      firmante_cargo: alcalde ? "Alcalde" : null,
      modelo_origen: modelo,
    })
    .select("id")
    .single();
  if (error || !data) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/secretaria");
  redirect(`${ruta(data.id)}/editar`);
}

/** Guarda el contenido de la hoja en el borrador. Devuelve el id; si algo falla, vuelve con el aviso. */
async function persistir(fd: FormData, destino: string) {
  const id = texto(fd, "id") ?? "";
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const fecha = texto(fd, "fecha");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) volver(destino, "error", "Elija la fecha del documento.");
  const html = String(fd.get("cuerpo") ?? "");
  if (html.length > 3_000_000) volver(destino, "error", "El documento es demasiado pesado (imágenes muy grandes). Use imágenes más pequeñas.");
  const { error } = await supabase
    .from("sec_documentos")
    .update({
      fecha,
      destinatario: texto(fd, "destinatario"),
      asunto: texto(fd, "asunto") || "SIN ASUNTO",
      cuerpo: MARCA_LIBRE + limpiar(html),
    })
    .eq("id", id)
    .eq("mcp_id", ctx.mcp.id)
    .eq("estado", "borrador");
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/secretaria");
  return id;
}

export async function guardarBorrador(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  await persistir(fd, `${ruta(id)}/editar`);
  volver(ruta(id), "ok", "Borrador guardado. Revíselo y, si está bien, emítalo.");
}

/** «Ya terminé»: guarda lo que hay en la hoja y emite el documento (recibe su número). */
export async function guardarYEmitir(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const destino = `${ruta(id)}/editar`;
  await persistir(fd, destino);
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("sec_emitir", { p_id: id });
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/secretaria");
  redirect(`${ruta(id)}?emitido=1`);
}

/** Emite el documento: recibe su número correlativo y ya no se edita. */
export async function emitirDocumento(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  await permiso(ruta(id));
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("sec_emitir", { p_id: id });
  if (error) volver(ruta(id), "error", falta(mensajeError(error)));
  revalidatePath("/secretaria");
  redirect(`${ruta(id)}?emitido=1`);
}

export async function anularDocumento(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const ctx = await permiso(ruta(id));
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("sec_documentos").update({ estado: "anulado", anulado_motivo: texto(fd, "motivo") }).eq("id", id).eq("mcp_id", ctx.mcp.id);
  if (error) volver(ruta(id), "error", falta(mensajeError(error)));
  revalidatePath("/secretaria");
  volver(ruta(id), "ok", "Documento anulado. Queda en el archivo con su motivo.");
}

/** Copia un documento (emitido o no) como borrador nuevo, para reutilizarlo y editarlo. */
export async function clonarDocumento(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const ctx = await permiso(ruta(id));
  const supabase = await supabaseServidor();
  const { data: o } = await supabase.from("sec_documentos").select("*").eq("id", id).eq("mcp_id", ctx.mcp.id).maybeSingle();
  if (!o) volver("/secretaria", "error", "No se encontró el documento.");
  const fecha = hoyISO();
  const { data, error } = await supabase
    .from("sec_documentos")
    .insert({
      mcp_id: ctx.mcp.id,
      tipo: o.tipo,
      anio: Number(fecha.slice(0, 4)),
      fecha,
      destinatario: o.destinatario,
      destinatario_cargo: o.destinatario_cargo,
      asunto: o.asunto,
      referencia: o.referencia,
      cuerpo: o.cuerpo,
      firmante: o.firmante,
      firmante_cargo: o.firmante_cargo,
      con_copia: o.con_copia,
      modelo_origen: o.modelo_origen,
    })
    .select("id")
    .single();
  if (error || !data) volver(ruta(id), "error", falta(mensajeError(error)));
  revalidatePath("/secretaria");
  redirect(`${ruta(data.id)}/editar`);
}

/** Guarda el documento como modelo propio de la MCP, para usarlo otra vez. */
export async function guardarComoModelo(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const ctx = await permiso(ruta(id));
  const supabase = await supabaseServidor();
  const nombre = texto(fd, "nombre");
  if (!nombre) volver(ruta(id), "error", "Escriba un nombre para el modelo.");
  const { data: o } = await supabase.from("sec_documentos").select("tipo, asunto, cuerpo").eq("id", id).eq("mcp_id", ctx.mcp.id).maybeSingle();
  if (!o) volver(ruta(id), "error", "No se encontró el documento.");
  const { error } = await supabase.from("sec_modelos").insert({ mcp_id: ctx.mcp.id, tipo: o.tipo, nombre, asunto: o.asunto, cuerpo: o.cuerpo });
  if (error) volver(ruta(id), "error", falta(mensajeError(error)));
  revalidatePath("/secretaria/nuevo");
  volver(ruta(id), "ok", "Modelo guardado. Ya aparece en «Mis modelos».");
}

/** Un modelo propio no se borra: se archiva y deja de aparecer. */
export async function archivarModelo(fd: FormData) {
  const t = texto(fd, "tipo") ?? "";
  const destino = TIPOS_SEC.some((x) => x.clave === t) ? `/secretaria?tipo=${t}` : "/secretaria/nuevo";
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("sec_modelos").update({ activo: false }).eq("id", texto(fd, "id") ?? "").eq("mcp_id", ctx.mcp.id);
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/secretaria");
  volver(destino, "ok", "Modelo archivado.");
}

/** Adjunta el escaneado del documento ya firmado y sellado. */
export async function subirEscaneado(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const ctx = await permiso(ruta(id));
  const supabase = await supabaseServidor();
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) volver(ruta(id), "error", "Elija el PDF o la foto del documento firmado.");
  if (!TIPOS_ARCHIVO[archivo.type]) volver(ruta(id), "error", "Debe ser PDF o foto (JPG, PNG o WEBP).");
  if (archivo.size > 4 * 1024 * 1024) volver(ruta(id), "error", "El archivo pesa más de 4 MB. Use una foto con menos calidad.");
  const path = `${ctx.mcp.id}/secretaria/${id}/${Date.now()}.${TIPOS_ARCHIVO[archivo.type]}`;
  const { error: eS } = await supabase.storage.from("sustentos").upload(path, archivo, { contentType: archivo.type });
  if (eS) volver(ruta(id), "error", mensajeError(eS));
  const { error } = await supabase.from("sec_documentos").update({ archivo_path: path, archivo_nombre: archivo.name.slice(0, 160), archivo_tipo: archivo.type }).eq("id", id).eq("mcp_id", ctx.mcp.id);
  if (error) {
    await supabase.storage.from("sustentos").remove([path]);
    volver(ruta(id), "error", falta(mensajeError(error)));
  }
  revalidatePath("/secretaria");
  volver(ruta(id), "ok", "Documento firmado adjuntado al archivo.");
}

/** Carga un modelo propio desde un archivo de Word (.docx): queda en «Mis modelos» para usarlo y editarlo. */
export async function importarModeloWord(fd: FormData) {
  const tipoDestino = texto(fd, "tipo") ?? "";
  const destino = TIPOS_SEC.some((t) => t.clave === tipoDestino) ? `/secretaria?tipo=${tipoDestino}` : "/secretaria/nuevo";
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const nombre = texto(fd, "nombre");
  if (!nombre) volver(destino, "error", "Escriba un nombre para el modelo.");
  const tipo = texto(fd, "tipo") ?? "";
  if (!TIPOS_SEC.some((t) => t.clave === tipo)) volver(destino, "error", "Elija el tipo de documento.");
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) volver(destino, "error", "Elija el archivo de Word (.docx).");
  if (/\.pdf$/i.test(archivo.name)) volver(destino, "error", "Un PDF no se puede convertir en texto editable. Suba el archivo de Word (.docx) del modelo; si solo tiene el PDF, copie su texto y péguelo en un documento en blanco.");
  if (!/\.docx$/i.test(archivo.name)) volver(destino, "error", "El archivo debe ser de Word en formato .docx. Si es un .doc antiguo, ábralo en Word y use «Guardar como .docx».");
  if (archivo.size > 4 * 1024 * 1024) volver(destino, "error", "El archivo pesa más de 4 MB.");
  let html = "";
  try {
    const r = await mammoth.convertToHtml({ buffer: Buffer.from(await archivo.arrayBuffer()) });
    html = limpiar(membreteHtml(ctx.mcp) + `<div class="sec-cuerpo">${r.value}</div>`);
  } catch {
    volver(destino, "error", "No se pudo leer el archivo. Verifique que sea un .docx válido.");
  }
  if (!html.replace(/<[^>]*>/g, "").trim()) volver(destino, "error", "El archivo no tiene texto.");
  const { error } = await supabase.from("sec_modelos").insert({ mcp_id: ctx.mcp.id, tipo, nombre, asunto: nombre.toUpperCase(), cuerpo: MARCA_LIBRE + html });
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath(destino);
  volver(destino, "ok", "Modelo cargado. Ya aparece en «Mis modelos»: úselo y edítelo como cualquier otro.");
}
