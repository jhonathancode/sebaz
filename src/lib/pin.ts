import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { volver } from "./acciones";
import { obtenerContexto } from "./contexto";
import { supabaseServicio } from "./supabase/server";

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

export function hashPin(pin: string): string {
  const sal = randomBytes(16);
  return `s1$${sal.toString("hex")}$${scryptSync(pin, sal, 32).toString("hex")}`;
}

export function pinCorrecto(pin: string, guardado: string): boolean {
  const [version, sal, hash] = guardado.split("$");
  if (version !== "s1" || !sal || !hash) return false;
  const calculado = scryptSync(pin, Buffer.from(sal, "hex"), 32);
  const esperado = Buffer.from(hash, "hex");
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** 4 dígitos, sin repetir el mismo número ni seguir una secuencia. */
export function pinValido(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "El PIN debe tener 4 números.";
  if (/^(\d)\1+$/.test(pin)) return "El PIN no puede ser un solo número repetido.";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "El PIN no puede ser una secuencia (1234, 4321...).";
  return null;
}

/**
 * Pide el PIN de quien actúa antes de una acción delicada (aprobar, generar el
 * comprobante o la rendición). Si el PIN falla 5 veces se bloquea 15 minutos.
 * Si la base aún no tiene la actualización o la persona no tiene PIN, no estorba.
 */
export async function verificarPin(userId: string, fd: FormData): Promise<string | null> {
  // El PIN es opcional por MCP: si no está activado en Configuración, no se pide
  if (!(await pinActivado())) return null;
  let registro: { pin_hash: string | null; pin_intentos: number; pin_bloqueado_hasta: string | null } | null = null;
  try {
    const { data, error } = await supabaseServicio()
      .from("perfil_seguridad")
      .select("pin_hash, pin_intentos, pin_bloqueado_hasta")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    registro = data;
  } catch {
    return null;
  }
  if (!registro?.pin_hash) return null;

  if (registro.pin_bloqueado_hasta && new Date(registro.pin_bloqueado_hasta) > new Date()) {
    return "PIN bloqueado por varios intentos fallidos. Espere unos minutos o pida a soporte que lo restablezca.";
  }
  const pin = String(fd.get("pin") ?? "").trim();
  if (!pin) return "Escriba su PIN para continuar.";
  const servicio = supabaseServicio();
  if (pinCorrecto(pin, registro.pin_hash)) {
    if (registro.pin_intentos > 0) await servicio.from("perfil_seguridad").update({ pin_intentos: 0, pin_bloqueado_hasta: null }).eq("user_id", userId);
    return null;
  }
  const intentos = registro.pin_intentos + 1;
  if (intentos >= MAX_INTENTOS) {
    await servicio
      .from("perfil_seguridad")
      .update({ pin_intentos: 0, pin_bloqueado_hasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60000).toISOString() })
      .eq("user_id", userId);
    return `PIN incorrecto ${MAX_INTENTOS} veces: quedó bloqueado ${MINUTOS_BLOQUEO} minutos.`;
  }
  await servicio.from("perfil_seguridad").update({ pin_intentos: intentos }).eq("user_id", userId);
  return `PIN incorrecto. Le quedan ${MAX_INTENTOS - intentos} intento(s).`;
}


/** Lo mismo que verificarPin, pero vuelve a la pantalla indicada con el error (acciones que redirigen). */
export async function exigirPin(userId: string, fd: FormData, destino: string): Promise<void> {
  const mensaje = await verificarPin(userId, fd);
  if (mensaje) volver(destino, "error", mensaje);
}

/** Comprueba el PIN sin ejecutar ninguna acción (para avisar "PIN correcto" antes de guardar). Cuenta los intentos fallidos igual que exigirPin. */
export async function comprobarPin(userId: string, pin: string): Promise<{ ok: boolean; mensaje: string }> {
  if (!(await pinActivado())) return { ok: true, mensaje: "" };
  let registro: { pin_hash: string | null; pin_intentos: number; pin_bloqueado_hasta: string | null } | null = null;
  try {
    const { data, error } = await supabaseServicio()
      .from("perfil_seguridad")
      .select("pin_hash, pin_intentos, pin_bloqueado_hasta")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: true, mensaje: "" };
    registro = data;
  } catch {
    return { ok: true, mensaje: "" };
  }
  if (!registro?.pin_hash) return { ok: true, mensaje: "" };
  if (registro.pin_bloqueado_hasta && new Date(registro.pin_bloqueado_hasta) > new Date()) {
    return { ok: false, mensaje: "PIN bloqueado por varios intentos fallidos. Espere unos minutos o pida a soporte que lo restablezca." };
  }
  const servicio = supabaseServicio();
  if (/^\d{4,6}$/.test(pin) && pinCorrecto(pin, registro.pin_hash)) {
    if (registro.pin_intentos > 0) await servicio.from("perfil_seguridad").update({ pin_intentos: 0, pin_bloqueado_hasta: null }).eq("user_id", userId);
    return { ok: true, mensaje: "" };
  }
  const intentos = registro.pin_intentos + 1;
  if (intentos >= MAX_INTENTOS) {
    await servicio
      .from("perfil_seguridad")
      .update({ pin_intentos: 0, pin_bloqueado_hasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60000).toISOString() })
      .eq("user_id", userId);
    return { ok: false, mensaje: `PIN incorrecto ${MAX_INTENTOS} veces: quedó bloqueado ${MINUTOS_BLOQUEO} minutos.` };
  }
  await servicio.from("perfil_seguridad").update({ pin_intentos: intentos }).eq("user_id", userId);
  return { ok: false, mensaje: `PIN incorrecto. Le quedan ${MAX_INTENTOS - intentos} intento(s).` };
}

async function pinActivado(): Promise<boolean> {
  try {
    return !!(await obtenerContexto()).mcp?.exigir_pin;
  } catch {
    return false;
  }
}
