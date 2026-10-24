"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { obtenerContexto } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { modulosDeFormulario } from "@/lib/modulos";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";

async function soloSuperadmin(destino = "/superadmin") {
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) volver(destino, "error", "Solo el superadmin puede hacer esto.");
  return ctx;
}

const cliente = (id: string) => `/superadmin/clientes/${id}`;

/** Plan, precio pactado, ciclo y vencimiento de un cliente. */
export async function guardarSuscripcion(fd: FormData) {
  await soloSuperadmin();
  const supabase = await supabaseServidor();
  const mcp = texto(fd, "mcp_id")!;
  const { error } = await supabase
    .from("suscripciones")
    .update({
      plan_id: texto(fd, "plan_id"),
      ciclo: texto(fd, "ciclo") ?? "mensual",
      precio: numero(fd, "precio") ?? 0,
      vence_el: texto(fd, "vence_el"),
      dias_gracia: numero(fd, "dias_gracia") ?? 10,
      notas: texto(fd, "notas"),
      actualizado_en: new Date().toISOString(),
    })
    .eq("mcp_id", mcp);
  if (error) volver(cliente(mcp), "error", mensajeError(error));
  revalidatePath("/superadmin/clientes");
  volver(cliente(mcp), "ok", "Suscripción actualizada.");
}

/** Qué módulos tiene habilitados un cliente. Quitar un módulo solo lo oculta: no borra datos. */
export async function guardarModulos(fd: FormData) {
  await soloSuperadmin();
  const supabase = await supabaseServidor();
  const mcp = texto(fd, "mcp_id")!;
  const { error } = await supabase.from("mcps").update({ modulos: modulosDeFormulario(fd) }).eq("id", mcp);
  if (error) volver(cliente(mcp), "error", mensajeError(error));
  revalidatePath("/superadmin/clientes");
  revalidatePath("/", "layout");
  volver(cliente(mcp), "ok", "Módulos actualizados. Los datos de los módulos quitados se conservan.");
}

export async function registrarPago(fd: FormData) {
  await soloSuperadmin();
  const supabase = await supabaseServidor();
  const mcp = texto(fd, "mcp_id")!;
  const monto = numero(fd, "monto");
  const meses = numero(fd, "meses");
  if (!monto || monto <= 0) volver(cliente(mcp), "error", "Escriba el monto pagado.");
  if (!meses || meses < 1) volver(cliente(mcp), "error", "Indique cuántos meses cubre el pago.");
  const { error } = await supabase.rpc("registrar_pago_cliente", {
    p_mcp: mcp,
    p_fecha: texto(fd, "fecha"),
    p_monto: monto,
    p_meses: meses,
    p_medio: texto(fd, "medio"),
    p_operacion: texto(fd, "operacion"),
    p_comprobante: texto(fd, "comprobante"),
  });
  if (error) volver(cliente(mcp), "error", mensajeError(error));
  revalidatePath("/superadmin/clientes");
  volver(cliente(mcp), "ok", "Pago registrado: el vencimiento se extendió y el cliente queda activo.");
}

export async function anularPago(fd: FormData) {
  await soloSuperadmin();
  const supabase = await supabaseServidor();
  const mcp = texto(fd, "mcp_id")!;
  const { error } = await supabase.rpc("anular_pago_cliente", { p_pago: texto(fd, "id"), p_motivo: texto(fd, "motivo") });
  if (error) volver(cliente(mcp), "error", mensajeError(error));
  revalidatePath("/superadmin/clientes");
  volver(cliente(mcp), "ok", "Pago anulado: el vencimiento se corrigió.");
}

/** Suspender (sus usuarios ven «servicio suspendido») o reactivar un cliente. */
export async function cambiarEstadoCliente(fd: FormData) {
  await soloSuperadmin();
  const supabase = await supabaseServidor();
  const mcp = texto(fd, "mcp_id")!;
  const estado = texto(fd, "estado");
  if (!["activa", "prueba", "suspendida"].includes(estado ?? "")) volver(cliente(mcp), "error", "Estado no válido.");
  const { error } = await supabase.from("mcps").update({ estado }).eq("id", mcp);
  if (error) volver(cliente(mcp), "error", mensajeError(error));
  revalidatePath("/superadmin/clientes");
  volver(cliente(mcp), "ok", estado === "suspendida" ? "Cliente suspendido: sus usuarios ya no pueden trabajar. Sus datos se conservan." : "Cliente reactivado.");
}

