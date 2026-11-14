import ModuloNoHabilitado from "@/components/ModuloNoHabilitado";
import { obtenerContexto } from "@/lib/contexto";

/** El módulo se abre solo si el superadmin lo habilitó expresamente para esta MCP. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const ctx = await obtenerContexto();
  if (ctx.mcp && !ctx.mcp.modulos?.includes("registro_civil")) return <ModuloNoHabilitado nombre="Registro Civil" />;
  return <>{children}</>;
}
