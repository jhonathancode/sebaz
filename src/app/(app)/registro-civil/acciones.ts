"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";
import { COLUMNAS_IMPORT } from "@/lib/registroCivil";

const TIPOS_ARCHIVO: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TIPOS_VALIDOS = ["nacimiento", "matrimonio", "defuncion", "otro"];
const may = (v: string | null) => (v ? v.toUpperCase() : null);
const soloDni = (v: string | null) => (v ?? "").replace(/\D/g, "");

async function permiso(destino: string) {
  const ctx = await contextoMcp();
  if (!ctx.mcp.modulos?.includes("registro_civil")) volver("/", "error", "El módulo de Registro Civil no está habilitado.");
  if (!tiene(ctx, "admin", "tesorero", "contador", "alcalde")) volver(destino, "error", "No tiene permiso para registrar en el padrón.");
  return ctx;
}

type Campos = Record<string, string | null>;

/** Lee y valida los campos de un registro (alta o edición). */
function leerRegistro(fd: FormData, destino: string): Campos {
  const tipo = texto(fd, "tipo") ?? "nacimiento";
  if (!TIPOS_VALIDOS.includes(tipo)) volver(destino, "error", "Elija el tipo de acta.");
  const ap = may(texto(fd, "apellido_paterno"));
  const nombres = may(texto(fd, "nombres"));
  if (!ap || !nombres) volver(destino, "error", "Escriba el apellido paterno y los nombres.");
  const dni = soloDni(texto(fd, "dni"));
  if (dni && dni.length !== 8) volver(destino, "error", "El DNI tiene 8 dígitos.");
  const dniC = soloDni(texto(fd, "conyuge_dni"));
  if (dniC && dniC.length !== 8) volver(destino, "error", "El DNI del cónyuge tiene 8 dígitos.");
  const fecha = texto(fd, "fecha_acto");
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) volver(destino, "error", "La fecha no es válida.");
  const sexo = texto(fd, "sexo");
  return {
    tipo,
    numero_acta: may(texto(fd, "numero_acta")),
    libro: may(texto(fd, "libro")),
    folio: may(texto(fd, "folio")),
    expediente: may(texto(fd, "expediente")),
    ubicacion: may(texto(fd, "ubicacion")),
    fecha_acto: fecha,
    lugar: may(texto(fd, "lugar")),
    apellido_paterno: ap,
    apellido_materno: may(texto(fd, "apellido_materno")),
    nombres,
    dni: dni || null,
    sexo: sexo === "M" || sexo === "F" ? sexo : null,
    padre: may(texto(fd, "padre")),
    madre: may(texto(fd, "madre")),
    conyuge_nombre: may(texto(fd, "conyuge_nombre")),
    conyuge_dni: dniC || null,
    observaciones: may(texto(fd, "observaciones")),
    origen: texto(fd, "origen") === "digital" ? "digital" : "fisico",
  };
}

function leerArchivo(fd: FormData, destino: string): File | null {
  const archivos = fd.getAll("archivo").filter((x): x is File => x instanceof File && x.size > 0);
  if (archivos.length > 1) volver(destino, "error", "Suba un archivo a la vez (una foto o un PDF).");
  const a = archivos[0] ?? null;
  if (a && !TIPOS_ARCHIVO[a.type]) volver(destino, "error", "La partida debe ser PDF o foto (JPG, PNG o WEBP).");
  if (a && a.size > 4 * 1024 * 1024) volver(destino, "error", "El archivo pesa más de 4 MB. Use una foto con menos calidad.");
  return a;
}

async function guardarArchivo(mcpId: string, registroId: string, archivo: File, descripcion: string) {
  const supabase = await supabaseServidor();
  const ruta = `${mcpId}/registro-civil/${registroId}/${Date.now()}.${TIPOS_ARCHIVO[archivo.type]}`;
  const { error: eSubida } = await supabase.storage.from("sustentos").upload(ruta, archivo, { contentType: archivo.type });
  if (eSubida) return mensajeError(eSubida);
  const { error } = await supabase.from("rc_archivos").insert({
    mcp_id: mcpId,
    registro_id: registroId,
    descripcion,
    archivo_path: ruta,
    archivo_nombre: archivo.name.slice(0, 160),
    archivo_tipo: archivo.type,
    archivo_tamano: archivo.size,
  });
  if (error) {
    await supabase.storage.from("sustentos").remove([ruta]);
    return mensajeError(error);
  }
  return null;
}

const falta = (m: string) => (/rc_registros|rc_archivos|rc_entregas|schema cache/.test(m) ? "Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte." : m);