export async function guardarPlan(fd: FormData) {
  await soloSuperadmin("/superadmin/planes");
  const supabase = await supabaseServidor();
  const id = texto(fd, "id");
  const datos = {
    nombre: texto(fd, "nombre"),
    descripcion: texto(fd, "descripcion"),
    precio_mensual: numero(fd, "precio_mensual") ?? 0,
    precio_anual: numero(fd, "precio_anual"),
    activo: texto(fd, "activo") !== "0",
  };
  const { error } = id ? await supabase.from("planes").update(datos).eq("id", id) : await supabase.from("planes").insert(datos);
  if (error) volver("/superadmin/planes", "error", mensajeError(error));
  revalidatePath("/superadmin/clientes");
  volver("/superadmin/planes", "ok", id ? "Plan actualizado." : "Plan creado.");
}

/** Bloquea o desbloquea el acceso de un usuario a todo el sistema. */
export async function bloquearUsuario(fd: FormData) {
  await soloSuperadmin("/superadmin/usuarios");
  const id = texto(fd, "user_id")!;
  const bloquear = texto(fd, "bloquear") === "1";
  const { error } = await supabaseServicio().auth.admin.updateUserById(id, { ban_duration: bloquear ? "876000h" : "none" });
  if (error) volver("/superadmin/usuarios", "error", error.message);
  volver("/superadmin/usuarios", "ok", bloquear ? "Usuario bloqueado: ya no puede ingresar." : "Usuario desbloqueado.");
}

/** Clave temporal nueva (se ve una sola vez, 2 minutos). */
export async function nuevaClave(fd: FormData) {
  await soloSuperadmin("/superadmin/usuarios");
  const id = texto(fd, "user_id")!;
  const correo = texto(fd, "correo") ?? "";
  const clave = randomBytes(9).toString("base64url");
  const { error } = await supabaseServicio().auth.admin.updateUserById(id, { password: clave });
  if (error) volver("/superadmin/usuarios", "error", error.message);
  (await cookies()).set("clave_temporal_sa", JSON.stringify({ correo, clave }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/superadmin",
    maxAge: 120,
  });
  volver("/superadmin/usuarios", "ok", "Clave temporal generada.");
}

/** Dar o quitar acceso de soporte a una persona (por correo). */
export async function cambiarSoporte(fd: FormData) {
  await soloSuperadmin("/superadmin/equipo");
  const correo = (texto(fd, "correo") ?? "").toLowerCase();
  const dar = texto(fd, "dar") === "1";
  const admin = supabaseServicio();
  let id = texto(fd, "user_id");
  if (!id) {
    for (let pagina = 1; pagina <= 20 && !id; pagina++) {
      const { data } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      id = data?.users.find((u) => u.email?.toLowerCase() === correo)?.id ?? null;
      if (!data || data.users.length < 200) break;
    }
  }
  if (!id) volver("/superadmin/equipo", "error", "No hay un usuario con ese correo. Créelo primero desde el panel de soporte.");
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("perfiles").update({ es_soporte: dar }).eq("id", id);
  if (error) volver("/superadmin/equipo", "error", mensajeError(error));
  volver("/superadmin/equipo", "ok", dar ? "Acceso de soporte otorgado." : "Acceso de soporte retirado.");
}

/** Envía un mensaje o una novedad del sistema a todos o a una municipalidad. */
export async function enviarMensaje(fd: FormData) {
  const ctx = await soloSuperadmin("/superadmin/mensajes");
  const tipo = texto(fd, "tipo") === "sistema" ? "sistema" : "mensaje";
  const titulo = texto(fd, "titulo");
  const detalle = texto(fd, "detalle");
  const para = texto(fd, "para") ?? "todos";
  if (!titulo || titulo.length < 4) volver("/superadmin/mensajes", "error", "Escriba un título (mínimo 4 letras).");
  if (titulo.length > 120 || (detalle?.length ?? 0) > 600) volver("/superadmin/mensajes", "error", "El título admite 120 letras y el texto 600.");
  const servicio = supabaseServicio();
  let consulta = servicio.from("miembros").select("user_id, mcp_id").eq("activo", true);
  if (para !== "todos") consulta = consulta.eq("mcp_id", para);
  const { data: miembros, error } = await consulta;
  if (error) volver("/superadmin/mensajes", "error", mensajeError(error));
  const destinos = new Map<string, string | null>();
  for (const m of miembros ?? []) if (!destinos.has(m.user_id)) destinos.set(m.user_id, m.mcp_id);
  if (destinos.size === 0) volver("/superadmin/mensajes", "error", "No hay usuarios activos a quienes enviar.");
  const filas = [...destinos].map(([user_id, mcp_id]) => ({ user_id, mcp_id, tipo, titulo, detalle, de: ctx.userId }));
  const { error: e2 } = await servicio.from("notificaciones").insert(filas);
  if (e2) volver("/superadmin/mensajes", "error", mensajeError(e2));
  revalidatePath("/", "layout");
  volver("/superadmin/mensajes", "ok", `Mensaje enviado a ${destinos.size} persona(s).`);
}
