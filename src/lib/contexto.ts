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
  fuentes: Fuente[];
};

export const COOKIE_MCP = "mcp_actual";

/** Usuario, MCP elegida y roles. Se calcula una vez por petición. */
export const obtenerContexto = cache(async (): Promise<Contexto> => {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("perfiles").select("nombre, es_soporte").eq("id", user.id).single();

  const hoy = new Date().toISOString().slice(0, 10);
  const { data: membresias } = await supabase
    .from("miembros")
    .select("mcp_id, rol, desde, hasta, mcps(id, nombre)")
    .eq("user_id", user.id)
    .eq("activo", true)
    .lte("desde", hoy);

  const vigentes = (membresias ?? []).filter((m) => !m.hasta || m.hasta >= hoy);
  const mapa = new Map<string, string>();
  for (const m of vigentes) {
    const mc = m.mcps as unknown as { id: string; nombre: string } | null;
    if (mc) mapa.set(mc.id, mc.nombre);
  }
  const mcps = [...mapa].map(([id, nombre]) => ({ id, nombre }));

  const cookieStore = await cookies();
  const elegida = cookieStore.get(COOKIE_MCP)?.value;
  const mcpId = mcps.find((m) => m.id === elegida)?.id ?? mcps[0]?.id ?? null;

  let mcp: Mcp | null = null;
  let fuentes: Fuente[] = [];
  if (mcpId) {
    const [{ data: datosMcp }, { data: datosFuentes }] = await Promise.all([
      supabase.from("mcps").select("*").eq("id", mcpId).single(),
      supabase.from("fuentes").select("*").eq("mcp_id", mcpId).eq("activo", true).order("tipo"),
    ]);
    mcp = datosMcp as Mcp | null;
    fuentes = (datosFuentes ?? []) as Fuente[];
  }

  return {
    userId: user.id,
    nombre: perfil?.nombre ?? user.email ?? "",
    esSoporte: perfil?.es_soporte ?? false,
    mcp,
    mcps,
    roles: vigentes.filter((m) => m.mcp_id === mcpId).map((m) => m.rol as Rol),
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
