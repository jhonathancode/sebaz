import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";
import { VERSION_TERMINOS } from "@/lib/terminos";

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
  logo_path?: string | null;
  /** Documentos que entrega el proveedor según el tipo de gasto (Configuración; no existe antes de la actualización). */
  sustentos_gasto?: Record<string, string[]> | null;
  /** Módulos habilitados por el superadmin (no existe antes de la actualización). */
  modulos?: string[] | null;
  /** Si la MCP pide el PIN para aprobar y firmar (se activa en Configuración; no existe antes de la actualización). */
  exigir_pin?: boolean | null;
  /** Si la MCP usa la pestaña «Por aprobar». Falso: todo se aprueba solo (no existe antes de la actualización). */
  exigir_aprobacion?: boolean | null;
};

export type Fuente = {
  id: string;
  mcp_id: string;
  tipo: "distrito" | "provincia" | "propios" | "otra";
  municipalidad: string;
  monto_mensual: number;
  formato: "perene" | "chanchamayo" | "general";
  activo: boolean;
  /** Día del mes siguiente hasta el que se entrega la rendición (no existe antes de la actualización). */
  dia_limite?: number | null;
  /** Cada cuánto llega la transferencia y desde qué mes (no existen antes de la actualización). */
  frecuencia?: "mensual" | "trimestral" | "semestral" | "anual" | null;
  mes_inicio?: number | null;
  documento?: string | null;
};

export type Contexto = {
  /** Dueño del sistema: controla clientes, planes y pagos. */
  esSuperadmin: boolean;
  userId: string;
  nombre: string;
  esSoporte: boolean;
  mcp: Mcp | null;
  mcps: { id: string; nombre: string }[];
  roles: Rol[];
  /** Cargo como sale en documentos (o el nombre del rol si no se escribió). */
  cargos: string[];
  fuentes: Fuente[];
  /** Falta aceptar las condiciones de uso o elegir el PIN (primer ingreso). */
  ingresoPendiente: { terminos: boolean; pin: boolean } | null;
};

export const COOKIE_MCP = "mcp_actual";
/** MCP que el superadmin abrió para configurarla. */
export const COOKIE_MCP_ADMIN = "mcp_admin";

/** Usuario, MCP elegida y roles. Se calcula una vez por petición, con 2 consultas en paralelo. */
export const obtenerContexto = cache(async (): Promise<Contexto> => {
  const supabase = await supabaseServidor();
  const { data: sesion } = await supabase.auth.getClaims();
  const claims = sesion?.claims;
  if (!claims?.sub) redirect("/login");
  const userId = claims.sub;

  const hoy = new Date().toISOString().slice(0, 10);
  const [{ data: perfil }, { data: membresias }, cookieStore] = await Promise.all([
    supabase.from("perfiles").select("*").eq("id", userId).single(),
    supabase
      .from("miembros")
      .select("mcp_id, rol, cargo, desde, hasta, mcps(*, fuentes(*))")
      .eq("user_id", userId)
      .eq("activo", true)
      .lte("desde", hoy),
    cookies(),
  ]);

  type McpConFuentes = Mcp & { fuentes: Fuente[] };
  // El dueño del sistema no trabaja dentro de ninguna MCP: solo ve su panel de clientes.
  const esSuperadmin = !!perfil?.es_superadmin;
  const vigentes = esSuperadmin ? [] : (membresias ?? []).filter((m) => !m.hasta || m.hasta >= hoy);
  const mapa = new Map<string, McpConFuentes>();
  for (const m of vigentes) {
    const mc = m.mcps as unknown as McpConFuentes | null;
    if (mc) mapa.set(mc.id, mc);
  }
  // El superadmin puede abrir una MCP para configurarla: entra como administrador de ella
  let mcpAbierta: McpConFuentes | null = null;
  if (esSuperadmin) {
    const abierta = cookieStore.get(COOKIE_MCP_ADMIN)?.value;
    if (abierta && /^[0-9a-f-]{36}$/i.test(abierta)) {
      const { data } = await supabase.from("mcps").select("*, fuentes(*)").eq("id", abierta).maybeSingle();
      if (data) {
        mcpAbierta = data as unknown as McpConFuentes;
        mapa.set(mcpAbierta.id, mcpAbierta);
      }
    }
  }
  const mcps = [...mapa.values()].map((m) => ({ id: m.id, nombre: m.nombre }));

  const elegida = mcpAbierta ? mcpAbierta.id : cookieStore.get(COOKIE_MCP)?.value;
  const mcpId = mcps.find((m) => m.id === elegida)?.id ?? mcps[0]?.id ?? null;
  const completa = mcpId ? mapa.get(mcpId)! : null;
  let mcp: Mcp | null = null;
  let fuentes: Fuente[] = [];
  if (completa) {
    const { fuentes: fs, ...resto } = completa;
    mcp = resto;
    fuentes = (fs ?? []).filter((f) => f.activo).sort((a, b) => a.tipo.localeCompare(b.tipo));
  }

  // Primer ingreso: condiciones de uso y PIN personal (si la base aún no tiene la actualización, no estorba)
  let ingresoPendiente: Contexto["ingresoPendiente"] = null;
  try {
    const { data, error } = await supabaseServicio().from("perfil_seguridad").select("pin_hash, acepto_terminos_en, acepto_version").eq("user_id", userId).maybeSingle();
    if (!error) {
      const terminos = !data?.acepto_terminos_en || data.acepto_version !== VERSION_TERMINOS;
      const pin = !data?.pin_hash && !!mcp?.exigir_pin && !esSuperadmin;
      if (terminos || pin) ingresoPendiente = { terminos, pin };
    }
  } catch {
    ingresoPendiente = null;
  }

  return {
    userId,
    nombre: perfil?.nombre || (claims.email as string | undefined) || "",
    esSoporte: !!(perfil?.es_soporte || perfil?.es_superadmin),
    esSuperadmin,
    mcp,
    mcps,
    roles: mcpAbierta ? (["admin"] as Rol[]) : vigentes.filter((m) => m.mcp_id === mcpId).map((m) => m.rol as Rol),
    cargos: mcpAbierta ? ["Administrador del sistema"] : vigentes.filter((m) => m.mcp_id === mcpId).map((m) => m.cargo || NOMBRE_ROL[m.rol as Rol]),
    fuentes,
    ingresoPendiente,
  };
});

/** Exige una MCP elegida; si no hay, manda a la pantalla que corresponda. */
export async function contextoMcp() {
  const ctx = await obtenerContexto();
  if (!ctx.mcp) redirect(ctx.esSuperadmin ? "/superadmin/inicio" : ctx.esSoporte ? "/soporte" : "/sin-acceso");
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
