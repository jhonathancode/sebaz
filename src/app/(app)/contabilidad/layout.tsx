import ModuloNoHabilitado from "@/components/ModuloNoHabilitado";
import { obtenerContexto } from "@/lib/contexto";
import { tieneModulo } from "@/lib/modulos";

/** Si el superadmin no habilitó este módulo para la MCP, ninguna de sus pantallas se abre. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const ctx = await obtenerContexto();
  if (ctx.mcp && !tieneModulo(ctx.mcp, "contabilidad")) return <ModuloNoHabilitado nombre="Contabilidad" />;
  return <>{children}</>;
}
