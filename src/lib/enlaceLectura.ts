import { createHash, randomBytes } from "crypto";
import { supabaseServicio } from "@/lib/supabase/server";

export const nuevoToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Busca el enlace de solo lectura vigente. Devuelve la municipalidad a la que da acceso, o null. */
export async function enlaceVigente(token: string) {
  if (!/^[\w-]{40,50}$/.test(token)) return null;
  const sb = supabaseServicio();
  const { data } = await sb.from("enlaces_lectura").select("id, nombre, mcp_id, activo, mcps(nombre, ruc)").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || !data.activo) return null;
  await sb.from("enlaces_lectura").update({ ultimo_acceso: new Date().toISOString() }).eq("id", data.id);
  return { id: data.id as string, nombre: data.nombre as string, mcpId: data.mcp_id as string, mcp: data.mcps as unknown as { nombre: string; ruc: string | null } };
}