export async function crearRegistro(fd: FormData) {
  const destino = "/registro-civil";
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const campos = leerRegistro(fd, destino);
  const archivo = leerArchivo(fd, destino);
  const { data, error } = await supabase.from("rc_registros").insert({ mcp_id: ctx.mcp.id, ...campos }).select("id").single();
  if (error || !data) volver(destino, "error", falta(mensajeError(error)));
  let aviso = "Registro guardado en el padrón.";
  if (archivo) {
    const e = await guardarArchivo(ctx.mcp.id, data.id, archivo, texto(fd, "descripcion") ?? "Partida");
    if (e) volver(`/registro-civil/${data.id}`, "error", `El registro se guardó, pero la partida no se pudo subir: ${falta(e)}`);
    aviso = "Registro guardado con su partida adjunta.";
  }
  revalidatePath("/registro-civil");
  volver(`/registro-civil/${data.id}`, "ok", aviso);
}

export async function editarRegistro(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const destino = `/registro-civil/${id}`;
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const campos = leerRegistro(fd, destino);
  const { error } = await supabase.from("rc_registros").update(campos).eq("id", id).eq("mcp_id", ctx.mcp.id);
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/registro-civil");
  volver(destino, "ok", "Datos actualizados. El cambio queda en el historial.");
}

export async function anularRegistro(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const destino = `/registro-civil/${id}`;
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const motivo = texto(fd, "motivo");
  if (!motivo) volver(destino, "error", "Escriba el motivo.");
  const { error } = await supabase.from("rc_registros").update({ estado: "anulado", anulado_motivo: motivo }).eq("id", id).eq("mcp_id", ctx.mcp.id);
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/registro-civil");
  volver(destino, "ok", "Registro anulado. Queda en el padrón con su motivo.");
}

export async function restaurarRegistro(fd: FormData) {
  const id = texto(fd, "id") ?? "";
  const destino = `/registro-civil/${id}`;
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("rc_registros").update({ estado: "vigente", anulado_motivo: null }).eq("id", id).eq("mcp_id", ctx.mcp.id);
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/registro-civil");
  volver(destino, "ok", "Registro vigente otra vez.");
}

export async function subirPartida(fd: FormData) {
  const id = texto(fd, "registro_id") ?? "";
  const destino = `/registro-civil/${id}`;
  const ctx = await permiso(destino);
  const archivo = leerArchivo(fd, destino);
  if (!archivo) volver(destino, "error", "Elija la foto o el PDF de la partida.");
  const e = await guardarArchivo(ctx.mcp.id, id, archivo, texto(fd, "descripcion") ?? "Partida");
  if (e) volver(destino, "error", falta(e));
  revalidatePath("/registro-civil");
  volver(destino, "ok", "Partida adjuntada. Ya se puede imprimir desde aquí.");
}

/** Un archivo subido por error no se borra: se anula con motivo y queda en el historial. */
export async function anularPartida(fd: FormData) {
  const id = texto(fd, "registro_id") ?? "";
  const destino = `/registro-civil/${id}`;
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const motivo = texto(fd, "motivo");
  if (!motivo) volver(destino, "error", "Escriba el motivo.");
  const { error } = await supabase.from("rc_archivos").update({ anulado: true, anulado_motivo: motivo }).eq("id", texto(fd, "id") ?? "").eq("mcp_id", ctx.mcp.id);
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath("/registro-civil");
  volver(destino, "ok", "Archivo anulado. Queda en el historial.");
}

/** Deja constancia de a quién se le entregó una copia. */
export async function registrarEntrega(fd: FormData) {
  const id = texto(fd, "registro_id") ?? "";
  const destino = `/registro-civil/${id}`;
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const dni = soloDni(texto(fd, "solicitante_dni"));
  if (dni && dni.length !== 8) volver(destino, "error", "El DNI tiene 8 dígitos.");
  const nombre = may(texto(fd, "solicitante_nombre"));
  if (!nombre) volver(destino, "error", "Escriba el nombre de quien pidió la copia.");
  const { error } = await supabase.from("rc_entregas").insert({
    mcp_id: ctx.mcp.id,
    registro_id: id,
    solicitante_nombre: nombre,
    solicitante_dni: dni || null,
    motivo: may(texto(fd, "motivo")),
  });
  if (error) volver(destino, "error", falta(mensajeError(error)));
  revalidatePath(destino);
  volver(destino, "ok", "Entrega registrada.");
}

// ---------------------------------------------------------------------
// Importar el padrón histórico desde Excel
// ---------------------------------------------------------------------


const celda = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
    if ("result" in v) return String(v.result ?? "").trim();
  }
  return String(v).trim();
};
const quitaTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

