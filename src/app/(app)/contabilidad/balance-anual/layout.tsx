import ModuloNoHabilitado from "@/components/ModuloNoHabilitado";
import { obtenerContexto } from "@/lib/contexto";
import { tieneModulo } from "@/lib/modulos";

/** Menú habilitado por el superadmin dentro del módulo Contabilidad. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const ctx = await obtenerContexto();
  if (ctx.mcp && !tieneModulo(ctx.mcp, "balance_anual")) return <ModuloNoHabilitado nombre="Balance anual" />;
  return <>{children}</>;
}
