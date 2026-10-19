"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { obtenerContexto } from "@/lib/contexto";
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
  await soloSoporte();
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

export async function registrarRelevo(fd: FormData) {
  await soloSoporte();
  const mcpId = texto(fd, "mcp_id")!;
  const destino = `/soporte?mcp=${mcpId}`;
  const correo = texto(fd, "correo");
  if (!correo) volver(destino, "error", "Escriba el correo de quien entra.");
  let usuario: { id: string; clave?: string };
  try {
    usuario = await usuarioPorCorreo(correo, texto(fd, "nombre") ?? "");
  } catch (e) {
    volver(destino, "error", (e as Error).message);
  }
  if (texto(fd, "nombre")) await supabaseServicio().from("perfiles").update({ nombre: texto(fd, "nombre") }).eq("id", usuario.id);
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("registrar_relevo", {
    p_mcp: mcpId,
    p_sale: texto(fd, "sale"),
    p_entra: usuario.id,
    p_rol: texto(fd, "rol"),
    p_fecha: texto(fd, "fecha"),
  });
  if (error) volver(destino, "error", mensajeError(error));
  if (usuario.clave) await guardarClaveTemporal(correo, usuario.clave);
  volver(destino, "ok", "Relevo registrado: quien sale pierde el acceso desde esa fecha.");
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