function fechaIso(v: string): string | null {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export async function importarPadron(fd: FormData) {
  const destino = "/registro-civil/importar";
  const ctx = await permiso(destino);
  const supabase = await supabaseServidor();
  const archivo = fd.get("excel");
  if (!(archivo instanceof File) || archivo.size === 0) volver(destino, "error", "Elija el archivo de Excel.");
  if (archivo.size > 8 * 1024 * 1024) volver(destino, "error", "El Excel pesa más de 8 MB. Súbalo por partes.");
  const origen = texto(fd, "origen") === "digital" ? "digital" : "fisico";

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(await archivo.arrayBuffer());
  } catch {
    volver(destino, "error", "No se pudo leer el archivo. Use un Excel .xlsx (puede guardar su hoja como .xlsx desde Excel).");
  }
  const hoja = libro.worksheets[0];
  if (!hoja) volver(destino, "error", "El Excel no tiene hojas.");

  // Cabeceras (fila 1): se reconocen sin importar tildes ni mayúsculas
  const idx: Record<string, number> = {};
  hoja.getRow(1).eachCell((c, n) => {
    idx[quitaTildes(celda(c.value))] = n;
  });
  const col = (nombre: string) => idx[quitaTildes(nombre)];
  if (!col("APELLIDO PATERNO") || !col("NOMBRES")) volver(destino, "error", "No encuentro las columnas «APELLIDO PATERNO» y «NOMBRES» en la primera fila. Descargue la plantilla y copie sus datos ahí.");

  const lee = (fila: ExcelJS.Row, nombre: string) => (col(nombre) ? celda(fila.getCell(col(nombre)).value) : "");
  const filas: Record<string, unknown>[] = [];
  const omitidas: string[] = [];
  hoja.eachRow((fila, n) => {
    if (n === 1) return;
    const ap = lee(fila, "APELLIDO PATERNO").toUpperCase();
    const nom = lee(fila, "NOMBRES").toUpperCase();
    if (!ap && !nom) return;
    if (!ap || !nom) return void omitidas.push(`fila ${n}: falta apellido o nombres`);
    const dni = lee(fila, "DNI").replace(/\D/g, "");
    if (dni && dni.length !== 8) return void omitidas.push(`fila ${n}: DNI de ${dni.length} dígitos`);
    const dniC = lee(fila, "DNI CÓNYUGE").replace(/\D/g, "");
    const t = quitaTildes(lee(fila, "TIPO"));
    const tipo = t.startsWith("MAT") ? "matrimonio" : t.startsWith("DEF") ? "defuncion" : t.startsWith("NAC") || !t ? "nacimiento" : "otro";
    const sx = quitaTildes(lee(fila, "SEXO")).slice(0, 1);
    const u = (n2: string) => lee(fila, n2).toUpperCase() || null;
    filas.push({
      mcp_id: ctx.mcp.id,
      tipo,
      apellido_paterno: ap,
      apellido_materno: u("APELLIDO MATERNO"),
      nombres: nom,
      dni: dni || null,
      sexo: sx === "M" || sx === "F" ? sx : null,
      fecha_acto: fechaIso(lee(fila, "FECHA")),
      lugar: u("LUGAR"),
      numero_acta: u("N° ACTA"),
      libro: u("LIBRO"),
      folio: u("FOLIO"),
      expediente: u("N° EXPEDIENTE"),
      ubicacion: u("UBICACIÓN"),
      padre: u("PADRE"),
      madre: u("MADRE"),
      conyuge_nombre: u("CÓNYUGE"),
      conyuge_dni: dniC.length === 8 ? dniC : null,
      observaciones: u("OBSERVACIONES"),
      origen,
    });
  });
  if (filas.length === 0) volver(destino, "error", omitidas.length ? `No se importó nada. ${omitidas.slice(0, 3).join("; ")}.` : "El Excel no tiene filas con datos.");
  if (filas.length > 5000) volver(destino, "error", "Son más de 5 000 filas. Súbalas en varios archivos.");

  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from("rc_registros").insert(filas.slice(i, i + 500));
    if (error) volver(destino, "error", `Se importaron ${i} filas y falló el siguiente grupo: ${falta(mensajeError(error))}`);
  }
  revalidatePath("/registro-civil");
  const extra = omitidas.length ? ` Se omitieron ${omitidas.length} (${omitidas.slice(0, 3).join("; ")}${omitidas.length > 3 ? "…" : ""}).` : "";
  volver("/registro-civil", "ok", `Se importaron ${filas.length} registros al padrón.${extra}`);
}
