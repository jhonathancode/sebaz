"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { obtenerContexto } from "@/lib/contexto";
import { modulosDeFormulario } from "@/lib/modulos";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";

/** La clave temporal no viaja en la URL: se guarda 2 minutos en una cookie privada. */
async function guardarClaveTemporal(correo: string, clave: string) {
  (await cookies()).set("clave_temporal", JSON.stringify({ correo, clave }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/soporte",
    maxAge: 120,
  });
}

async function soloSoporte() {
  const ctx = await obtenerContexto();
  if (!ctx.esSoporte) volver("/", "error", "Solo soporte puede hacer esto.");
  return ctx;
}

export async function crearMcp(fd: FormData) {
  const ctx = await soloSoporte();
  const supabase = await supabaseServidor();
  const ruc = (texto(fd, "ruc") ?? "").replace(/\D/g, "");
  const { data: mcp, error } = await supabase
    .from("mcps")
    .insert({
      nombre: texto(fd, "nombre"),
      ruc: ruc || null,
      distrito: texto(fd, "distrito"),
      provincia: texto(fd, "provincia"),
      departamento: texto(fd, "departamento"),
      // Módulos que el superadmin le habilita (si el formulario no los envía, todos)
      ...(fd.has("modulos") || fd.has("con_modulos") ? { modulos: modulosDeFormulario(fd) } : {}),
    })
    .select("id")
    .single();
  if (error || !mcp) volver("/soporte", "error", mensajeError(error));

  const fuentes = [];
  const montoDistrito = numero(fd, "monto_distrito");
  const montoProvincia = numero(fd, "monto_provincia");
  if (montoDistrito !== null) {
    fuentes.push({
      mcp_id: mcp.id,
      tipo: "distrito",
      municipalidad: texto(fd, "muni_distrito") ?? `Municipalidad Distrital de ${texto(fd, "distrito") ?? ""}`,
      monto_mensual: montoDistrito,
      formato: texto(fd, "formato_distrito") ?? "general",
    });
  }
  if (montoProvincia !== null) {
    fuentes.push({
      mcp_id: mcp.id,
      tipo: "provincia",
      municipalidad: texto(fd, "muni_provincia") ?? `Municipalidad Provincial de ${texto(fd, "provincia") ?? ""}`,
      monto_mensual: montoProvincia,
      formato: texto(fd, "formato_provincia") ?? "general",
    });
  }
  if (fuentes.length) {
    const { error: e2 } = await supabase.from("fuentes").insert(fuentes);
    if (e2) volver(`/soporte?mcp=${mcp.id}`, "error", "MCP creada, pero no sus transferencias: " + mensajeError(e2));
  }
  revalidatePath("/soporte");
  revalidatePath("/superadmin/clientes");
  if (ctx.esSuperadmin) volver(`/superadmin/clientes/${mcp.id}`, "ok", "Cliente dado de alta con 3 meses de prueba. Ahora cree sus usuarios en «Activaciones y relevos».");
  volver(`/soporte?mcp=${mcp.id}`, "ok", "MCP registrada. Ahora cree sus usuarios.");
}

/** Crea el usuario si no existe y devuelve su id y, si es nuevo, su clave temporal. */
async function usuarioPorCorreo(correo: string, nombre: string): Promise<{ id: string; clave?: string }> {
  const admin = supabaseServicio();
  const clave = randomBytes(9).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (data?.user) return { id: data.user.id, clave };
  if (error && /already/i.test(error.message)) {
    for (let pagina = 1; pagina <= 20; pagina++) {
      const { data: lista } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      const u = lista?.users.find((x) => x.email?.toLowerCase() === correo.toLowerCase());
      if (u) return { id: u.id };
      if (!lista || lista.users.length < 200) break;
    }
  }
  throw new Error(error?.message ?? "No se pudo crear el usuario.");
}

export async function agregarUsuario(fd: FormData) {
  await soloSoporte();
  const mcpId = texto(fd, "mcp_id")!;
  const destino = `/soporte?mcp=${mcpId}`;
  const correo = texto(fd, "correo");
  const nombre = texto(fd, "nombre") ?? "";
  if (!correo) volver(destino, "error", "Escriba el correo.");
  let usuario: { id: string; clave?: string };
  try {
    usuario = await usuarioPorCorreo(correo, nombre);
  } catch (e) {
    volver(destino, "error", (e as Error).message);
  }
  const supabase = await supabaseServidor();
  if (nombre) await supabaseServicio().from("perfiles").update({ nombre, dni: texto(fd, "dni") }).eq("id", usuario.id);
  const { error } = await supabase.from("miembros").insert({
    mcp_id: mcpId,
    user_id: usuario.id,
    rol: texto(fd, "rol"),
    cargo: texto(fd, "cargo"),
    desde: texto(fd, "desde"),
  });
  if (error) volver(destino, "error", mensajeError(error));
  revalidatePath("/soporte");
  if (usuario.clave) await guardarClaveTemporal(correo, usuario.clave);
  volver(destino, "ok", usuario.clave ? "Usuario creado." : "El usuario ya existía: se le agregó el cargo en esta MCP.");
}

