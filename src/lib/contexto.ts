import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { supabaseServidor } from "@/lib/supabase/server";

export type Rol = "admin" | "tesorero" | "alcalde" | "contador" | "regidor";

export type Mcp = {
  id: string;
  nombre: string;
  ruc: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  banco_nombre: string;
  banco_cuenta: string | null;
  capitulo1: Record<string, string>;
  estado: string;
};

export type Fuente = {
  id: string;
  mcp_id: string;
  tipo: "distrito" | "provincia";
  municipalidad: string;
  monto_mensual: number;
  formato: "perene" | "chanchamayo" | "general";
  activo: boolean;
};

export type Contexto = {
  userId: string;
  nombre: string;
  esSoporte: boolean;
  mcp: Mcp | null;
  mcps: { id: string; nombre: string }[];
  roles: Rol[];
  /** Cargo como sale en documentos (o el nombre del rol si no se escribió). */
  cargos: string[];
  fuentes: Fuente[];
};

export const COOKIE_MCP = "mcp_actual";

/** Usuario, MCP elegida y roles. Se calcula una vez por petición, con 2 consultas en paralelo. */
export const obtenerContexto = cache(async (): Promise<Contexto> => {
  const supabase = await supabaseServidor();
  const { data: sesion } = await supabase.auth.getClaims();
  const claims = sesion?.claims;
  if (!claims?.sub) redirect("/login");
  const userId = claims.sub;

  const hoy = new Date().toISOString().slice(0, 10);
  const [{ data: perfil }, { data: membresias }, cookieStore] = await Promise.all([
    supabase.from("perfiles").select("nombre, es_soporte").eq("id", userId).single(),
    supabase
      .from("miembros")
      .select("mcp_id, rol, cargo, desde, hasta, mcps(*, fuentes(*))")
      .eq("user_id", userId)
      .eq("activo", true)
      .lte("desde", hoy),
    cookies(),
  ]);

  type McpConFuentes = Mcp & { fuentes: Fuente[] };
  const vigentes = (membresias ?? []).filter((m) => !m.hasta || m.hasta >= hoy);
  const mapa = new Map<string, McpConFuentes>();
  for (const m of vigentes) {
    const mc = m.mcps as unknown as McpConFuentes | null;
    if (mc) mapa.set(mc.id, mc);
  }
  const mcps = [...mapa.values()].map((m) => ({ id: m.id, nombre: m.nombre }));

  const elegida = cookieStore.get(COOKIE_MCP)?.value;
  const mcpId = mcps.find((m) => m.id === elegida)?.id ?? mcps[0]?.id ?? null;
  const completa = mcpId ? mapa.get(mcpId)! : null;
  let mcp: Mcp | null = null;
  let fuentes: Fuente[] = [];
  if (completa) {
    const { fuentes: fs, ...resto } = completa;
    mcp = resto;
    fuentes = (fs ?? []).filter((f) => f.activo).sort((a, b) => a.tipo.localeCompare(b.tipo));
  }

  return {
    userId,
    nombre: perfil?.nombre || (claims.email as string | undefined) || "",
    esSoporte: perfil?.es_soporte ?? false,
    mcp,
    mcps,
    roles: vigentes.filter((m) => m.mcp_id === mcpId).map((m) => m.rol as Rol),
    cargos: vigentes.filter((m) => m.mcp_id === mcpId).map((m) => m.cargo || NOMBRE_ROL[m.rol as Rol]),
    fuentes,
  };
});

/** Exige una MCP elegida; si no hay, manda a la pantalla que corresponda. */
export async function contextoMcp() {
  const ctx = await obtenerContexto();
  if (!ctx.mcp) redirect(ctx.esSoporte ? "/soporte" : "/sin-acceso");
  return ctx as Contexto & { mcp: Mcp };
}

export function tiene(ctx: Contexto, ...roles: Rol[]) {
  return ctx.roles.some((r) => roles.includes(r));
}

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: "Administrador",
  tesorero: "Tesorero(a)",
  alcalde: "Alcalde",
  contador: "Contador(a)",
  regidor: "Regidor(a)",
};