const TIPOS_DOC_RELEVO = ["resolucion", "memorando", "acta", "otro"];
const MIME_DOC = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Relevo con respaldo: exige el documento que designa a quien entra (resolución, memorando o
 * acta) y a quién se llamó para confirmarlo. Todo queda guardado junto al relevo.
 */
export async function registrarRelevo(fd: FormData) {
  const ctx = await soloSoporte();
  const mcpId = texto(fd, "mcp_id")!;
  const destino = `/soporte?mcp=${mcpId}`;
  const correo = texto(fd, "correo");
  if (!correo) volver(destino, "error", "Escriba el correo de quien entra.");
  const tipoDoc = texto(fd, "documento_tipo") ?? "";
  if (!TIPOS_DOC_RELEVO.includes(tipoDoc)) volver(destino, "error", "Elija qué documento respalda el relevo.");
  const archivo = fd.get("documento");
  if (!(archivo instanceof File) || archivo.size === 0) volver(destino, "error", "Suba el documento que designa a quien entra (PDF o foto).");
  if (archivo.size > 4 * 1024 * 1024) volver(destino, "error", "El documento pesa más de 4 MB. Suba una versión más liviana.");
  if (!MIME_DOC.includes(archivo.type)) volver(destino, "error", "El documento debe ser PDF, JPG o PNG.");
  const confirmado = texto(fd, "confirmado_con");
  if (!confirmado || confirmado.length < 5) volver(destino, "error", "Escriba con quién confirmó el cambio (por ejemplo, el alcalde) y cómo.");

  let usuario: { id: string; clave?: string };
  try {
    usuario = await usuarioPorCorreo(correo, texto(fd, "nombre") ?? "");
  } catch (e) {
    volver(destino, "error", (e as Error).message);
  }
  const servicio = supabaseServicio();
  const extension = archivo.type === "application/pdf" ? "pdf" : archivo.type === "image/png" ? "png" : "jpg";
  const ruta = `${mcpId}/${Date.now()}-${tipoDoc}.${extension}`;
  const { error: eSubida } = await servicio.storage.from("relevos").upload(ruta, archivo, { contentType: archivo.type });
  if (eSubida) volver(destino, "error", "No se pudo guardar el documento: " + eSubida.message);

  if (texto(fd, "nombre")) await servicio.from("perfiles").update({ nombre: texto(fd, "nombre") }).eq("id", usuario.id);
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("registrar_relevo", {
    p_mcp: mcpId,
    p_sale: texto(fd, "sale"),
    p_entra: usuario.id,
    p_rol: texto(fd, "rol"),
    p_fecha: texto(fd, "fecha"),
  });
  if (error) {
    await servicio.storage.from("relevos").remove([ruta]);
    volver(destino, "error", mensajeError(error));
  }
  const { error: eRegistro } = await supabase.from("relevos").insert({
    mcp_id: mcpId,
    sale: texto(fd, "sale"),
    entra: usuario.id,
    rol: texto(fd, "rol"),
    fecha: texto(fd, "fecha"),
    documento_tipo: tipoDoc,
    documento_numero: texto(fd, "documento_numero"),
    documento_path: ruta,
    confirmado_con: confirmado,
    registrado_por: ctx.userId,
  });
  if (usuario.clave) await guardarClaveTemporal(correo, usuario.clave);
  revalidatePath("/soporte");
  if (eRegistro) volver(destino, "ok", "Relevo registrado, pero no se pudo guardar su constancia: " + mensajeError(eRegistro));
  volver(destino, "ok", "Relevo registrado con su documento de respaldo: quien sale pierde el acceso desde esa fecha. Si es tesorería, la gestión anterior tiene 30 días de gracia y luego queda bloqueada.");
}

/** Borra el PIN de una persona: al ingresar tendrá que elegir uno nuevo. Queda en la auditoría. */
export async function restablecerPin(fd: FormData) {
  const ctx = await soloSoporte();
  const usuario = texto(fd, "user_id")!;
  const destino = texto(fd, "volver") ?? "/soporte";
  const servicio = supabaseServicio();
  const { error } = await servicio
    .from("perfil_seguridad")
    .update({ pin_hash: null, pin_actualizado_en: null, pin_intentos: 0, pin_bloqueado_hasta: null })
    .eq("user_id", usuario);
  if (error) volver(destino, "error", "No se pudo restablecer el PIN.");
  await servicio.from("auditoria").insert({ mcp_id: texto(fd, "mcp_id"), user_id: ctx.userId, tabla: "perfil_seguridad", registro_id: usuario, accion: "restablecer_pin" });
  volver(destino, "ok", "PIN restablecido: la persona elegirá uno nuevo al ingresar.");
}

export async function cambiarEstadoMcp(fd: FormData) {
  await soloSoporte();
  const supabase = await supabaseServidor();
  const mcpId = texto(fd, "mcp_id")!;
  const { error } = await supabase
    .from("mcps")
    .update({ estado: texto(fd, "estado"), prueba_hasta: texto(fd, "prueba_hasta") })
    .eq("id", mcpId);
  if (error) volver(`/soporte?mcp=${mcpId}`, "error", mensajeError(error));
  volver(`/soporte?mcp=${mcpId}`, "ok", "Estado de la MCP actualizado.");
}
